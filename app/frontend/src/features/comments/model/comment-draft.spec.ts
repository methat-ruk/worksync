import { describe, expect, it } from "vitest";

import {
  canonicalizeCommentDraft,
  findActiveMentionQuery,
  hasDisallowedCommentControl,
  reconcileMentionsAfterEdit
} from "./comment-draft";

describe("comment draft", () => {
  it("keeps and shifts untouched mention ranges", () => {
    const body = "Ask @Alice Example today";
    const mention = { userId: "alice", start: 4, end: 18 };
    expect(
      reconcileMentionsAfterEdit(body, `Please ${body}`, [mention])
    ).toEqual([{ ...mention, start: 11, end: 25 }]);
  });

  it("removes structured metadata when an edit intersects a mention", () => {
    const body = "Ask @Alice Example today";
    expect(
      reconcileMentionsAfterEdit(body, "Ask @Alicia Example today", [
        { userId: "alice", start: 4, end: 18 }
      ])
    ).toEqual([]);
  });

  it("canonicalizes line endings and outer whitespace while retaining ranges", () => {
    expect(
      canonicalizeCommentDraft("  Ask @Alice Example  \r\n", [
        { userId: "alice", start: 6, end: 20 }
      ])
    ).toEqual({
      body: "Ask @Alice Example",
      mentions: [{ userId: "alice", start: 4, end: 18 }]
    });
  });

  it("detects eligible queries but ignores email-like and terminated text", () => {
    expect(findActiveMentionQuery("Ask @Ali", 8)).toEqual({
      start: 4,
      end: 8,
      query: "Ali"
    });
    expect(findActiveMentionQuery("name@example", 12)).toBeNull();
    expect(findActiveMentionQuery("Ask @Alice,", 11)).toBeNull();
    expect(findActiveMentionQuery("Ask @Alice\n", 11)).toBeNull();
  });

  it("rejects tabs and control characters while allowing LF", () => {
    expect(hasDisallowedCommentControl("line one\nline two")).toBe(false);
    expect(hasDisallowedCommentControl("line\titem")).toBe(true);
    expect(hasDisallowedCommentControl("\0unsafe")).toBe(true);
  });
});
