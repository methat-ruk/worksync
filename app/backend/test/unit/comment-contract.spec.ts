import {
  canonicalizeCommentBody,
  deriveMentionLabel,
  hasValidMentionOccurrences,
  isCanonicalCommentBody
} from "../../src/comments/comment-contract";

describe("comment contracts", () => {
  it("canonicalizes line endings and outer whitespace without changing inner text", () => {
    expect(canonicalizeCommentBody("  First\r\nSecond  ")).toBe(
      "First\nSecond"
    );
    expect(isCanonicalCommentBody("First\nSecond")).toBe(true);
    expect(isCanonicalCommentBody(" First")).toBe(false);
    expect(isCanonicalCommentBody("First\r\nSecond")).toBe(false);
    expect(isCanonicalCommentBody("First\tSecond")).toBe(false);
    expect(isCanonicalCommentBody("\0unsafe")).toBe(false);
    expect(isCanonicalCommentBody("x".repeat(4_001))).toBe(false);
  });

  it("derives a stable plain-text mention label", () => {
    expect(deriveMentionLabel("  Alice\n\tExample  ")).toBe("Alice Example");
    expect(deriveMentionLabel("\u0000\u0007")).toBe("");
  });

  it("accepts non-overlapping UTF-16 ranges at valid boundaries", () => {
    const body = "Hello @Alice Example and (@Bob).";
    const labels = new Map([
      ["alice", "Alice Example"],
      ["bob", "Bob"]
    ]);
    expect(
      hasValidMentionOccurrences(
        body,
        [
          { userId: "alice", start: 6, end: 20 },
          { userId: "bob", start: 26, end: 30 }
        ],
        labels,
        "author"
      )
    ).toBe(true);
    expect(
      hasValidMentionOccurrences(
        "😀 @Alice",
        [{ userId: "alice", start: 3, end: 9 }],
        new Map([["alice", "Alice"]]),
        "author"
      )
    ).toBe(true);
  });

  it("enforces distinct-recipient and occurrence bounds", () => {
    const elevenMentions = Array.from({ length: 11 }, (_, index) => ({
      userId: `user-${index}`,
      start: index * 3,
      end: index * 3 + 2
    }));
    const body = elevenMentions.map((_, index) => `@${index}`).join(" ");
    const labels = new Map(
      elevenMentions.map(({ userId }, index) => [userId, `${index}`])
    );
    expect(
      hasValidMentionOccurrences(body, elevenMentions, labels, "author")
    ).toBe(false);
    expect(
      hasValidMentionOccurrences(
        "@A",
        Array.from({ length: 21 }, () => ({
          userId: "a",
          start: 0,
          end: 2
        })),
        new Map([["a", "A"]]),
        "author"
      )
    ).toBe(false);
  });

  it.each([
    {
      name: "self mention",
      body: "@Alice",
      occurrences: [{ userId: "alice", start: 0, end: 6 }],
      actorId: "alice"
    },
    {
      name: "email-like boundary",
      body: "name@Alice",
      occurrences: [{ userId: "alice", start: 4, end: 10 }],
      actorId: "author"
    },
    {
      name: "mismatched label",
      body: "@Alicia",
      occurrences: [{ userId: "alice", start: 0, end: 7 }],
      actorId: "author"
    },
    {
      name: "overlap",
      body: "@Alice",
      occurrences: [
        { userId: "alice", start: 0, end: 6 },
        { userId: "alice", start: 1, end: 6 }
      ],
      actorId: "author"
    },
    {
      name: "missing member",
      body: "@Unknown",
      occurrences: [{ userId: "unknown", start: 0, end: 8 }],
      actorId: "author"
    }
  ])("rejects $name", ({ body, occurrences, actorId }) => {
    expect(
      hasValidMentionOccurrences(
        body,
        occurrences,
        new Map([["alice", "Alice"]]),
        actorId
      )
    ).toBe(false);
  });
});
