import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { OpenAIExtensions } from "@openai/mcp-extensions/server";
import shoppingBagIcon from "@tabler/icons/outline/shopping-bag.svg";
import type {
  OpenAIUiResourceMetadata,
  OpenAIUiToolMetadata,
} from "@openai/mcp-extensions/server";
import { TakealotAccountClient } from "./account.js";
import { registerAccountTools } from "./account-tools.js";
import { LocalLoginFlow } from "./login-flow.js";
import { prepareGroupedResults, showResultsInput, showResultsShape } from "./presentation.js";
import { searchInput, searchInputShape, searchTakealot } from "./search.js";
import { getTakealotReviews, reviewInput, reviewInputShape } from "./reviews.js";
import { SystemSessionStore } from "./session-store.js";

const server = new McpServer({ name: "takealot-extension", version: "0.1.0" });
new OpenAIExtensions(server);
const account = new TakealotAccountClient(new SystemSessionStore());
const loginFlow = new LocalLoginFlow(account);
registerAccountTools(server, account, loginFlow);
const panelUri = "ui://takealot-extension/product-results";
const panelFile = resolve(dirname(fileURLToPath(import.meta.url)), "../ui/index.html");
const imageDomains = ["https://media.takealot.com", "https://static.takealot.com", "https://images.takealot.com"];
const entrypointIcon = `data:image/svg+xml,${encodeURIComponent(shoppingBagIcon
  .replace('width="24"', 'width="20"')
  .replace('height="24"', 'height="20"')
  .replace('stroke-width="2"', 'stroke-width="1.33"'))}`;
const resourceMetadata = {
  ui: {
    csp: {
      resourceDomains: imageDomains,
    },
  },
  "openai/ui": {
    preferredDisplayMode: "fullscreen",
    availableDisplayModes: ["inline", "fullscreen"],
  } satisfies OpenAIUiResourceMetadata,
};

registerAppResource(
  server,
  "Takealot product results",
  panelUri,
  { _meta: { ui: { csp: { resourceDomains: imageDomains } } } },
  async () => ({
    contents: [
      {
        uri: panelUri,
        mimeType: RESOURCE_MIME_TYPE,
        text: await readFile(panelFile, "utf8"),
        _meta: resourceMetadata,
      },
    ],
  }),
);

server.registerTool(
  "takealot.search_products",
  {
    title: "Search Takealot products",
    description:
      "Search Takealot's product catalogue and return up to 36 candidates from its search page. Compare and group the plausible matches, then show the full useful selection with takealot.show_results; do not narrow it to only a few recommendations. This tool does not display the panel. Do not use web search for Takealot product discovery.",
    inputSchema: searchInputShape,
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async (input) => {
    const parsed = searchInput.parse(input);
    const result = await searchTakealot(parsed);
    return {
      content: [{
        type: "text",
        text: result.returned
          ? `Found ${result.returned} Takealot candidates for “${result.query}”. Compare and group the relevant products, then call takealot.show_results with your selected listings.\n${JSON.stringify(result)}`
          : `No Takealot listings found for “${result.query}”.`,
      }],
      structuredContent: result,
    };
  },
);

server.registerTool(
  "takealot.product_reviews",
  {
    title: "Read Takealot product reviews",
    description: "Fetch up to 10 real Takealot customer reviews for a product PLID. Use this when comparing or recommending products so the recommendation reflects both positive and negative customer feedback. Returns review text, rating, date, and helpful votes; omits reviewer identity. This is read-only and does not use web search.",
    inputSchema: reviewInputShape,
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async (input) => {
    try {
      const parsed = reviewInput.parse(input);
      const result = await getTakealotReviews(parsed);
      return {
        content: [{ type: "text", text: result.total
          ? `Read ${result.reviews.length} of ${result.total} Takealot reviews for PLID${result.plid}. Review the sample for both strengths and recurring complaints before recommending this product.\n${JSON.stringify(result)}`
          : `No Takealot reviews found for PLID${result.plid}.` }],
        structuredContent: result,
      };
    } catch (error) {
      return { isError: true, content: [{ type: "text", text: error instanceof Error ? error.message : "Takealot reviews request failed." }] };
    }
  },
);

const showResultsToolConfig = {
  title: "Show grouped Takealot results",
  description:
    "Display Takealot listings from takealot.search_products, organized into groups that match the user's needs. Include all plausible matches so the user can browse and choose; do not show only a few top recommendations. Pass only products returned by that search. For products whose reviews you checked, include a short balanced reviewSummary. This is the panel display step; it does not search or fetch products.",
  inputSchema: showResultsShape,
  annotations: { readOnlyHint: true, openWorldHint: false },
  icons: [{ src: entrypointIcon, mimeType: "image/svg+xml", sizes: ["20x20"] }],
  _meta: {
    ui: { resourceUri: panelUri },
    "openai/ui": {
      entrypoints: [{ type: "thread" }],
    } satisfies OpenAIUiToolMetadata,
  },
};

registerAppTool(
  server,
  "takealot.show_results",
  showResultsToolConfig,
  async (input) => {
    const parsed = showResultsInput.parse(input);
    const result = prepareGroupedResults(parsed);
    return {
      content: [{
        type: "text",
        text: result.returned
          ? `Showing ${result.returned} selected Takealot listings in ${result.groups.length} groups.`
          : "Takealot results panel is ready. Ask in chat to search for products.",
      }],
      structuredContent: result,
    };
  },
);

await server.connect(new StdioServerTransport());
