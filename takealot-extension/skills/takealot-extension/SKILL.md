---
name: takealot-extension
description: Search Takealot through MCP, check product reviews, group relevant listings in the panel, and manage wishlists when asked.
---

# Takealot Extension

This is an unofficial, local Codex extension. Use its MCP tools for all Takealot search, review, and wishlist requests. Never use web search for Takealot product discovery or call Takealot endpoints outside the MCP tools.

## Product search

When the user asks to find products on Takealot:

1. Preserve the user's requirements, such as product type, brand, model, and budget.
2. For one product type, call `takealot.search_products` once with a focused phrase. Set `limit` only when the user asks for a specific number; otherwise use the default of 36 to get the full search page. Search results return candidates to you without opening the panel.
3. For a multi-product request, identify the product categories needed and call `takealot.search_products` separately for each category. For a budget home YouTube studio, consider a microphone, camera or webcam, lighting, and green screen; keep choices within the user's budget and mark optional items clearly. Do not claim compatibility unless the returned product data supports it.
4. Compare candidates against the user's needs and budget. Group matching listings by product type or useful trade-off. Pass through every plausible matching listing so the user has a broad choice; omit only clear mismatches. Do not reduce the list to a few recommendations or invent products and details.
5. When recommending or comparing specific products, inspect reviews for the shortlisted products with `takealot.product_reviews` before deciding. For products with enough reviews, check both five-star and one-star feedback; use latest reviews when freshness matters. For a broad browse list, review the products you actively recommend instead of every search result.
6. Base recommendations on recurring review themes, not one isolated comment. Mention meaningful drawbacks as well as strengths, distinguish review evidence from your inference, and say when a product has few or no reviews. Do not claim a small sample represents all customers.
7. Call `takealot.show_results` with the original request and groups containing only products returned by `takealot.search_products`. Add a short reason for each group when it helps the user choose. For products with reviews you checked, pass a concise, balanced `reviewSummary` on the card; never invent review themes.
8. Summarize the strongest matches in chat, including material review findings. The panel displays the grouped product cards. **View on Takealot** opens the listing. **Add to wishlist** loads the user's groups and requires them to choose a group or create one before the panel adds the product.

## Examples

- One product: “Find wireless headphones on Takealot.” Search once and show the relevant listings.
- Full setup: “Build a budget home YouTube studio setup with a microphone, camera, lighting, and green screen.” Search each component category separately, then show results grouped by category so the user can choose.
- Product comparison: “Compare three wireless headphones on Takealot. I want something durable, so use customer reviews to assess build quality and long-term reliability.” Search for three suitable options, inspect relevant reviews for durability evidence, then compare price, rating, and recurring review themes without overstating what the reviews establish.
- Wishlist organizer: “Show me my Takealot wishlist groups and what's in each, then create a wishlist called Desk setup.” List the user's groups and contents, then create the explicitly requested group.

Use `takealot.search_products` for catalogue search and `takealot.product_reviews` to read reviews by numeric PLID from a search result. Reviews return at most 10 entries per page and omit reviewer names and account identifiers. The `takealot.show_results` tool only displays selected listings; it does not search or fetch products. Product details are requested through MCP only when needed to resolve the numeric product ID for a wishlist change.

If search returns no matches, say so and suggest trying a shorter or different phrase. If the search fails, report that Takealot search is unavailable; do not fall back to web search.

## Sign-in and wishlists

- Check `takealot.auth_status` before an account operation. If the user is not connected, use the panel's Add to wishlist sign-in flow; the user copies the temporary local link and completes sign-in in their browser. Never request credentials in chat or pass them as MCP arguments.
- When the user asks to sign out, call `takealot.show_logout` to open the sign-out panel. Do not call the local deletion tool directly. The panel creates a short-lived loopback link; the user copies it and opens it in a browser, and that browser visit deletes the saved session from this computer. The panel reports when sign-out finishes.
- The local MCP server stores the session only in the computer's OS password vault. Do not expose session tokens, cookies, customer identifiers, or temporary sign-in/sign-out links in chat or tool output. `takealot.auth_start_logout` is for the sign-out panel only.
- Use `takealot.wishlist_list` to find group IDs and `takealot.wishlist_items` to view group contents. Use the create, rename, delete, add, and remove tools only when the user asks.
- When the user explicitly asks to add a product to a wishlist, treat that request as authorization; do not ask for a redundant confirmation. Reuse product details from earlier in the conversation so the user does not need to scroll or repeat them. Use the named group or one selected earlier in the conversation. If no group is known, list the user's groups: use the only group when there is exactly one, ask which one when there are multiple, or offer to create one when there are none. If the product is ambiguous, ask only which product they mean. For multiple clearly identified products, add each one as requested.
- The panel's **Add to wishlist** flow is also the user's authorization for its selected product and group. Do not modify a wishlist as a side effect of research or recommendations.
- `takealot.wishlist_remove` removes the product from every wishlist group. State this clearly and get confirmation first. Confirm before deleting a group as well.
- Never modify a wishlist as a side effect of product research. Do not add to cart, check out, pay, place an order, or perform other account actions.
- These wishlist routes use Takealot's undocumented mobile API. If sign-in or a wishlist action fails, report the error and stop; do not switch to web search, the CLI, or a different API.

## Wishlist examples

- “Show my wishlists and the products saved in my Sim rig list.” List the groups, then fetch the selected group's items.
- “Add this wheel to my Sim rig wishlist.” Reuse the wheel identified earlier in the conversation and add it to the named wishlist without asking the user to repeat or reconfirm it.
- “Create a wishlist called Sim rig and add these products.” Use the explicitly named wishlist and products. Ask only if the requested products cannot be identified clearly from the conversation.
