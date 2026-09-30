# Takealot Extension

An unofficial Codex extension that searches Takealot's product catalogue through its MCP tool and displays the results in a product panel. This community project is not affiliated with or endorsed by Takealot.

## Search and results flow

1. Ask Codex to find products on Takealot.
2. Codex calls `takealot.search_products`; the MCP server searches Takealot and returns up to 36 normalized candidates to the model.
3. The model compares candidates against your request, selects relevant listings, groups them, and calls `takealot.show_results`.
4. The panel shows the selected products in those groups. Click a card or **View on Takealot** to open the matching listing.

The panel shows catalogue data returned by Takealot, including product images, price, rating, and availability when supplied. Product images load from Takealot's media host. Clicking a card opens its Takealot URL; it does not trigger another product request.

## Test locally

Requirements: Node.js 22 or newer and pnpm. Installing packages downloads dependencies.

```sh
cd takealot-extension
pnpm install
pnpm test
pnpm build
```

Then restart Codex and start a new chat with **Takealot Extension** enabled. Ask: “Search Takealot for wireless headphones and show the results in the panel.”

The build creates a self-contained `dist/server/index.js` and single-file `dist/ui/index.html`. Bundling the server keeps it runnable from Codex's local plugin cache, which does not preserve package-manager symlinks.

## Main files

- `src/server/index.ts` registers the candidate search tool and thread-entrypoint results panel.
- `src/server/search.ts` calls Takealot's catalogue search endpoint and normalizes product results.
- `src/server/presentation.ts` validates and groups model-selected results for the panel.
- `src/ui/view.ts` renders product cards that open their matching Takealot listing.
- `src/ui/style.css` styles the responsive panel and interaction states.
- `skills/takealot-extension/SKILL.md` instructs Codex to search, curate, group, and display results without web-search fallbacks.
