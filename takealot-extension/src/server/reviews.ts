import { z } from "zod";

export const reviewInputShape = {
  plid: z.string().trim().regex(/^\d{1,12}$/).describe("The numeric PLID from a Takealot search result (not productId)."),
  rating: z.number().int().min(1).max(5).optional().describe("Optionally filter to one star rating."),
  sort: z.enum(["helpful", "latest"]).default("helpful").describe("Most helpful reviews or newest reviews."),
  page: z.number().int().min(0).max(1000).default(0).describe("Zero-based review page; each page contains at most 10 reviews."),
};
export const reviewInput = z.object(reviewInputShape);
export type ReviewInput = z.infer<typeof reviewInput>;

const API_BASE = "https://api.takealot.com/rest/v-1-16-0";
type JsonMap = Record<string, unknown>;

function asMap(value: unknown): JsonMap {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonMap : {};
}

function string(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function number(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function reviewText(review: JsonMap): string {
  const text = review.text;
  const body = typeof text === "string" ? text : string(asMap(text).body) || string(review.body);
  return body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 3000);
}

export async function getTakealotReviews(input: ReviewInput, fetcher: typeof fetch = fetch) {
  const url = new URL(`${API_BASE}/product-reviews/plid/${input.plid}`);
  if (input.rating) url.searchParams.set("rating", String(input.rating));
  if (input.sort === "latest") url.searchParams.set("sort", "SO_LATEST");
  if (input.page > 0) url.searchParams.set("page", String(input.page));

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
    throw new Error(`Takealot reviews request failed: ${error instanceof Error ? error.message : "network error"}`);
  }
  if (!response.ok) throw new Error(`Takealot reviews returned HTTP ${response.status}.`);

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("Takealot returned an invalid reviews response.");
  }
  const body = asMap(payload);
  const page = asMap(body.page_info);
  const reviews = (Array.isArray(body.reviews) ? body.reviews : []).slice(0, 10).map((entry) => {
    const review = asMap(entry);
    const variant = asMap(review.variant_info);
    return {
      rating: Math.max(0, Math.min(5, Math.trunc(number(review.rating)))),
      text: reviewText(review),
      date: string(review.date ?? review.created_at) || undefined,
      helpfulVotes: Math.max(0, Math.trunc(number(review.num_upvotes ?? review.upvotes))),
      variant: Object.fromEntries(Object.entries(variant)
        .filter(([key, value]) => !/customer|user|reviewer|signature|uuid|id/i.test(key) && typeof value === "string" && value.length <= 120)),
      timeAfterPurchase: string(review.time_after_purchase) || undefined,
    };
  });
  return {
    plid: input.plid,
    total: Math.max(0, Math.trunc(number(page.total))),
    page: Math.max(0, Math.trunc(number(page.current_page ?? input.page))),
    pageSize: Math.min(10, Math.max(0, Math.trunc(number(page.page_size))) || 10),
    totalPages: Math.max(0, Math.trunc(number(page.total_pages))),
    sort: input.sort,
    ratingFilter: input.rating,
    reviews,
  };
}
