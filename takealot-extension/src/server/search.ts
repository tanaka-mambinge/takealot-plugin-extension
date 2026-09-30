import { z } from "zod";

export const searchInputShape = {
  query: z.string().trim().min(1).max(200).describe("The product phrase to search for on Takealot."),
  limit: z.number().int().min(1).max(36).default(36).describe("Maximum number of listings to return (1–36). Defaults to the full search page."),
};

export const searchInput = z.object(searchInputShape);
export type SearchInput = z.infer<typeof searchInput>;

const SEARCH_URL = "https://api.takealot.com/rest/v-1-14-0/searches/products,filters,facets,sort_options,breadcrumbs,slots_audience,context,seo,layout";
const SEARCH_INSTANCE = "63b04484becf69dd89948104f99effc7";

type JsonMap = Record<string, unknown>;

function asMap(value: unknown): JsonMap {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonMap : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function number(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") return Number.parseFloat(value) || 0;
  return 0;
}

function canonicalProductUrl(value: string, plid: string, slug: string): string {
  try {
    const url = new URL(value.startsWith("/") ? `https://www.takealot.com${value}` : value);
    const host = url.hostname.toLowerCase();
    if ((host === "takealot.com" || host === "www.takealot.com") && new RegExp(`/PLID${plid}(?:$|/)`, "i").test(url.pathname)) {
      const segments = url.pathname.split("/");
      if (segments[1]?.toLowerCase() === "product") segments.splice(1, 1);
      url.pathname = segments.join("/");
      url.protocol = "https:";
      url.hostname = "www.takealot.com";
      return url.toString();
    }
  } catch {
    // Build a canonical URL from the API's product id and slug below.
  }
  return slug
    ? `https://www.takealot.com/${encodeURIComponent(slug)}/PLID${plid}`
    : `https://www.takealot.com/PLID${plid}`;
}

function imageUrls(value: unknown): string[] {
  const found = new Set<string>();
  const visit = (node: unknown, key = ""): void => {
    if (typeof node === "string") {
      if (/^https:\/\//i.test(node) && (/(?:media|static|images)\.takealot\.com|\.(?:jpe?g|png|webp|avif)(?:[?#]|$)/i.test(node) || /image/i.test(key))) {
        found.add(node.replaceAll("{size}", "full"));
      }
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((child) => visit(child, key));
      return;
    }
    if (node && typeof node === "object") {
      Object.entries(node).forEach(([childKey, child]) => visit(child, childKey));
    }
  };
  visit(value);
  return [...found].slice(0, 10);
}

function normalizeProduct(viewValue: unknown, resultValue: unknown) {
  const view = asMap(viewValue);
  const result = asMap(resultValue);
  const core = asMap(view.core);
  const buybox = asMap(view.buybox_summary);
  const rating = asMap(view.review_summary);
  const stock = asMap(view.stock_availability_summary);
  const plid = firstString(core.id);
  if (!/^\d+$/.test(plid)) return undefined;
  const gallery = imageUrls(view.gallery);
  for (const candidate of [view.images, view.image, core.image, core.images, core, result.gallery, result.images, result.image, result]) {
    for (const url of imageUrls(candidate)) if (!gallery.includes(url)) gallery.push(url);
  }
  const average = number(rating.star_rating ?? rating.average ?? rating.rating);
  const count = Math.max(0, Math.trunc(number(rating.review_count ?? rating.count ?? rating.total)));
  const available = stock.is_in_stock ?? stock.in_stock ?? stock.is_available ?? stock.available;
  const availability = firstString(stock.status, stock.displayable_text, stock.availability)
    || (typeof available === "boolean" ? (available ? "In stock" : "Unavailable") : undefined);
  const productPath = firstString(core.desktop_href, result.desktop_href, result.href);

  return {
    plid,
    productId: number(buybox.product_id) || undefined,
    title: firstString(core.title, result.title) || "Untitled product",
    subtitle: firstString(core.subtitle, result.subtitle) || undefined,
    brand: firstString(core.brand, result.brand) || undefined,
    url: canonicalProductUrl(productPath, plid, firstString(core.slug)),
    priceDisplay: firstString(buybox.pretty_price, buybox.price, view.price) || undefined,
    availability,
    deliveryDisplay: firstString(stock.estimated_delivery, stock.delivery_date) || undefined,
    rating: { average, count },
    imageUrls: gallery.slice(0, 10),
  };
}

export async function searchTakealot(
  input: SearchInput,
  fetcher: typeof fetch = fetch,
): Promise<{ query: string; returned: number; results: ReturnType<typeof normalizeProduct>[] }> {
  const url = new URL(SEARCH_URL);
  url.searchParams.set("r", "1");
  url.searchParams.set("sb", "1");
  url.searchParams.set("si", SEARCH_INSTANCE);
  url.searchParams.set("qsearch", input.query);
  url.searchParams.set("searchbox", "true");

  let response: Response;
  try {
    response = await fetcher(url, {
      headers: {
        Accept: "application/json",
        Origin: "https://www.takealot.com",
        Referer: "https://www.takealot.com/",
        "User-Agent": "TAL-Android/3.51.0 (fi.android.takealot; build:800735; 14; samsung; SM-S928B; Phone)",
      },
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    throw new Error(`Takealot search request failed: ${error instanceof Error ? error.message : "network error"}`);
  }

  if (!response.ok) throw new Error(`Takealot search returned HTTP ${response.status}.`);
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("Takealot returned an invalid search response.");
  }

  const sections = asMap(asMap(payload).sections);
  const products = asMap(sections.products);
  const rawResults = asArray(products.results);
  const results = rawResults
    .map((entry) => normalizeProduct(asMap(entry).product_views, entry))
    .filter((product): product is NonNullable<typeof product> => Boolean(product))
    .slice(0, input.limit);
  return { query: input.query, returned: results.length, results };
}
