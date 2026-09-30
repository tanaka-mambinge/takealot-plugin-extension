import externalLinkIcon from "@tabler/icons/outline/external-link.svg?raw";
import photoIcon from "@tabler/icons/outline/photo.svg?raw";
import truckIcon from "@tabler/icons/outline/truck-delivery.svg?raw";
import starIcon from "@tabler/icons/filled/star.svg?raw";

type Product = {
  title: string;
  subtitle?: string;
  description?: string;
  brand?: string;
  url: string;
  priceDisplay?: string;
  listPriceDisplay?: string;
  discountDisplay?: string;
  availability?: string;
  deliveryDisplay?: string;
  rating: { average: number; count: number };
  imageUrls: string[];
};

type SearchResult = {
  query: string;
  returned: number;
  groups?: Array<{ title: string; reason?: string; results: Product[] }>;
  error?: string;
};

function safeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function makeElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

function makeIcon(svgMarkup: string, className: string): SVGSVGElement {
  const source = new DOMParser().parseFromString(svgMarkup, "image/svg+xml").documentElement;
  const icon = document.importNode(source, true) as SVGSVGElement;
  icon.classList.add("ui-icon", className);
  icon.setAttribute("aria-hidden", "true");
  icon.removeAttribute("width");
  icon.removeAttribute("height");
  return icon;
}

function renderMessage(root: HTMLElement, title: string, detail: string, kind = "empty"): void {
  root.replaceChildren();
  const section = makeElement("section", `state state-${kind}`);
  section.setAttribute("role", kind === "error" ? "alert" : "status");
  const heading = makeElement("h1", undefined, title);
  const paragraph = makeElement("p", undefined, detail);
  section.append(heading, paragraph);
  root.append(section);
}

function formatRating(rating: Product["rating"]): string {
  const average = Number(rating?.average ?? 0);
  const count = Number(rating?.count ?? 0);
  if (average > 0 && count > 0) {
    return `${average.toFixed(1)} out of 5 · ${count.toLocaleString()} reviews`;
  }
  if (average > 0) return `${average.toFixed(1)} out of 5`;
  if (count > 0) return `${count.toLocaleString()} reviews`;
  return "No rating yet";
}

function setImageOrFallback(container: HTMLElement, url: string | undefined, title: string): void {
  container.replaceChildren();
  container.classList.toggle("image-frame-empty", !url);
  if (!url) {
    const fallback = makeElement("span", "image-fallback");
    fallback.append(makeIcon(photoIcon, "icon-photo"), makeElement("span", undefined, "Image unavailable"));
    container.append(fallback);
    return;
  }

  const image = makeElement("img", "product-image");
  image.src = url;
  image.alt = title;
  image.loading = "lazy";
  image.addEventListener("error", () => {
    setImageOrFallback(container, undefined, title);
  }, { once: true });
  container.append(image);
}

function createProductRow(product: Product): HTMLLIElement {
  const item = makeElement("li", "product-item");
  const button = makeElement("button", "product-card");
  button.type = "button";
  button.setAttribute("aria-label", `Open ${product.title} on Takealot${product.priceDisplay ? `, ${product.priceDisplay}` : ""}`);

  const imageFrame = makeElement("span", "product-image-frame");
  setImageOrFallback(imageFrame, product.imageUrls?.[0], product.title);
  const imageStage = makeElement("span", "product-image-stage");
  if (product.discountDisplay) imageStage.append(makeElement("span", "discount-badge", safeText(product.discountDisplay)));
  imageStage.append(imageFrame);

  const details = makeElement("span", "product-copy");
  const brand = safeText(product.brand);
  if (brand) details.append(makeElement("span", "product-brand", brand));

  const title = makeElement("span", "product-title", safeText(product.title) || "Untitled product");
  details.append(title);

  const facts = makeElement("span", "product-facts");
  if (product.priceDisplay) facts.append(makeElement("strong", "product-price", product.priceDisplay));
  if (product.listPriceDisplay) facts.append(makeElement("span", "product-list-price", product.listPriceDisplay));
  details.append(facts);

  const availability = safeText(product.availability);
  if (availability) details.append(makeElement("span", "product-availability", availability));
  const delivery = safeText(product.deliveryDisplay);
  if (delivery) {
    const deliveryLine = makeElement("span", "product-delivery");
    deliveryLine.append(makeIcon(truckIcon, "icon-delivery"), makeElement("span", undefined, delivery));
    details.append(deliveryLine);
  }
  const rating = makeElement("span", "product-rating");
  rating.append(makeIcon(starIcon, "icon-star"));
  rating.append(makeElement("span", "rating-value", product.rating?.average ? `${Number(product.rating.average).toFixed(1)} out of 5` : "No rating yet"));
  if (product.rating?.count) rating.append(makeElement("span", "rating-count", `(${Number(product.rating.count).toLocaleString()})`));
  details.append(rating);

  const action = makeElement("span", "product-action");
  action.append(makeElement("span", undefined, "View on Takealot"), makeIcon(externalLinkIcon, "icon-external"));
  button.append(imageStage, details, action);
  item.append(button);
  return item;
}

export function renderInitial(root: HTMLElement): void {
  renderMessage(root, "Takealot product search", "Ask in chat to search for a product.");
}

export function renderSearchResult(
  root: HTMLElement,
  value: unknown,
  openProduct: (url: string) => void | Promise<unknown> = (url) => window.open(url, "_blank", "noopener,noreferrer"),
): void {
  const result = value && typeof value === "object" ? (value as SearchResult) : undefined;
  if (!result) {
    renderInitial(root);
    return;
  }
  if (result.error) {
    renderMessage(root, "Results couldn’t load", safeText(result.error), "error");
    return;
  }
  const groups = Array.isArray(result.groups) ? result.groups : [];
  const returned = groups.reduce((total, group) => total + (Array.isArray(group.results) ? group.results.length : 0), 0);
  if (!returned) {
    renderMessage(
      root,
      result.query ? `No products found for “${safeText(result.query)}”` : "Takealot product search",
      result.query
        ? "Try a different product name or a shorter search phrase."
        : "Ask in chat to search Takealot for a product. Your results will appear here.",
    );
    return;
  }

  const layout = makeElement("div", "results-layout");
  const header = makeElement("header", "results-header");
  const heading = makeElement("h1", undefined, result.query ? `Results for “${safeText(result.query)}”` : "Takealot picks");
  const count = makeElement("p", undefined, `${returned} ${returned === 1 ? "product" : "products"}`);
  count.setAttribute("role", "status");
  count.setAttribute("aria-live", "polite");
  count.setAttribute("aria-atomic", "true");
  header.append(heading, count);

  groups.forEach((group) => {
    if (!group.results?.length) return;
    const section = makeElement("section", "product-group");
    const groupHeader = makeElement("header", "group-header");
    groupHeader.append(makeElement("h2", "group-title", safeText(group.title) || "Matches"));
    if (group.reason) groupHeader.append(makeElement("p", "group-reason", safeText(group.reason)));
    const list = makeElement("ul", "product-list");
    group.results.forEach((product) => {
      const item = createProductRow(product);
      const button = item.querySelector<HTMLButtonElement>(".product-card");
      button?.addEventListener("click", () => {
        void Promise.resolve(openProduct(product.url)).then((result) => {
          if (result && typeof result === "object" && "isError" in result && result.isError) {
            renderMessage(root, "Takealot couldn’t open", "Try opening this product again.", "error");
          }
        }).catch(() => {
          renderMessage(root, "Takealot couldn’t open", "Try opening this product again.", "error");
        });
      });
      list.append(item);
    });
    section.append(groupHeader, list);
    layout.append(section);
  });
  layout.prepend(header);
  root.replaceChildren(layout);
}
