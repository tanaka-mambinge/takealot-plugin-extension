import assert from "node:assert/strict";
import test from "node:test";
import { TakealotAccountClient } from "./account.ts";
import { LocalLoginFlow } from "./login-flow.ts";
import { SystemSessionStore, type SessionStore, type TakealotSession } from "./session-store.ts";

class MemoryStore implements SessionStore {
  session?: TakealotSession;
  async load() { return this.session; }
  async save(session: TakealotSession) { this.session = session; }
  async delete() { this.session = undefined; }
}

const originalSession: TakealotSession = {
  jwt: "jwt-old",
  refreshToken: "refresh-old",
  customerId: "42",
  jwtExpiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
};

function jsonResponse(body: unknown, status = 200, headers?: HeadersInit) {
  return new Response(JSON.stringify(body), { status, headers });
}

test("keeps the product PLID separate from product_id when adding to a wishlist", async () => {
  const store = new MemoryStore();
  store.session = { ...originalSession };
  const requests: Array<{ url: URL; init: RequestInit }> = [];
  const api = new TakealotAccountClient(store, {
    base: "https://api.takealot.com/rest/test",
    fetcher: async (input, init = {}) => {
      const url = new URL(input.toString());
      requests.push({ url, init });
      if (url.pathname.endsWith("/product-details/PLID123")) return jsonResponse({ title: "Wheel", buybox: { product_id: 456 } });
      if (url.pathname.endsWith("/wishlists/items/pid/456")) return jsonResponse({ ok: true });
      return jsonResponse({}, 404);
    },
  });

  const result = await api.addProduct("7", "https://www.takealot.com/wheel/PLID123");
  assert.deepEqual(result, { added: true, groupId: "7", title: "Wheel", plid: "123" });
  assert.ok(requests.some(({ url }) => url.pathname.endsWith("/product-details/PLID123")));
  const write = requests.find(({ url }) => url.pathname.endsWith("/wishlists/items/pid/456"));
  assert.ok(write);
  assert.equal(write.url.pathname.includes("PLID123"), false);
  assert.deepEqual(JSON.parse(String(write.init.body)), { reset: false, groups: [7] });
  assert.equal((write.init.headers as Record<string, string>).Authorization, "Bearer jwt-old");
});

test("uses the numeric product ID from cached search results without resolving product details again", async () => {
  const store = new MemoryStore();
  store.session = { ...originalSession };
  const requests: string[] = [];
  const api = new TakealotAccountClient(store, {
    base: "https://api.takealot.com/rest/test",
    fetcher: async (input, init = {}) => {
      const url = new URL(input.toString());
      requests.push(`${init.method ?? "GET"} ${url.pathname}`);
      if (url.pathname.endsWith("/wishlists/items/pid/456")) return jsonResponse({ ok: true });
      return jsonResponse({}, 404);
    },
  });

  const result = await api.addProduct("7", "https://www.takealot.com/wheel/PLID123", {
    productId: 456,
    title: "Wheel",
  });

  assert.deepEqual(result, { added: true, groupId: "7", title: "Wheel", plid: "123" });
  assert.equal(requests.some((request) => request.includes("/product-details/")), false);
  assert.ok(requests.includes("PUT /rest/test/customers/42/wishlists/items/pid/456"));
});

test("refreshes once after an unauthorized wishlist request and replaces rotated tokens", async () => {
  const store = new MemoryStore();
  store.session = { ...originalSession };
  const seen: Array<{ path: string; authorization?: string; body?: string }> = [];
  const api = new TakealotAccountClient(store, {
    base: "https://api.takealot.com/rest/test",
    fetcher: async (input, init = {}) => {
      const url = new URL(input.toString());
      const headers = init.headers as Record<string, string> | undefined;
      seen.push({ path: url.pathname, authorization: headers?.Authorization, body: typeof init.body === "string" ? init.body : undefined });
      if (url.pathname.endsWith("/customers/42/wishlists") && headers?.Authorization === "Bearer jwt-old") return jsonResponse({}, 401);
      if (url.pathname.endsWith("/customers/auth/refresh")) return jsonResponse({ auth_info: { jwt: "jwt-new", refresh_token: "refresh-new" } });
      if (url.pathname.endsWith("/customers/42/wishlists")) return jsonResponse({ wishlists: [{ group_id: 7, name: "Sim rig", item_count: 2 }] });
      return jsonResponse({}, 404);
    },
  });

  const result = await api.listWishlists();
  assert.deepEqual(result, { groups: [{ groupId: "7", name: "Sim rig", itemCount: 2 }] });
  assert.equal(seen.filter((entry) => entry.path.endsWith("/customers/auth/refresh")).length, 1);
  assert.equal(seen.at(-1)?.authorization, "Bearer jwt-new");
  assert.equal(store.session?.refreshToken, "refresh-new");
});

test("supports wishlist reads and group mutations through the authenticated API", async () => {
  const store = new MemoryStore();
  store.session = { ...originalSession };
  const seen: string[] = [];
  const api = new TakealotAccountClient(store, {
    base: "https://api.takealot.com/rest/test",
    fetcher: async (input, init = {}) => {
      const url = new URL(input.toString());
      seen.push(`${init.method ?? "GET"} ${url.pathname}`);
      if (url.pathname.endsWith("/wishlists") && init.method === "POST") return jsonResponse({ wishlist: { group_id: 9, name: "New list" } });
      if (url.pathname.endsWith("/wishlists") && init.method === "GET") return jsonResponse({ wishlists: [{ group_id: 3, name: "Desk", item_count: 1 }] });
      if (url.pathname.endsWith("/wishlists/3/items")) return jsonResponse({ wishlist: { name: "Desk" }, items: [{ plid: "123", title: "Monitor" }] });
      if (init.method === "PUT") return jsonResponse({ wishlist: { group_id: 3, name: "Renamed" } });
      return jsonResponse({}, 200);
    },
  });

  assert.deepEqual(await api.listWishlists(), { groups: [{ groupId: "3", name: "Desk", itemCount: 1 }] });
  assert.deepEqual(await api.wishlistItems("3"), { groupId: "3", name: "Desk", items: [{ plid: "123", title: "Monitor" }] });
  assert.equal((await api.createWishlist("New list")).groupId, "9");
  assert.equal((await api.renameWishlist("3", "Renamed")).name, "Renamed");
  assert.deepEqual(await api.deleteWishlist("3"), { deleted: true, groupId: "3" });
  assert.ok(seen.includes("GET /rest/test/customers/42/wishlists/3/items"));
  assert.ok(seen.includes("DELETE /rest/test/customers/42/wishlists/3"));
});

test("runs sign-in and OTP through the temporary loopback page without exposing credentials in tool output", async () => {
  const store = new MemoryStore();
  const seen: Array<{ body: string; cookie?: string }> = [];
  let loginCount = 0;
  const api = new TakealotAccountClient(store, {
    base: "https://api.takealot.com/rest/test",
    fetcher: async (_input, init = {}) => {
      seen.push({ body: String(init.body ?? ""), cookie: (init.headers as Record<string, string>)?.Cookie });
      loginCount += 1;
      if (loginCount === 1) return jsonResponse({ two_step_verification: "enabled" }, 200, { "set-cookie": "__cf_bm=challenge; Path=/; Secure" });
      return jsonResponse({ auth_info: { jwt: "jwt-secret", refresh_token: "refresh-secret", customer_id: "42" } });
    },
  });
  const flow = new LocalLoginFlow(api);
  const { url } = await flow.start();
  const formUrl = new URL(url);
  assert.equal(formUrl.hostname, "127.0.0.1");
  assert.equal(formUrl.searchParams.has("password"), false);
  const firstPage = await fetch(url);
  assert.equal(firstPage.status, 200);
  const loginHtml = await firstPage.text();
  assert.match(loginHtml, /Connect your Takealot account/);
  assert.match(loginHtml, /alt="Takealot"/);
  assert.match(loginHtml, /data:image\/svg\+xml;base64,/);
  assert.match(firstPage.headers.get("content-security-policy") ?? "", /img-src data:/);
  const firstForm = new URLSearchParams({ email: "user@example.com", password: "secret-password" });
  const otpPage = await fetch(url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: firstForm });
  assert.equal(otpPage.status, 200);
  assert.match(await otpPage.text(), /one-time password/i);
  const secondForm = new URLSearchParams({ step: "otp", otp: "123456", trust: "true" });
  const successPage = await fetch(url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: secondForm });
  assert.equal(successPage.status, 200);
  assert.match(await successPage.text(), /Takealot connected/);
  assert.equal(seen.length, 2);
  assert.match(seen[0]!.body, /secret-password/);
  assert.equal(seen[1]!.cookie, "__cf_bm=challenge");
  assert.equal((await store.load())?.jwt, "jwt-secret");
});

test("signs out and deletes the local session only when the temporary browser link is opened", async () => {
  const store = new MemoryStore();
  store.session = { ...originalSession };
  const api = new TakealotAccountClient(store, { fetcher: async () => { throw new Error("Unexpected API request"); } });
  const flow = new LocalLoginFlow(api);
  const { url } = await flow.startLogout();
  const logoutUrl = new URL(url);
  assert.equal(logoutUrl.hostname, "127.0.0.1");
  assert.equal(logoutUrl.pathname, "/takealot-extension-logout");
  assert.ok(logoutUrl.searchParams.get("token"));
  assert.ok(await store.load());

  const invalidUrl = new URL(url);
  invalidUrl.searchParams.set("token", "invalid-token");
  const invalidResponse = await fetch(invalidUrl);
  assert.equal(invalidResponse.status, 404);
  assert.ok(await store.load());

  const response = await fetch(url);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Signed out/);
  assert.equal(await store.load(), undefined);
});

test("fails closed when the operating-system password vault is unavailable", async () => {
  const unavailableStore = new SystemSessionStore(async () => { throw new Error("No secret service available"); });
  await assert.rejects(unavailableStore.save({ ...originalSession }), /Could not save the session in the system password vault/);
  await assert.rejects(unavailableStore.load(), /Could not read the system password vault/);
  const emptyStore = new SystemSessionStore(async () => { throw new Error("Object does not exist at path"); });
  assert.equal(await emptyStore.load(), undefined);
});
