import type { CommentMentionInput } from "./comment-contract";

export type ActiveMentionQuery = Readonly<{
  start: number;
  end: number;
  query: string;
}>;

function commonPrefixLength(left: string, right: string): number {
  const max = Math.min(left.length, right.length);
  let index = 0;
  while (index < max && left[index] === right[index]) {
    index += 1;
  }
  return index;
}

function commonSuffixLength(
  left: string,
  right: string,
  prefixLength: number
): number {
  const max = Math.min(left.length, right.length) - prefixLength;
  let index = 0;
  while (
    index < max &&
    left[left.length - 1 - index] === right[right.length - 1 - index]
  ) {
    index += 1;
  }
  return index;
}

export function reconcileMentionsAfterEdit(
  previousBody: string,
  nextBody: string,
  mentions: readonly CommentMentionInput[]
): CommentMentionInput[] {
  if (previousBody === nextBody) {
    return [...mentions];
  }
  const prefixLength = commonPrefixLength(previousBody, nextBody);
  const suffixLength = commonSuffixLength(
    previousBody,
    nextBody,
    prefixLength
  );
  const previousEditEnd = previousBody.length - suffixLength;
  const nextEditEnd = nextBody.length - suffixLength;
  const delta = nextEditEnd - previousEditEnd;

  return mentions.flatMap((mention) => {
    const mentionText = previousBody.slice(mention.start, mention.end);
    let nextMention: CommentMentionInput;
    if (mention.end <= prefixLength) {
      nextMention = { ...mention };
    } else if (mention.start >= previousEditEnd) {
      nextMention = {
        ...mention,
        start: mention.start + delta,
        end: mention.end + delta
      };
    } else {
      return [];
    }
    return nextBody.slice(nextMention.start, nextMention.end) === mentionText
      ? [nextMention]
      : [];
  });
}

function applyCanonicalStep(
  body: string,
  nextBody: string,
  mentions: readonly CommentMentionInput[]
) {
  return {
    body: nextBody,
    mentions: reconcileMentionsAfterEdit(body, nextBody, mentions)
  };
}

export function canonicalizeCommentDraft(
  body: string,
  mentions: readonly CommentMentionInput[]
): { body: string; mentions: CommentMentionInput[] } {
  let current = { body, mentions: [...mentions] };
  current = applyCanonicalStep(
    current.body,
    current.body.replace(/\r\n?/gu, "\n"),
    current.mentions
  );
  current = applyCanonicalStep(
    current.body,
    current.body.trimStart(),
    current.mentions
  );
  current = applyCanonicalStep(
    current.body,
    current.body.trimEnd(),
    current.mentions
  );
  return current;
}

export function hasDisallowedCommentControl(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return (
      character !== "\n" &&
      (code <= 31 || (code >= 127 && code <= 159))
    );
  });
}

export function findActiveMentionQuery(
  body: string,
  caret: number
): ActiveMentionQuery | null {
  if (caret < 1 || caret > body.length) {
    return null;
  }
  const start = body.lastIndexOf("@", caret - 1);
  if (start < 0) {
    return null;
  }
  const previous = body[start - 1];
  if (start > 0 && !/[\s([{<"'“‘]/u.test(previous ?? "")) {
    return null;
  }
  const query = body.slice(start + 1, caret);
  if (
    query.length < 1 ||
    query.length > 100 ||
    /^\s/u.test(query) ||
    /[\r\n@\])}>.,!?;:]/u.test(query)
  ) {
    return null;
  }
  return { start, end: caret, query };
}
