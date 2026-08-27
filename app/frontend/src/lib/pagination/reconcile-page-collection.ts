type PageCollection<T> = {
  items: readonly T[];
  page: number;
  pageSize: number;
  total: number;
};

type ReconcilePageCollectionInput<T> =
  | {
      mode: "replace";
      page: PageCollection<T>;
    }
  | {
      mode: "append";
      currentItems: readonly T[];
      page: PageCollection<T>;
    };

export type ReconciledPageCollection<T> = {
  items: T[];
  total: number;
  nextPage: number;
  exhausted: boolean;
  inconsistent: boolean;
};

export function reconcilePageCollection<T>(
  input: ReconcilePageCollectionInput<T>,
  getId: (item: T) => string
): ReconciledPageCollection<T> {
  const currentItems = input.mode === "append" ? input.currentItems : [];
  const itemsById = new Map<string, T>();

  for (const item of currentItems) {
    itemsById.set(getId(item), item);
  }
  for (const item of input.page.items) {
    itemsById.set(getId(item), item);
  }

  const items = [...itemsById.values()];
  const total = Math.max(input.page.total, items.length);
  const exhausted = input.page.page * input.page.pageSize >= total;

  return {
    items,
    total,
    nextPage: input.page.page + 1,
    exhausted,
    inconsistent: exhausted && items.length < total
  };
}
