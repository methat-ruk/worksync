import type {
  AttachmentListData,
  PublicAttachment
} from "./attachment-contract";

export type AttachmentCollection = {
  items: PublicAttachment[];
  nextCursor: string | null;
};

export const emptyAttachmentCollection: AttachmentCollection = {
  items: [],
  nextCursor: null
};

function uniqueAttachments(
  items: readonly PublicAttachment[]
): PublicAttachment[] {
  const unique: PublicAttachment[] = [];
  const indexById = new Map<string, number>();

  for (const attachment of items) {
    const existingIndex = indexById.get(attachment.id);
    if (existingIndex === undefined) {
      indexById.set(attachment.id, unique.length);
      unique.push(attachment);
    } else {
      unique[existingIndex] = attachment;
    }
  }
  return unique;
}

export function reconcileAttachmentPage(
  current: AttachmentCollection,
  page: AttachmentListData,
  mode: "replace" | "append"
): AttachmentCollection {
  return {
    items: uniqueAttachments(
      mode === "replace" ? page.items : [...current.items, ...page.items]
    ),
    nextCursor: page.nextCursor
  };
}
