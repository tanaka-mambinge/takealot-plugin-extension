---
name: takealot-extension
description: Search Takealot through MCP, select and group relevant listings, then show them in the Takealot Extension panel.
---

# Takealot product search

When the user asks to find products on Takealot:

1. Preserve the user's requirements, such as product type, brand, model, and budget.
2. For a request covering different product types, call `takealot.search_products` separately for each type. For one product type, call it once with a focused phrase. Set `limit` only when the user asks for a specific number; otherwise use the default of 36 to get the full search page. Search results return candidates to you without opening the panel.
3. Compare candidates against the user's needs and budget. Group matching listings by product type or useful trade-off. Pass through every plausible matching listing so the user has a broad choice; omit only clear mismatches. Do not reduce the list to a few recommendations or invent products and details.
4. Call `takealot.show_results` with the original request and groups containing only products returned by `takealot.search_products`. Add a short reason for each group when it helps the user choose.
5. Summarize the strongest matches in chat. The panel displays the grouped product cards. Clicking a card opens that listing on Takealot.

Do not use web search for Takealot product discovery or call Takealot endpoints outside `takealot.search_products`. The `takealot.show_results` tool only displays the selected listings; it does not search or fetch products.

If search returns no matches, say so and suggest trying a shorter or different phrase. If the search fails, report that Takealot search is unavailable; do not fall back to web search.
