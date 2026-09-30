import externalLinkIcon from "@tabler/icons/outline/external-link.svg?raw";
import heartPlusIcon from "@tabler/icons/outline/heart-plus.svg?raw";
import copyIcon from "@tabler/icons/outline/copy.svg?raw";
import photoIcon from "@tabler/icons/outline/photo.svg?raw";
import truckIcon from "@tabler/icons/outline/truck-delivery.svg?raw";
import starIcon from "@tabler/icons/filled/star.svg?raw";
import { copyText } from "./clipboard.js";

type Product = {
  plid?: string;
  productId?: number;
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
  reviewSummary?: string;
};

type SearchResult = {
  query: string;
  returned: number;
  groups?: Array<{ title: string; reason?: string; results: Product[] }>;
  error?: string;
};

type ToolResponse = {
  isError?: boolean;
  structuredContent?: unknown;
  content?: Array<{ text?: string }>;
};

type PanelActions = {
  openProduct: (url: string) => Promise<unknown>;
  callTool: (name: string, args?: Record<string, unknown>) => Promise<ToolResponse>;
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

function responseMessage(response: ToolResponse): string {
  return response.content?.map((part) => part.text ?? "").filter(Boolean).join("\n") || "The Takealot request failed.";
}

function toolError(response: ToolResponse): Error | undefined {
  return response.isError ? new Error(responseMessage(response)) : undefined;
}

function createWishlistDialog(product: Product, actions: PanelActions): HTMLDialogElement {
  const dialog = makeElement("dialog", "wishlist-dialog");
  const panel = makeElement("section", "wishlist-modal");
  const header = makeElement("header", "wishlist-modal-header");
  const heading = makeElement("h2", undefined, "Add to wishlist");
  const close = makeElement("button", "wishlist-close", "Close");
  close.type = "button";
  close.addEventListener("click", () => dialog.close());
  header.append(heading, close);
  const productName = makeElement("p", "wishlist-product-name", safeText(product.title));
  const status = makeElement("p", "wishlist-status");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  const content = makeElement("div", "wishlist-modal-content");
  panel.append(header, productName, status, content);
  dialog.append(panel);
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });

  const setStatus = (message: string, isError = false) => {
    status.textContent = message;
    status.classList.toggle("wishlist-status-error", isError);
  };

  const addToGroup = async (groupId: string): Promise<boolean> => {
    setStatus("Adding product…");
    try {
      const response = await actions.callTool("takealot.wishlist_add", { groupId, productUrl: product.url });
      const error = toolError(response);
      if (error) throw error;
      setStatus("Added to your wishlist.");
      window.setTimeout(() => dialog.close(), 900);
      return true;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not add this product.", true);
      return false;
    }
  };

  const showGroups = (groups: Array<{ groupId: string; name: string; itemCount: number }>) => {
    content.replaceChildren();
    if (groups.length) {
      const label = makeElement("label", "wishlist-select-label", "Choose a wishlist");
      label.htmlFor = "wishlist-group-select";
      const select = makeElement("select", "wishlist-select");
      select.id = "wishlist-group-select";
      for (const group of groups) {
        const option = makeElement("option", undefined, `${group.name} (${group.itemCount})`);
        option.value = group.groupId;
        select.append(option);
      }
      const add = makeElement("button", "wishlist-confirm", "Add to this wishlist");
      add.type = "button";
      add.addEventListener("click", () => {
        add.disabled = true;
        void addToGroup(select.value).then((added) => { add.disabled = !added; });
      });
      content.append(label, select, add);
    } else {
      content.append(makeElement("p", "wishlist-empty", "You don’t have any wishlist groups yet."));
    }

    const create = makeElement("button", "wishlist-create-toggle", groups.length ? "Create a new wishlist" : "Create wishlist");
    create.type = "button";
    create.addEventListener("click", () => {
      const form = makeElement("form", "wishlist-create-form");
      const label = makeElement("label", undefined, "New wishlist name");
      label.htmlFor = "wishlist-new-name";
      const input = makeElement("input", "wishlist-name");
      input.id = "wishlist-new-name";
      input.name = "name";
      input.maxLength = 100;
      input.required = true;
      input.autocomplete = "off";
      input.placeholder = "For example, a budget YouTube studio";
      const submit = makeElement("button", "wishlist-confirm", "Create and add product");
      submit.type = "submit";
      form.append(label, input, submit);
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        void (async () => {
          submit.disabled = true;
          setStatus("Creating wishlist…");
          try {
            const created = await actions.callTool("takealot.wishlist_create", { name: input.value.trim() });
            const createError = toolError(created);
            if (createError) throw createError;
            const value = created.structuredContent as { groupId?: string } | undefined;
            if (!value?.groupId) throw new Error("Takealot created the wishlist but did not return its ID.");
            const added = await addToGroup(value.groupId);
            if (!added) {
              content.replaceChildren();
              const retry = makeElement("button", "wishlist-confirm", "Try adding to the new wishlist again");
              retry.type = "button";
              retry.addEventListener("click", () => { void addToGroup(value.groupId!); });
              content.append(retry);
            }
          } catch (error) {
            submit.disabled = false;
            setStatus(error instanceof Error ? error.message : "Could not create the wishlist.", true);
          }
        })();
      });
      content.replaceChildren(form);
      input.focus();
    });
    content.append(create);
  };

  const showSignIn = () => {
    content.replaceChildren();
    const guide = makeElement("section", "wishlist-signin-card");
    const title = makeElement("h3", undefined, "Sign in to continue");
    const intro = makeElement("p", "wishlist-signin-intro", "Copy the link, open it in your browser, then return here. Your wishlists will load automatically.");
    const urlLabel = makeElement("label", "wishlist-link-label", "Sign-in link");
    const loginLink = makeElement("input", "wishlist-login-link");
    loginLink.type = "text";
    loginLink.readOnly = true;
    loginLink.autocomplete = "off";
    loginLink.setAttribute("aria-label", "Temporary sign-in link. Click to select, then copy and paste into your browser.");
    const actionsRow = makeElement("div", "wishlist-login-actions");
    const copyLink = makeElement("button", "wishlist-copy-link", "Copy link");
    copyLink.type = "button";
    copyLink.disabled = true;
    copyLink.prepend(makeIcon(copyIcon, "icon-copy"));
    const copyLabel = makeElement("span", undefined, "Copy link");
    copyLink.append(copyLabel);
    actionsRow.append(copyLink);
    guide.append(title, intro, urlLabel, loginLink, actionsRow);
    content.append(guide);

    let monitoring = false;
    let linkExpired = false;
    let retryWishlistLoad = false;
    let loginUrl: string | undefined;
    const loadWishlists = async (): Promise<boolean> => {
      setStatus("Signed in. Loading your wishlists…");
      try {
        const response = await actions.callTool("takealot.wishlist_list");
        const error = toolError(response);
        if (error) throw error;
        const value = response.structuredContent as { groups?: Array<{ groupId: string; name: string; itemCount: number }> } | undefined;
        showGroups(value?.groups ?? []);
        setStatus("Choose where to save this product.");
        return true;
      } catch (error) {
        retryWishlistLoad = true;
        copyLabel.textContent = "Retry loading wishlists";
        setStatus(error instanceof Error ? error.message : "Could not load wishlists.", true);
        return false;
      }
    };
    const monitorSignIn = async () => {
      if (monitoring || !dialog.open) return;
      monitoring = true;
      const deadline = Date.now() + 5 * 60_000;
      while (dialog.open && Date.now() < deadline) {
        try {
          const response = await actions.callTool("takealot.auth_status");
          const error = toolError(response);
          if (error) throw error;
          const value = response.structuredContent as { authenticated?: boolean } | undefined;
          if (value?.authenticated) {
            monitoring = false;
            await loadWishlists();
            return;
          }
        } catch (error) {
          monitoring = false;
          setStatus(error instanceof Error ? error.message : "Could not check Takealot sign-in.", true);
          return;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 1500));
      }
      monitoring = false;
      if (!dialog.open) return;
      linkExpired = true;
      copyLabel.textContent = "Copy a new sign-in link";
      setStatus("The sign-in link expired. Copy a new one to try again.", true);
    };
    const prepareSignIn = async (copyWhenReady = false): Promise<void> => {
      copyLink.disabled = true;
      setStatus("Preparing your private sign-in link…");
      try {
        const response = await actions.callTool("takealot.auth_start_login");
        const error = toolError(response);
        if (error) throw error;
        const value = response.structuredContent as { url?: string } | undefined;
        if (!value?.url) throw new Error("Could not prepare Takealot sign-in.");
        loginUrl = value.url;
        linkExpired = false;
        loginLink.value = loginUrl;
        copyLink.disabled = false;
        copyLabel.textContent = "Copy link";
        setStatus("Link ready. Paste it into your browser to sign in.");
        if (copyWhenReady) await copyCurrentLink();
      } catch (error) {
        copyLink.disabled = false;
        setStatus(error instanceof Error ? error.message : "Could not prepare sign-in.", true);
      }
    };
    const copyCurrentLink = async () => {
      if (!loginUrl) return;
      if (await copyText(loginUrl, navigator.clipboard)) {
        setStatus("Link copied. Paste it into your browser to sign in.");
      } else {
        loginLink.focus();
        loginLink.select();
        setStatus("Link selected. Copy it, then paste it into your browser.", true);
      }
      void monitorSignIn();
    };
    copyLink.addEventListener("click", () => {
      if (retryWishlistLoad) {
        retryWishlistLoad = false;
        copyLabel.textContent = "Copy link";
        void loadWishlists();
      } else if (linkExpired || !loginUrl) {
        void prepareSignIn(true);
      } else {
        void copyCurrentLink();
      }
    });
    loginLink.addEventListener("click", () => {
      loginLink.select();
      void monitorSignIn();
    });
    void prepareSignIn();
  };

  void (async () => {
    setStatus("Loading your wishlists…");
    try {
      const response = await actions.callTool("takealot.wishlist_list");
      const error = toolError(response);
      if (error) {
        if (/sign in|not connected|not logged in/i.test(error.message)) showSignIn();
        else setStatus(error.message, true);
        return;
      }
      const value = response.structuredContent as { groups?: Array<{ groupId: string; name: string; itemCount: number }> } | undefined;
      showGroups(value?.groups ?? []);
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not load wishlists.", true);
    }
  })();
  return dialog;
}

function createProductRow(product: Product, actions: PanelActions): HTMLLIElement {
  const item = makeElement("li", "product-item");
  const card = makeElement("article", "product-card");

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
  const reviewSummary = safeText(product.reviewSummary);
  if (reviewSummary) details.append(makeElement("p", "product-review-summary", reviewSummary));

  const actionsRow = makeElement("div", "product-actions");
  const view = makeElement("button", "product-action", "View on Takealot");
  view.type = "button";
  view.setAttribute("aria-label", `Open ${product.title} on Takealot`);
  view.append(makeIcon(externalLinkIcon, "icon-external"));
  view.addEventListener("click", () => {
    void actions.openProduct(product.url).catch(() => {
      const message = makeElement("p", "product-feedback", "Takealot couldn’t open this product. Try again.");
      item.append(message);
    });
  });
  const wishlist = makeElement("button", "product-action product-action-secondary", "Add to wishlist");
  wishlist.type = "button";
  wishlist.setAttribute("aria-label", `Add ${product.title} to a Takealot wishlist`);
  wishlist.prepend(makeIcon(heartPlusIcon, "icon-heart"));
  wishlist.addEventListener("click", () => {
    wishlist.disabled = true;
    const dialog = createWishlistDialog(product, actions);
    document.body.append(dialog);
    dialog.addEventListener("close", () => { dialog.remove(); wishlist.disabled = false; wishlist.focus(); }, { once: true });
    dialog.showModal();
  });
  actionsRow.append(view, wishlist);
  card.append(imageStage, details, actionsRow);
  item.append(card);
  return item;
}

export function renderInitial(root: HTMLElement): void {
  renderMessage(root, "Takealot product search", "Ask in chat to search for a product.");
}

export function renderSearchResult(
  root: HTMLElement,
  value: unknown,
  actions: PanelActions = {
    openProduct: async (url) => window.open(url, "_blank", "noopener,noreferrer"),
    callTool: async () => { throw new Error("MCP actions are unavailable."); },
  },
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
      const item = createProductRow(product, actions);
      list.append(item);
    });
    section.append(groupHeader, list);
    layout.append(section);
  });
  layout.prepend(header);
  root.replaceChildren(layout);
}

export function renderLogoutPanel(root: HTMLElement, actions: PanelActions): void {
  const panel = makeElement("section", "logout-panel");
  const heading = makeElement("h1", undefined, "Sign out of Takealot");
  const intro = makeElement("p", "logout-intro", "Copy the link and open it in your browser. That removes the saved Takealot session from this computer.");
  const status = makeElement("p", "wishlist-status");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  const label = makeElement("label", "wishlist-link-label", "Temporary sign-out link");
  const urlInput = makeElement("input", "wishlist-login-link");
  urlInput.type = "text";
  urlInput.readOnly = true;
  urlInput.autocomplete = "off";
  urlInput.setAttribute("aria-label", "Temporary sign-out link. Select and copy it to open in your browser.");
  const copyButton = makeElement("button", "wishlist-copy-link");
  copyButton.type = "button";
  copyButton.disabled = true;
  copyButton.append(makeIcon(copyIcon, "icon-copy"));
  const copyLabel = makeElement("span", undefined, "Copy sign-out link");
  copyButton.append(copyLabel);
  panel.append(heading, intro, status, label, urlInput, copyButton);
  root.replaceChildren(panel);

  let logoutUrl: string | undefined;
  let linkExpired = false;
  let monitoring = false;
  const setStatus = (message: string, isError = false) => {
    status.textContent = message;
    status.classList.toggle("wishlist-status-error", isError);
  };
  const getStatus = async (): Promise<boolean> => {
    const response = await actions.callTool("takealot.auth_status");
    const error = toolError(response);
    if (error) throw error;
    const value = response.structuredContent as { authenticated?: boolean } | undefined;
    return Boolean(value?.authenticated);
  };
  const createLink = async (copyWhenReady = false) => {
    copyButton.disabled = true;
    setStatus("Preparing a temporary sign-out link…");
    try {
      const response = await actions.callTool("takealot.auth_start_logout");
      const error = toolError(response);
      if (error) throw error;
      const value = response.structuredContent as { url?: string } | undefined;
      if (!value?.url) throw new Error("Could not prepare a sign-out link.");
      logoutUrl = value.url;
      urlInput.value = logoutUrl;
      linkExpired = false;
      copyButton.disabled = false;
      copyLabel.textContent = "Copy sign-out link";
      setStatus("Link ready. It expires after 5 minutes.");
      if (copyWhenReady) await copyLink();
    } catch (error) {
      copyButton.disabled = false;
      setStatus(error instanceof Error ? error.message : "Could not prepare sign-out.", true);
    }
  };
  const watchForSignOut = async () => {
    if (monitoring) return;
    monitoring = true;
    const deadline = Date.now() + 5 * 60_000;
    while (Date.now() < deadline) {
      try {
        if (!(await getStatus())) {
          monitoring = false;
          copyLabel.textContent = "Signed out";
          copyButton.disabled = true;
          setStatus("You’re signed out on this computer.");
          return;
        }
      } catch (error) {
        monitoring = false;
        setStatus(error instanceof Error ? error.message : "Could not check sign-out status.", true);
        return;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 1500));
    }
    monitoring = false;
    linkExpired = true;
    copyLabel.textContent = "Copy a new sign-out link";
    setStatus("This sign-out link expired. Copy a new one to try again.", true);
  };
  const copyLink = async () => {
    if (!logoutUrl) return;
    if (await copyText(logoutUrl, navigator.clipboard)) {
      setStatus("Link copied. Open it in your browser to sign out.");
    } else {
      urlInput.focus();
      urlInput.select();
      setStatus("Link selected. Copy it, then open it in your browser.", true);
    }
    void watchForSignOut();
  };
  copyButton.addEventListener("click", () => {
    if (linkExpired || !logoutUrl) void createLink(true);
    else void copyLink();
  });
  urlInput.addEventListener("click", () => {
    urlInput.select();
    void watchForSignOut();
  });

  void (async () => {
    try {
      if (!(await getStatus())) {
        copyLabel.textContent = "Already signed out";
        setStatus("There’s no saved Takealot session on this computer.");
        return;
      }
      await createLink();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not check sign-in status.", true);
    }
  })();
}
