export type CachedProduct = {
  plid?: string;
  url: string;
  imageUrls?: string[];
};

function plidFromProduct(product: CachedProduct): string | undefined {
  if (product.plid && /^\d+$/.test(product.plid)) return product.plid;
  try {
    const match = /(?:^|\/)PLID(\d+)(?:\/|$)/i.exec(new URL(product.url).pathname);
    return match?.[1];
  } catch {
    return undefined;
  }
}

/** Holds only recent search results so the panel can restore fields the model omitted. */
export class SearchProductCache<T extends CachedProduct> {
  private readonly products = new Map<string, T>();

  remember(products: readonly T[]): void {
    for (const product of products) {
      const plid = plidFromProduct(product);
      if (!plid) continue;
      this.products.delete(plid);
      this.products.set(plid, product);
    }
    while (this.products.size > 500) {
      const oldest = this.products.keys().next().value as string | undefined;
      if (!oldest) break;
      this.products.delete(oldest);
    }
  }

  find(reference: string): T | undefined {
    const plid = plidFromProduct({ url: reference });
    return plid ? this.products.get(plid) : undefined;
  }

  hydrate<G extends { products: P[] }, P extends CachedProduct>(groups: G[] | undefined): G[] | undefined {
    return groups?.map((group) => ({
      ...group,
      products: group.products.map((product) => {
        const plid = plidFromProduct(product);
        const searched = plid ? this.products.get(plid) : undefined;
        if (!searched) return product;
        return {
          ...searched,
          ...product,
          imageUrls: product.imageUrls?.length ? product.imageUrls : searched.imageUrls ?? [],
        };
      }),
    })) as G[];
  }
}
