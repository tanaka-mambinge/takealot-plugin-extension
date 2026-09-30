# Takealot Extension

An unofficial, local Codex extension that searches Takealot through MCP, displays grouped product results in a panel, and manages Takealot wishlists when asked. This community project is not affiliated with or endorsed by Takealot.

## Search and results flow

1. Ask Codex to find products on Takealot.
2. Codex calls `takealot.search_products`; the MCP server searches Takealot and returns up to 36 normalized candidates to the model.
3. For products it plans to recommend, Codex can read real customer feedback using `takealot.product_reviews`, then compare strengths and drawbacks.
4. The model groups matching listings, can add a short review-based summary, and calls `takealot.show_results`.
5. The panel shows the selected products. **View on Takealot** opens the matching listing. **Add to wishlist** lets you choose an existing group or create a new one.

## Sign in and manage wishlists

The extension starts its MCP server locally in Codex. Wishlist requests go through that MCP server to Takealot. When you choose **Add to wishlist** while signed out, the panel displays a short-lived sign-in link and a **Copy link** button. Paste the link into your browser, complete sign-in and any one-time code, then return to the open panel; it detects sign-in and loads your wishlists automatically. If copying is unavailable, the link stays selectable so you can copy it manually. The local sign-in page uses the Takealot wordmark and keeps your password in the browser form; the returned session is stored in the Linux Secret Service password vault. The extension does not write the session to a file or show it to the model. If the password vault is locked or unavailable, sign-in fails without a plaintext fallback.

The MCP tools can check sign-in, open the sign-out panel, list wishlist groups and items, create or rename groups, delete groups, add products, and remove a product from all groups. The sign-out panel provides a temporary local link; opening it in a browser removes the saved session from this computer. A clear request to add a product authorizes that addition; the agent uses the product and wishlist group identified in the conversation, and asks only if either is unclear. The panel's Add button authorizes its selected product and group.

Takealot's customer/mobile API is undocumented and may change. The extension is local-only; it does not host or share account sessions.

The panel shows catalogue data returned by Takealot, including product images, price, rating, and availability when supplied. Product images load from image URLs in Takealot's search response. Review summaries are based on MCP-fetched Takealot review samples. Clicking a card opens its Takealot URL; it does not trigger another product request.

## Example prompts

- **One product:** “Find wireless headphones on Takealot.” Codex searches once and shows matching listings.
- **A full setup:** “Build a budget home YouTube studio setup with a microphone, camera, lighting, and green screen.” Codex searches for each component type and groups the results so you can choose a setup within your budget.
- **Compare products:** “Compare three wireless headphones on Takealot. I want something durable, so use customer reviews to assess build quality and long-term reliability.” Codex compares listing details and relevant customer reviews.
- **Organize wishlists:** “Show me my Takealot wishlist groups and what's in each, then create a wishlist called Desk setup.” Codex lists your groups and their contents, then creates the requested group.

## Test locally

Requirements: Node.js 22 or newer and pnpm. Installing packages downloads dependencies.

```sh
cd takealot-extension
pnpm install
pnpm test
pnpm build
```

Then restart Codex and start a new chat with **Takealot Extension** enabled. Ask: “Search Takealot for wireless headphones and show the results in the panel.” Use **Add to wishlist** on a result to test the account flow.

The build creates a self-contained `dist/server/index.js` and single-file `dist/ui/index.html`. Bundling the server keeps it runnable from Codex's local plugin cache, which does not preserve package-manager symlinks.

## Main files

- `src/server/index.ts` registers the MCP tools and thread-entrypoint results panel.
- `src/server/search.ts` calls Takealot's catalogue search endpoint and normalizes product results, PLIDs, and product IDs separately.
- `src/server/reviews.ts` retrieves and normalizes Takealot reviews while omitting reviewer identifiers.
- `src/server/account.ts`, `src/server/login-flow.ts`, and `src/server/session-store.ts` implement local sign-in, session storage, refresh, and wishlist API calls.
- `src/server/presentation.ts` validates and groups model-selected results for the panel.
- `src/ui/view.ts` renders product cards with a Takealot link and MCP-powered wishlist controls.
- `src/ui/style.css` styles the responsive panel and interaction states.
- `skills/takealot-extension/SKILL.md` instructs Codex to search, curate, group, and display results without web-search fallbacks.
