import { z } from "zod";

const takealotUrl = z.string().url().refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:" && (url.hostname === "takealot.com" || url.hostname === "www.takealot.com");
}, "Product links must point to Takealot.");

const productSchema = z.object({
  title: z.string().trim().min(1).max(500),
  subtitle: z.string().max(500).optional(),
  description: z.string().max(2000).optional(),
  brand: z.string().max(200).optional(),
  url: takealotUrl,
  priceDisplay: z.string().max(100).optional(),
  listPriceDisplay: z.string().max(100).optional(),
  discountDisplay: z.string().max(40).optional(),
  availability: z.string().max(200).optional(),
  deliveryDisplay: z.string().max(300).optional(),
  rating: z.object({
    average: z.number().min(0).max(5).optional(),
    count: z.number().int().min(0).optional(),
  }).optional(),
  imageUrls: z.array(z.string().url().refine((value) => new URL(value).protocol === "https:")).max(5).optional(),
});

export const showResultsShape = {
  query: z.string().trim().max(200).optional().describe("The original Takealot search phrase."),
  groups: z.array(z.object({
    title: z.string().trim().min(1).max(120).describe("Short label for this product group."),
    reason: z.string().max(300).optional().describe("Brief explanation of why these products fit."),
    products: z.array(productSchema).max(36),
  })).max(10).optional().describe("Model-selected products grouped by the user's needs. Empty when opened as a thread entrypoint."),
};

export const showResultsInput = z.object(showResultsShape);

export function prepareGroupedResults(input: z.infer<typeof showResultsInput>) {
  const groups = (input.groups ?? []).map((group) => ({
    title: group.title,
    reason: group.reason,
    results: group.products.map((product) => ({
      ...product,
      rating: { average: product.rating?.average ?? 0, count: product.rating?.count ?? 0 },
      imageUrls: product.imageUrls ?? [],
    })),
  }));
  const returned = groups.reduce((total, group) => total + group.results.length, 0);
  return { query: input.query ?? "", returned, groups };
}
