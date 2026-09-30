import { App } from "@modelcontextprotocol/ext-apps";
import "./style.css";
import { renderInitial, renderSearchResult } from "./view.js";

const app = new App({ name: "Takealot product results", version: "0.1.0" });
const root = document.querySelector<HTMLElement>("#app");

if (root) renderInitial(root);

app.ontoolresult = (result) => {
  if (root) {
    renderSearchResult(root, result.structuredContent, {
      openProduct: async (url) => {
        const response = await app.openLink({ url });
        if (response.isError) throw new Error("The host could not open the link.");
        return response;
      },
      callTool: (name, args = {}) => app.callServerTool({ name, arguments: args }),
    });
  }
};

app.onerror = () => {
  if (!root) return;
  root.replaceChildren();
  const section = document.createElement("section");
  section.className = "state state-error";
  const heading = document.createElement("h1");
  heading.textContent = "Results couldn’t load";
  const message = document.createElement("p");
  message.textContent = "Try the search again in chat.";
  section.append(heading, message);
  root.append(section);
};

await app.connect();
