---
name: takealot-extension
description: Search Takealot through MCP, group relevant listings in the panel, and manage wishlists when asked.
---

# Takealot Extension

This is an unofficial, local Codex extension. Use its MCP tools for all Takealot search and wishlist requests. Never use web search for Takealot product discovery or call Takealot endpoints outside the MCP tools.

## Product search

When the user asks to find products on Takealot:

1. Preserve the user's requirements, such as product type, brand, model, and budget.
2. For one product type, call `takealot.search_products` once with a focused phrase. Set `limit` only when the user asks for a specific number; otherwise use the default of 36 to get the full search page. Search results return candidates to you without opening the panel.
3. For a multi-product request, identify the product categories needed and call `takealot.search_products` separately for each category. For example, a starter sim racing setup may need a wheel/base, pedals, a seat or cockpit, and optionally a shifter, handbrake, or display depending on the user's setup. Keep required and optional parts clear, and do not claim compatibility unless the returned product data supports it.
4. Compare candidates against the user's needs and budget. Group matching listings by product type or useful trade-off. Pass through every plausible matching listing so the user has a broad choice; omit only clear mismatches. Do not reduce the list to a few recommendations or invent products and details.
5. Call `takealot.show_results` with the original request and groups containing only products returned by `takealot.search_products`. Add a short reason for each group when it helps the user choose.
6. Summarize the strongest matches in chat. The panel displays the grouped product cards. **View on Takealot** opens the listing. **Add to wishlist** loads the user's groups and requires them to choose a group or create one before the panel adds the product.

## Examples

- One product: “Find wireless headphones on Takealot.” Search once and show the relevant listings.
- Full setup: “Build a complete starter sim racing setup; find everything I need to get started.” Search each component category separately, then show results grouped by category so the user can choose.

Use `takealot.search_products` for catalogue search. The `takealot.show_results` tool only displays the selected listings; it does not search or fetch products. Product details are requested through MCP only when needed to resolve the numeric product ID for a wishlist change.

If search returns no matches, say so and suggest trying a shorter or different phrase. If the search fails, report that Takealot search is unavailable; do not fall back to web search.

## Sign-in and wishlists

- Check `takealot.auth_status` before an account operation. If the user is not connected, call `takealot.auth_start_login` and give them its temporary local link. They enter their password and any one-time code there. Never request credentials in chat or pass them as MCP arguments.
- The local MCP server stores the session only in the computer's OS password vault. Do not expose session tokens, cookies, or customer identifiers in chat or tool output. `takealot.auth_logout` removes the saved session.
- Use `takealot.wishlist_list` to find group IDs and `takealot.wishlist_items` to view group contents. Use the create, rename, delete, add, and remove tools only when the user asks.
- Before agent-initiated changes, state the exact target and ask for confirmation. The panel's **Add to wishlist** flow is itself the user's confirmation for the chosen product and group.
- `takealot.wishlist_remove` removes the product from every wishlist group. State this clearly and get confirmation first. Confirm before deleting a group as well.
- Never modify a wishlist as a side effect of product research. Do not add to cart, check out, pay, place an order, or perform other account actions.
- These wishlist routes use Takealot's undocumented mobile API. If sign-in or a wishlist action fails, report the error and stop; do not switch to web search, the CLI, or a different API.

## Wishlist examples

- “Show my wishlists and the products saved in my Sim rig list.” List the groups, then fetch the selected group's items.
- “Add this wheel to my Sim rig wishlist.” Confirm the exact product and group in chat before calling the add tool, unless the user uses the panel button and selects that group.
- “Create a wishlist called Sim rig and add these products.” Confirm the group name and products before creating the group or adding the products.
