# Takealot Extension

An unofficial, local Codex extension that searches Takealot through MCP, displays grouped product results in a panel, and manages Takealot wishlists when asked. This community project is not affiliated with or endorsed by Takealot.

## Search and results flow

1. Ask Codex to find products on Takealot.
2. Codex calls `takealot.search_products`; the MCP server searches Takealot and returns up to 36 normalized candidates to the model.
3. The model compares candidates against your request, selects relevant listings, groups them, and calls `takealot.show_results`.
4. The panel shows the selected products in those groups. **View on Takealot** opens the matching listing. **Add to wishlist** lets you choose an existing group or create a new one.

## Sign in and manage wishlists

The extension starts its MCP server locally in Codex. Wishlist requests go through that MCP server to Takealot. When you choose **Add to wishlist** while signed out, the panel opens a short-lived sign-in page at a local address on your computer. Your password and one-time code are sent directly from that page to Takealot. The returned session is stored in the Linux Secret Service password vault; the extension does not write it to a file or show it to the model. If the password vault is locked or unavailable, sign-in fails without a plaintext fallback.

The MCP tools can check sign-in, start sign-in, sign out, list wishlist groups and items, create or rename groups, delete groups, add products, and remove a product from all groups. Agent-initiated changes require confirmation. The panel's Add button is confirmation for the product and group selected there.

Takealot's customer/mobile API is undocumented and may change. The extension is local-only; it does not host or share account sessions.

The panel shows catalogue data returned by Takealot, including product images, price, rating, and availability when supplied. Product images load from Takealot's media host. Clicking a card opens its Takealot URL; it does not trigger another product request.

## Example searches

- **One product:** “Find wireless headphones on Takealot.” Codex searches once and shows matching listings.
- **A full setup:** “Build a complete starter sim racing setup; find everything I need to get started.” Codex searches for each component type and groups the results so you can choose the wheel, pedals, cockpit or seat, and other useful gear.

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
- `src/server/account.ts`, `src/server/login-flow.ts`, and `src/server/session-store.ts` implement local sign-in, session storage, refresh, and wishlist API calls.
- `src/server/presentation.ts` validates and groups model-selected results for the panel.
- `src/ui/view.ts` renders product cards with a Takealot link and MCP-powered wishlist controls.
- `src/ui/style.css` styles the responsive panel and interaction states.
- `skills/takealot-extension/SKILL.md` instructs Codex to search, curate, group, and display results without web-search fallbacks.
