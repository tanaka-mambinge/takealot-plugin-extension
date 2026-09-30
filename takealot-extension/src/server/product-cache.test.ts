import assert from "node:assert/strict";
import test from "node:test";
import { SearchProductCache } from "./product-cache.ts";

test("restores Takealot images omitted by the model when preparing panel results", () => {
  const cache = new SearchProductCache<{ plid: string; url: string; title: string; imageUrls: string[] }>();
  cache.remember([{
    plid: "12345",
    url: "https://www.takealot.com/headphones/PLID12345",
    title: "Wireless headphones",
    imageUrls: ["https://static.takealot.com/headphones/main"],
  }]);

  const groups = cache.hydrate([{
    title: "Headphones",
    products: [{ url: "https://www.takealot.com/other-slug/PLID12345", title: "Wireless headphones" }],
  }]);
  assert.deepEqual(groups?.[0]?.products[0], {
    plid: "12345",
    url: "https://www.takealot.com/other-slug/PLID12345",
    title: "Wireless headphones",
    imageUrls: ["https://static.takealot.com/headphones/main"],
  });
});

test("preserves model review notes and explicit non-empty image choices", () => {
  const cache = new SearchProductCache<{ plid: string; url: string; imageUrls: string[]; title: string }>();
  cache.remember([{ plid: "67890", url: "https://www.takealot.com/a/PLID67890", title: "A", imageUrls: ["https://media.takealot.com/a.jpg"] }]);
  const hydrated = cache.hydrate([{
    products: [{ url: "https://www.takealot.com/a/PLID67890", title: "A", imageUrls: ["https://static.takealot.com/alternate"], reviewSummary: "Comfortable, but fragile." }],
  }]);
  assert.equal(hydrated?.[0]?.products[0]?.imageUrls[0], "https://static.takealot.com/alternate");
  assert.equal((hydrated?.[0]?.products[0] as { reviewSummary?: string }).reviewSummary, "Comfortable, but fragile.");
});
