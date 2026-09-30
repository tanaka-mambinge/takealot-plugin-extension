---
name: takealot-extension
description: Search Takealot through MCP, select and group relevant listings, then show them in the Takealot Extension panel.
---

# Takealot product search

When the user asks to find products on Takealot:

1. Preserve the user's requirements, such as product type, brand, model, and budget.
2. For one product type, call `takealot.search_products` once with a focused phrase. Set `limit` only when the user asks for a specific number; otherwise use the default of 36 to get the full search page. Search results return candidates to you without opening the panel.
3. For a multi-product request, identify the product categories needed and call `takealot.search_products` separately for each category. For example, a starter sim racing setup may need a wheel/base, pedals, a seat or cockpit, and optionally a shifter, handbrake, or display depending on the user's setup. Keep required and optional parts clear, and do not claim compatibility unless the returned product data supports it.
4. Compare candidates against the user's needs and budget. Group matching listings by product type or useful trade-off. Pass through every plausible matching listing so the user has a broad choice; omit only clear mismatches. Do not reduce the list to a few recommendations or invent products and details.
5. Call `takealot.show_results` with the original request and groups containing only products returned by `takealot.search_products`. Add a short reason for each group when it helps the user choose.
6. Summarize the strongest matches in chat. The panel displays the grouped product cards. Clicking a card opens that listing on Takealot.

## Examples

- One product: “Find wireless headphones on Takealot.” Search once and show the relevant listings.
- Full setup: “Build a complete starter sim racing setup; find everything I need to get started.” Search each component category separately, then show results grouped by category so the user can choose.

Do not use web search for Takealot product discovery or call Takealot endpoints outside `takealot.search_products`. The `takealot.show_results` tool only displays the selected listings; it does not search or fetch products.

If search returns no matches, say so and suggest trying a shorter or different phrase. If the search fails, report that Takealot search is unavailable; do not fall back to web search.
