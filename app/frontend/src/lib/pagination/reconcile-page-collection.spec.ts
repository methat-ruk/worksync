import { describe, expect, it } from "vitest";

import { reconcilePageCollection } from "./reconcile-page-collection";

type Item = {
  id: string;
  label: string;
};

const getId = (item: Item) => item.id;

describe("reconcilePageCollection", () => {
  it("replaces with the latest value for each ID without moving its first position", () => {
    const result = reconcilePageCollection(
      {
        mode: "replace",
        page: {
          items: [
            { id: "a", label: "A before" },
            { id: "b", label: "B" },
            { id: "a", label: "A after" }
          ],
          page: 1,
          pageSize: 20,
          total: 3
        }
      },
      getId
    );

    expect(result).toEqual({
      items: [
        { id: "a", label: "A after" },
        { id: "b", label: "B" }
      ],
      total: 3,
      nextPage: 2,
      exhausted: true,
      inconsistent: true
    });
  });

  it("updates existing positions and appends new IDs in incoming order", () => {
    const result = reconcilePageCollection(
      {
        mode: "append",
        currentItems: [
          { id: "a", label: "A before" },
          { id: "b", label: "B before" }
        ],
        page: {
          items: [
            { id: "b", label: "B after" },
            { id: "c", label: "C before" },
            { id: "a", label: "A after" },
            { id: "c", label: "C after" },
            { id: "d", label: "D" }
          ],
          page: 2,
          pageSize: 2,
          total: 4
        }
      },
      getId
    );

    expect(result).toEqual({
      items: [
        { id: "a", label: "A after" },
        { id: "b", label: "B after" },
        { id: "c", label: "C after" },
        { id: "d", label: "D" }
      ],
      total: 4,
      nextPage: 3,
      exhausted: true,
      inconsistent: false
    });
  });

  it("uses the latest higher total", () => {
    const result = reconcilePageCollection(
      {
        mode: "append",
        currentItems: [{ id: "a", label: "A" }],
        page: {
          items: [{ id: "b", label: "B" }],
          page: 2,
          pageSize: 2,
          total: 7
        }
      },
      getId
    );

    expect(result.total).toBe(7);
    expect(result.exhausted).toBe(false);
    expect(result.inconsistent).toBe(false);
  });

  it("uses the latest lower total but clamps it to the reconciled item count", () => {
    const result = reconcilePageCollection(
      {
        mode: "append",
        currentItems: [
          { id: "a", label: "A" },
          { id: "b", label: "B" },
          { id: "c", label: "C" }
        ],
        page: {
          items: [],
          page: 2,
          pageSize: 2,
          total: 1
        }
      },
      getId
    );

    expect(result).toEqual({
      items: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
        { id: "c", label: "C" }
      ],
      total: 3,
      nextPage: 3,
      exhausted: true,
      inconsistent: false
    });
  });

  it("marks an exhausted empty page inconsistent when reported items are missing", () => {
    const result = reconcilePageCollection(
      {
        mode: "append",
        currentItems: [{ id: "a", label: "A" }],
        page: {
          items: [],
          page: 2,
          pageSize: 1,
          total: 2
        }
      },
      getId
    );

    expect(result.exhausted).toBe(true);
    expect(result.inconsistent).toBe(true);
  });

  it("keeps a non-terminal empty page eligible for another page", () => {
    const result = reconcilePageCollection(
      {
        mode: "replace",
        page: {
          items: [],
          page: 1,
          pageSize: 2,
          total: 3
        }
      },
      getId
    );

    expect(result).toEqual({
      items: [],
      total: 3,
      nextPage: 2,
      exhausted: false,
      inconsistent: false
    });
  });
});
