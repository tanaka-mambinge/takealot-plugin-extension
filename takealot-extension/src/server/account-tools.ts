import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { TakealotAccountClient } from "./account.ts";
import type { LocalLoginFlow } from "./login-flow.ts";

function result(value: Record<string, unknown>, message: string) {
  return { content: [{ type: "text" as const, text: message }], structuredContent: value };
}

function failure(error: unknown) {
  return { isError: true as const, content: [{ type: "text" as const, text: error instanceof Error ? error.message : "The Takealot request failed." }] };
}

export function registerAccountTools(server: McpServer, api: TakealotAccountClient, loginFlow: LocalLoginFlow): void {
  server.registerTool("takealot.auth_status", {
    title: "Check Takealot sign-in",
    description: "Check whether a Takealot session is saved in this computer's password vault. Does not return any account identifiers or credentials.",
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async () => {
    try {
      const value = await api.status();
      return result(value, value.authenticated ? "Takealot is connected." : "Takealot is not connected.");
    } catch (error) { return failure(error); }
  });

  server.registerTool("takealot.auth_start_login", {
    title: "Sign in to Takealot",
    description: "Start a short-lived local sign-in page. The user enters their password and any one-time code in the browser; never ask for these in chat.",
    inputSchema: {},
    annotations: { readOnlyHint: false, openWorldHint: false },
  }, async () => {
    try {
      const value = await loginFlow.start();
      return result(value, `Open this temporary local sign-in page in your browser: ${value.url}`);
    } catch (error) { return failure(error); }
  });

  server.registerTool("takealot.auth_logout", {
    title: "Sign out of Takealot",
    description: "Remove the saved Takealot session from this computer's password vault.",
    inputSchema: {},
    annotations: { readOnlyHint: false, openWorldHint: false },
  }, async () => {
    try { return result(await api.logout(), "The saved Takealot session was removed."); }
    catch (error) { return failure(error); }
  });

  server.registerTool("takealot.wishlist_list", {
    title: "List Takealot wishlists",
    description: "List the signed-in user's Takealot wishlist groups. Requires local Takealot sign-in.",
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async () => {
    try { const value = await api.listWishlists(); return result(value, `${value.groups.length} wishlist group(s) found.\n${JSON.stringify(value)}`); }
    catch (error) { return failure(error); }
  });

  server.registerTool("takealot.wishlist_items", {
    title: "View Takealot wishlist items",
    description: "List products in one Takealot wishlist group. Requires local Takealot sign-in.",
    inputSchema: { groupId: z.string().regex(/^\d+$/).describe("Numeric wishlist group ID returned by takealot.wishlist_list.") },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ groupId }) => {
    try { const value = await api.wishlistItems(groupId); return result(value, `${value.items.length} item(s) in ${value.name}.\n${JSON.stringify(value)}`); }
    catch (error) { return failure(error); }
  });

  server.registerTool("takealot.wishlist_create", {
    title: "Create a Takealot wishlist",
    description: "Create a wishlist group after the user asks for one or confirms the proposed name. Requires local sign-in.",
    inputSchema: { name: z.string().trim().min(1).max(100).describe("Name for the new wishlist group.") },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, async ({ name }) => {
    try { const value = await api.createWishlist(name); return result(value, `Created wishlist “${value.name}”.\n${JSON.stringify(value)}`); }
    catch (error) { return failure(error); }
  });

  server.registerTool("takealot.wishlist_rename", {
    title: "Rename a Takealot wishlist",
    description: "Rename a wishlist group. Confirm the exact group and new name with the user before calling. Requires local sign-in.",
    inputSchema: { groupId: z.string().regex(/^\d+$/).describe("Numeric group ID."), name: z.string().trim().min(1).max(100).describe("New wishlist name.") },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, async ({ groupId, name }) => {
    try { const value = await api.renameWishlist(groupId, name); return result(value, `Renamed wishlist to “${value.name}”.\n${JSON.stringify(value)}`); }
    catch (error) { return failure(error); }
  });

  server.registerTool("takealot.wishlist_delete", {
    title: "Delete a Takealot wishlist",
    description: "Permanently delete a wishlist group. Tell the user which group will be deleted and get explicit confirmation before calling. Requires local sign-in.",
    inputSchema: { groupId: z.string().regex(/^\d+$/).describe("Numeric group ID to delete.") },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  }, async ({ groupId }) => {
    try { const value = await api.deleteWishlist(groupId); return result(value, `Deleted wishlist group ${value.groupId}.`); }
    catch (error) { return failure(error); }
  });

  server.registerTool("takealot.wishlist_add", {
    title: "Add a product to a Takealot wishlist",
    description: "Add one Takealot listing to a wishlist group. For agent-initiated actions, confirm the product and target group with the user first. The results-panel button is the user's confirmation for that product and group. Requires local sign-in.",
    inputSchema: {
      groupId: z.string().regex(/^\d+$/).describe("Numeric wishlist group ID."),
      productUrl: z.string().url().describe("Canonical Takealot product URL from search results."),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, async ({ groupId, productUrl }) => {
    try { const value = await api.addProduct(groupId, productUrl); return result(value, `Added “${value.title}” to wishlist group ${value.groupId}.`); }
    catch (error) { return failure(error); }
  });

  server.registerTool("takealot.wishlist_remove", {
    title: "Remove a product from Takealot wishlists",
    description: "Remove one product from all Takealot wishlist groups. State that this affects every group and get explicit user confirmation before calling. Requires local sign-in.",
    inputSchema: { productUrl: z.string().trim().min(1).max(500).describe("Canonical Takealot product URL or PLID.") },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  }, async ({ productUrl }) => {
    try { const value = await api.removeProduct(productUrl); return result(value, `Removed product PLID${value.plid} from all wishlist groups.`); }
    catch (error) { return failure(error); }
  });
}
