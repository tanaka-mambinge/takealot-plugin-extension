import assert from "node:assert/strict";
import test from "node:test";
import { searchInput, searchTakealot } from "./search.ts";

const sampleResponse = {
  sections: {
    products: {
      results: [{
        product_views: {
          core: {
            id: 66383997,
            title: "Volkano Scorpio True Wireless Earphones",
            subtitle: "True wireless earphones",
            brand: "Volkano",
            desktop_href: "/product/volkano-scorpio/PLID66383997",
            image_url: "https://images.takealot.com/scorpio?size=large",
          },
          gallery: { images: [{ url: "https://media.takealot.com/images/earbuds.jpg" }, { src: "https://static.takealot.com/scorpio/main" }] },
          buybox_summary: { product_id: 90401948, pretty_price: "R 299" },
          review_summary: { star_rating: 4.7, review_count: 3044 },
          stock_availability_summary: { status: "In stock" },
        },
      }],
    },
  },
};

test("searches the Takealot catalogue and normalizes its product results", async () => {
  assert.equal(searchInput.parse({ query: "wireless headphones" }).limit, 36);
  let requested: URL | undefined;
  const result = await searchTakealot(
    searchInput.parse({ query: "wireless headphones & earbuds" }),
    async (input) => {
      requested = new URL(input.toString());
      return new Response(JSON.stringify(sampleResponse), { status: 200 });
    },
  );

  assert.equal(requested?.hostname, "api.takealot.com");
  assert.equal(requested?.searchParams.get("qsearch"), "wireless headphones & earbuds");
  assert.equal(requested?.searchParams.get("searchbox"), "true");
  assert.deepEqual(result, {
    query: "wireless headphones & earbuds",
    returned: 1,
    results: [{
      plid: "66383997",
      productId: 90401948,
      title: "Volkano Scorpio True Wireless Earphones",
      subtitle: "True wireless earphones",
      brand: "Volkano",
      url: "https://www.takealot.com/volkano-scorpio/PLID66383997",
      priceDisplay: "R 299",
      availability: "In stock",
      deliveryDisplay: undefined,
      rating: { average: 4.7, count: 3044 },
      imageUrls: ["https://media.takealot.com/images/earbuds.jpg", "https://static.takealot.com/scorpio/main", "https://images.takealot.com/scorpio?size=large"],
    }],
  });
});

test("returns an empty list when Takealot has no products", async () => {
  const result = await searchTakealot(
    searchInput.parse({ query: "rare product" }),
    async () => new Response(JSON.stringify({ sections: { products: { results: [] } } }), { status: 200 }),
  );
  assert.equal(result.returned, 0);
  assert.deepEqual(result.results, []);
});

test("surfaces Takealot API failures without a web-search fallback", async () => {
  await assert.rejects(
    searchTakealot(searchInput.parse({ query: "headphones" }), async () => new Response("", { status: 503 })),
    /Takealot search returned HTTP 503/,
  );
});
