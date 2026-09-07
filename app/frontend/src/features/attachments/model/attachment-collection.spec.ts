import { describe, expect, it } from "vitest";

import type { PublicAttachment } from "./attachment-contract";
import {
  emptyAttachmentCollection,
  reconcileAttachmentPage
} from "./attachment-collection";

function attachment(id: string, filename = `${id}.png`): PublicAttachment {
  return {
    id,
    filename,
    size: 4,
    contentType: "image/png",
    status: "AVAILABLE",
    creator: { id: "owner-1", displayName: "Owner" },
    createdAt: new Date("2026-09-07T10:00:00.000Z"),
    updatedAt: new Date("2026-09-07T10:00:00.000Z")
  };
}

describe("attachment collection reconciliation", () => {
  it("replaces stale items during a full refresh", () => {
    const result = reconcileAttachmentPage(
      { items: [attachment("old")], nextCursor: "old-cursor" },
      { items: [attachment("new")], nextCursor: null },
      "replace"
    );

    expect(result).toEqual({ items: [attachment("new")], nextCursor: null });
  });

  it("appends pages while replacing duplicate IDs with current metadata", () => {
    const result = reconcileAttachmentPage(
      { items: [attachment("one"), attachment("two")], nextCursor: "next" },
      {
        items: [attachment("two", "renamed.png"), attachment("three")],
        nextCursor: null
      },
      "append"
    );

    expect(result.items.map(({ id, filename }) => ({ id, filename }))).toEqual([
      { id: "one", filename: "one.png" },
      { id: "two", filename: "renamed.png" },
      { id: "three", filename: "three.png" }
    ]);
    expect(result.nextCursor).toBeNull();
  });

  it("does not mutate the exported empty collection", () => {
    reconcileAttachmentPage(
      emptyAttachmentCollection,
      { items: [attachment("one")], nextCursor: null },
      "append"
    );

    expect(emptyAttachmentCollection).toEqual({ items: [], nextCursor: null });
  });
});
