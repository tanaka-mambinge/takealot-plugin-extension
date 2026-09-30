import assert from "node:assert/strict";
import test from "node:test";
import { prepareGroupedResults, showResultsInput } from "./presentation.ts";

test("validates and prepares model-selected groups for the panel", () => {
  const input = showResultsInput.parse({
    query: "budget video setup",
    groups: [{
      title: "Microphones",
      reason: "USB options within the requested budget.",
      products: [{
        title: "Example USB Microphone",
        url: "https://www.takealot.com/example-microphone/PLID12345",
        priceDisplay: "R 499",
        rating: { average: 4.4, count: 24 },
        imageUrls: ["https://media.takealot.com/example.jpg"],
        reviewSummary: "Owners praise comfort; a few mention weak noise cancelling.",
      }],
    }],
  });

  assert.deepEqual(prepareGroupedResults(input), {
    query: "budget video setup",
    returned: 1,
    groups: [{
      title: "Microphones",
      reason: "USB options within the requested budget.",
      results: [{
        title: "Example USB Microphone",
        url: "https://www.takealot.com/example-microphone/PLID12345",
        priceDisplay: "R 499",
        rating: { average: 4.4, count: 24 },
        imageUrls: ["https://media.takealot.com/example.jpg"],
        reviewSummary: "Owners praise comfort; a few mention weak noise cancelling.",
      }],
    }],
  });
});

test("accepts empty input when the thread entrypoint is opened manually", () => {
  assert.deepEqual(prepareGroupedResults(showResultsInput.parse({})), {
    query: "",
    returned: 0,
    groups: [],
  });
});

test("only accepts Takealot product URLs", () => {
  assert.throws(() => showResultsInput.parse({
    groups: [{ title: "Other", products: [{ title: "Bad link", url: "https://example.com/product" }] }],
  }));
});
