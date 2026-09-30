import type { SessionStore, TakealotSession } from "./session-store.ts";

const API_BASE = "https://api.takealot.com/rest/v-1-16-0";
const USER_AGENT = "TAL-Android/4.2.1 (fi.android.takealot; build:800749; 16; samsung; SM-A356E; Phone)";

type JsonMap = Record<string, unknown>;
type HttpResult = { status: number; body: JsonMap; cookies: Record<string, string> };

function asMap(value: unknown): JsonMap {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonMap : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function firstArray(...values: unknown[]): unknown[] {
  return values.find(Array.isArray) as unknown[] | undefined ?? [];
}

function str(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function num(value: unknown): number | undefined {
  const result = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isSafeInteger(result) && result > 0 ? result : undefined;
}

function recordCookies(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  const setCookies = typeof headers.getSetCookie === "function" ? headers.getSetCookie() : [headers.get("set-cookie") ?? ""];
  for (const entry of setCookies) {
    const part = entry.split(";", 1)[0] ?? "";
    const delimiter = part.indexOf("=");
    if (delimiter > 0) result[part.slice(0, delimiter).trim()] = part.slice(delimiter + 1).trim();
  }
  return result;
}

function authInfo(body: JsonMap): JsonMap {
  const data = asMap(body.data);
  return asMap(body.auth_info ?? data.auth_info ?? body.data);
}

function sessionFrom(body: JsonMap, cookies: Record<string, string>, previous?: TakealotSession): TakealotSession | undefined {
  const info = authInfo(body);
  const jwt = str(info.jwt) || previous?.jwt || "";
  const refreshToken = str(info.refresh_token) || previous?.refreshToken || "";
  const customerId = str(info.customer_id) || previous?.customerId || "";
  if (!jwt || !refreshToken || !customerId) return undefined;
  const sessionCookies = { ...(previous?.cookies ?? {}), ...cookies };
  const idToken = str(info.id_token) || previous?.idToken;
  const csrfToken = str(info.csrf_token) || previous?.csrfToken;
  const trackingId = str(info.tracking_id) || previous?.trackingId;
  const did = str(info.did) || previous?.did;
  const jwtExpiry = str(info.jwt_expires, info.jwt_expires_at) || previous?.jwtExpiresAt;
  const refreshExpiry = str(info.refresh_token_expires, info.refresh_token_expires_at) || previous?.refreshTokenExpiresAt;
  return {
    jwt,
    refreshToken,
    customerId,
    ...(idToken ? { idToken } : {}),
    ...(csrfToken ? { csrfToken } : {}),
    ...(trackingId ? { trackingId } : {}),
    ...(did ? { did } : {}),
    ...(jwtExpiry ? { jwtExpiresAt: jwtExpiry } : {}),
    ...(refreshExpiry ? { refreshTokenExpiresAt: refreshExpiry } : {}),
    cookies: sessionCookies,
  };
}

function hasOtpChallenge(body: JsonMap): boolean {
  const value = body.two_step_verification ?? asMap(body.data).two_step_verification;
  if (value === true) return true;
  const challenge = str(value).toLowerCase();
  return Boolean(challenge && challenge !== "disabled" && challenge !== "false");
}

function expiryMillis(value?: string): number {
  if (!value) return NaN;
  if (/^\d+$/.test(value)) {
    const numeric = Number(value);
    return numeric > 1e12 ? numeric : numeric * 1000;
  }
  return Date.parse(value);
}

export class OtpRequiredError extends Error {
  constructor() {
    super("Takealot requested a one-time password.");
    this.name = "OtpRequiredError";
  }
}

function apiFailure(status: number, bodyText: string): Error {
  const lower = bodyText.toLowerCase();
  if (lower.includes("challenge-platform") || lower.includes("just a moment")) {
    return new Error("Takealot’s security check blocked the request. Try again later.");
  }
  const code = status === 401 ? "Your Takealot session is not valid." : status === 403 ? "Takealot refused this request." : status === 429 ? "Takealot rate-limited the request. Try again later." : `Takealot returned HTTP ${status}.`;
  return new Error(code);
}

function parseProductPLID(reference: string): string {
  const value = reference.trim();
  if (/^\d+$/.test(value)) return value;
  const prefixed = /^PLID(\d+)$/i.exec(value);
  if (prefixed) return prefixed[1]!;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Use a Takealot product link or PLID to add a product.");
  }
  if (url.protocol !== "https:" || !["takealot.com", "www.takealot.com"].includes(url.hostname.toLowerCase())) {
    throw new Error("Product links must point to Takealot.");
  }
  const match = /(?:^|\/)PLID(\d+)(?:\/|$)/i.exec(url.pathname);
  if (!match) throw new Error("The Takealot link does not contain a product PLID.");
  return match[1]!;
}

export type WishlistGroup = { groupId: string; name: string; itemCount: number };
export type WishlistItem = { plid?: string; title: string; url?: string; imageUrl?: string };

export class TakealotAccountClient {
  private readonly fetcher: typeof fetch;
  private readonly base: string;
  private refreshPromise?: Promise<TakealotSession>;
  private readonly store: SessionStore;

  constructor(store: SessionStore, options: { fetcher?: typeof fetch; base?: string } = {}) {
    this.store = store;
    this.fetcher = options.fetcher ?? fetch;
    this.base = (options.base ?? API_BASE).replace(/\/$/, "");
  }

  async status(): Promise<{ authenticated: boolean }> {
    return { authenticated: Boolean(await this.store.load()) };
  }

  async logout(): Promise<{ loggedOut: true }> {
    await this.store.delete();
    return { loggedOut: true };
  }

  async beginLogin(email: string, password: string): Promise<{ authenticated: true } | { otpRequired: true; cookies: Record<string, string> }> {
    if (!email.trim() || !password) throw new Error("Enter your email address and password.");
    const response = await this.request("POST", "/customers/login", {
      platform: "android",
      sections: [{ section_id: "customer_login", fields: [
        { field_id: "email", value: email.trim() },
        { field_id: "password", value: password },
        { field_id: "captcha", value: "" },
      ] }],
    });
    const session = sessionFrom(response.body, response.cookies);
    if (session) {
      await this.store.save(session);
      return { authenticated: true };
    }
    if (hasOtpChallenge(response.body)) return { otpRequired: true, cookies: response.cookies };
    throw new Error("Takealot sign-in failed. Check the details and try again.");
  }

  async finishLogin(email: string, password: string, otp: string, cookies: Record<string, string>, trustDevice = true): Promise<{ authenticated: true }> {
    if (!email.trim() || !password || !otp.trim()) throw new Error("Enter the one-time password from Takealot.");
    const response = await this.request("POST", "/customers/login", {
      platform: "android",
      sections: [
        { section_id: "customer_login", fields: [
          { field_id: "email", value: email.trim() },
          { field_id: "password", value: password },
          { field_id: "captcha", value: "" },
        ] },
        { section_id: "two_step_verification", fields: [
          { field_id: "otp", value: otp.trim() },
          { field_id: "trust_this_device", value: trustDevice },
        ] },
      ],
    }, { jwt: "", refreshToken: "", customerId: "", cookies });
    const session = sessionFrom(response.body, { ...cookies, ...response.cookies });
    if (!session) throw new Error("Takealot sign-in failed. Check the one-time password and try again.");
    await this.store.save(session);
    return { authenticated: true };
  }

  async listWishlists(): Promise<{ groups: WishlistGroup[] }> {
    const { body } = await this.authenticated("GET", "/customers/{customerId}/wishlists");
    const container = asMap(body.data ?? body.result ?? body);
    const groups = firstArray(body.wishlists, body.groups, body.items, container.wishlists, container.groups, container.items, body.data).map((value) => {
      const group = asMap(value);
      const groupId = str(group.group_id, group.groupId, group.id);
      const name = str(group.name, group.title);
      if (!groupId || !name) return undefined;
      const itemCount = Number(group.item_count ?? group.count ?? 0);
      return { groupId, name, itemCount: Number.isFinite(itemCount) ? Math.max(0, Math.trunc(itemCount)) : 0 };
    }).filter((group): group is WishlistGroup => Boolean(group));
    return { groups };
  }

  async wishlistItems(groupId: string): Promise<{ groupId: string; name: string; items: WishlistItem[] }> {
    const id = this.requireGroupId(groupId);
    const { body } = await this.authenticated("GET", `/customers/{customerId}/wishlists/${encodeURIComponent(id)}/items`);
    const container = asMap(body.data ?? body.wishlist ?? body);
    const items = firstArray(body.items, body.products, container.items, container.products, body.data).map((value) => {
      const item = asMap(value);
      const plid = str(item.plid, item.plid_id);
      const productUrl = str(item.url, item.desktop_href, item.href);
      return {
        ...(plid ? { plid } : {}),
        title: str(item.title, item.name) || "Untitled product",
        ...(productUrl ? { url: productUrl } : {}),
        ...(str(item.image_url, item.image) ? { imageUrl: str(item.image_url, item.image) } : {}),
      };
    });
    return { groupId: id, name: str(container.name) || id, items };
  }

  async createWishlist(name: string): Promise<WishlistGroup> {
    const cleanName = name.trim();
    if (!cleanName || cleanName.length > 100) throw new Error("Wishlist name must be between 1 and 100 characters.");
    const { body } = await this.authenticated("POST", "/customers/{customerId}/wishlists", { name: cleanName });
    return this.normalizeGroup(asMap(body.wishlist ?? body.data ?? body), cleanName);
  }

  async renameWishlist(groupId: string, name: string): Promise<WishlistGroup> {
    const id = this.requireGroupId(groupId);
    const cleanName = name.trim();
    if (!cleanName || cleanName.length > 100) throw new Error("Wishlist name must be between 1 and 100 characters.");
    const { body } = await this.authenticated("PUT", `/customers/{customerId}/wishlists/${encodeURIComponent(id)}`, { name: cleanName });
    return this.normalizeGroup(asMap(body.wishlist ?? body.data ?? body), cleanName, id);
  }

  async deleteWishlist(groupId: string): Promise<{ deleted: true; groupId: string }> {
    const id = this.requireGroupId(groupId);
    await this.authenticated("DELETE", `/customers/{customerId}/wishlists/${encodeURIComponent(id)}`);
    return { deleted: true, groupId: id };
  }

  async addProduct(groupId: string, reference: string, searchedProduct?: { productId?: number; title?: string }): Promise<{ added: true; groupId: string; title: string; plid: string }> {
    const id = this.requireGroupId(groupId);
    const plid = parseProductPLID(reference);
    let details: HttpResult | undefined;
    let productId = num(searchedProduct?.productId);
    if (!productId) {
      details = await this.request("GET", `/product-details/PLID${plid}?platform=android&show_takealot_now_alt=false&offer_opt=true`);
      const buybox = asMap(details.body.buybox);
      const items = asArray(buybox.items ?? buybox.buybox_items);
      const selected = asMap(items.find((item) => asMap(item).is_selected) ?? items[0]);
      productId = num(buybox.product_id) ?? num(selected.product_id) ?? num(buybox.id);
    }
    if (!productId) throw new Error("Takealot did not provide the product ID needed to add this listing to a wishlist.");
    const productTitle = str(searchedProduct?.title, details?.body.title, asMap(details?.body.core).title) || `PLID${plid}`;
    const session = await this.requireSession();
    await this.authenticated("PUT", `/customers/${encodeURIComponent(session.customerId)}/wishlists/items/pid/${productId}`, { reset: false, groups: [Number(id)] });
    return { added: true, groupId: id, title: productTitle, plid };
  }

  async removeProduct(reference: string): Promise<{ removed: true; plid: string }> {
    const plid = parseProductPLID(reference);
    const details = await this.request("GET", `/product-details/PLID${plid}?platform=android&show_takealot_now_alt=false&offer_opt=true`);
    const buybox = asMap(details.body.buybox);
    const selected = asMap(asArray(buybox.items ?? buybox.buybox_items).find((item) => asMap(item).is_selected) ?? asArray(buybox.items ?? buybox.buybox_items)[0]);
    const productId = num(buybox.product_id) ?? num(selected.product_id) ?? num(buybox.id);
    if (!productId) throw new Error("Takealot did not provide the product ID needed to remove this listing from wishlists.");
    const session = await this.requireSession();
    await this.authenticated("DELETE", `/customers/${encodeURIComponent(session.customerId)}/wishlists/items/pid/${productId}`);
    return { removed: true, plid };
  }

  private normalizeGroup(raw: JsonMap, fallbackName: string, fallbackId = ""): WishlistGroup {
    const groupId = str(raw.group_id, raw.groupId, raw.id) || fallbackId;
    if (!groupId) throw new Error("Takealot created the wishlist but did not return its group ID. Refresh the wishlist list to confirm.");
    const itemCount = Number(raw.item_count ?? raw.count ?? 0);
    return { groupId, name: str(raw.name, raw.title) || fallbackName, itemCount: Number.isFinite(itemCount) ? Math.max(0, Math.trunc(itemCount)) : 0 };
  }

  private requireGroupId(value: string): string {
    const id = value.trim();
    if (!/^\d+$/.test(id) || Number(id) <= 0) throw new Error("Choose a valid wishlist group.");
    return id;
  }

  private async requireSession(): Promise<TakealotSession> {
    const session = await this.store.load();
    if (!session) throw new Error("Sign in to Takealot from the panel before using wishlists.");
    return session;
  }

  private async authenticated(method: string, path: string, body?: unknown): Promise<HttpResult> {
    const session = await this.requireSession();
    const pathForSession = path.replace("{customerId}", encodeURIComponent(session.customerId));
    const expiry = expiryMillis(session.jwtExpiresAt);
    let active = Number.isFinite(expiry) && expiry < Date.now() + 60_000 ? await this.refresh(session) : session;
    let result = await this.request(method, pathForSession, body, active, false);
    if (result.status === 401) {
      active = await this.refresh(active);
      result = await this.request(method, pathForSession, body, active, false);
    }
    if (result.status < 200 || result.status >= 300) throw apiFailure(result.status, "");
    if (Object.keys(result.cookies).length) {
      active = { ...active, cookies: { ...(active.cookies ?? {}), ...result.cookies } };
      await this.store.save(active);
    }
    return result;
  }

  private async refresh(previous: TakealotSession): Promise<TakealotSession> {
    if (!this.refreshPromise) {
      this.refreshPromise = (async () => {
        const { body, cookies } = await this.request("POST", "/customers/auth/refresh", {
          platform: "android",
          refresh_token: previous.refreshToken,
          tracking_id: previous.trackingId ?? "",
        }, previous);
        const next = sessionFrom(body, cookies, previous);
        if (!next) throw new Error("Takealot could not refresh the session. Sign in again.");
        await this.store.save(next);
        return next;
      })().finally(() => { this.refreshPromise = undefined; });
    }
    return this.refreshPromise;
  }

  private async request(method: string, path: string, body?: unknown, session?: TakealotSession, failOnHttp = true): Promise<HttpResult> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/json",
      Origin: "https://www.takealot.com",
      Referer: "https://www.takealot.com/",
      "User-Agent": USER_AGENT,
      "X-Tal-Platform": "android",
    };
    if (session) {
      if (session.jwt) headers.Authorization = `Bearer ${session.jwt}`;
      if (session.csrfToken) headers["X-CSRF-Token"] = session.csrfToken;
      const cookies = { ...(session.cookies ?? {}), ...(session.idToken ? { taid: session.idToken } : {}), ...(session.jwt ? { tal_jwt: session.jwt } : {}), ...(session.csrfToken ? { tal_csrf: session.csrfToken } : {}), ...(session.did ? { did: session.did } : {}) };
      const cookieString = Object.entries(cookies).map(([name, value]) => `${name}=${value}`).join("; ");
      if (cookieString) headers.Cookie = cookieString;
    }
    let response: Response;
    try {
      response = await this.fetcher(`${this.base}${path.startsWith("/") ? "" : "/"}${path}`, {
        method,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      throw new Error(`Takealot request failed: ${error instanceof Error ? error.message : "network error"}`);
    }
    const cookies = recordCookies(response.headers);
    const text = await response.text();
    let data: JsonMap = {};
    if (text) {
      try { data = asMap(JSON.parse(text)); }
      catch { if (response.ok) throw new Error("Takealot returned an invalid response."); }
    }
    if (failOnHttp && !response.ok) throw apiFailure(response.status, text);
    return { status: response.status, body: data, cookies };
  }
}
