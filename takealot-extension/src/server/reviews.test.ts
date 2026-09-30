import assert from "node:assert/strict";
import test from "node:test";
import { getTakealotReviews, reviewInput } from "./reviews.ts";

test("fetches normalized review samples and excludes reviewer identity", async () => {
  const input = reviewInput.parse({ plid: "66383997", rating: 1, sort: "latest" });
  let requested: URL | undefined;
  const result = await getTakealotReviews(input, async (value) => {
    requested = new URL(value.toString());
    return new Response(JSON.stringify({
      page_info: { total: 47, total_pages: 5, current_page: 0, page_size: 10 },
      reviews: [{
        rating: 1,
        text: { body: "Faulty <b>after</b> two weeks" },
        date: "2026-09-01",
        num_upvotes: 8,
        customer_name: "Private Name",
        customer_id: 123,
        signature: "private-signature",
        variant_info: { colour: "Black", customer_id: 456 },
      }],
    }), { status: 200 });
  });
  assert.equal(requested?.pathname, "/rest/v-1-16-0/product-reviews/plid/66383997");
  assert.equal(requested?.searchParams.get("rating"), "1");
  assert.equal(requested?.searchParams.get("sort"), "SO_LATEST");
  assert.deepEqual(result.reviews[0], {
    rating: 1,
    text: "Faulty after two weeks",
    date: "2026-09-01",
    helpfulVotes: 8,
    variant: { colour: "Black" },
    timeAfterPurchase: undefined,
  });
  assert.equal(JSON.stringify(result).includes("Private Name"), false);
  assert.equal(JSON.stringify(result).includes("private-signature"), false);
});

test("validates PLIDs and surfaces Takealot review errors", async () => {
  assert.throws(() => reviewInput.parse({ plid: "https://www.takealot.com/PLID123" }));
  await assert.rejects(
    getTakealotReviews(reviewInput.parse({ plid: "123" }), async () => new Response("", { status: 503 })),
    /Takealot reviews returned HTTP 503/,
  );
});
