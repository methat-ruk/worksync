export const MAX_COMMENT_LENGTH = 4_000;
export const MAX_MENTION_OCCURRENCES = 20;
export const MAX_MENTIONED_USERS = 10;

const MENTION_OPEN_BOUNDARY_PATTERN = /[\s([{<"'“‘]/u;

function isControlCharacter(value: string): boolean {
  const code = value.charCodeAt(0);
  return code <= 31 || (code >= 127 && code <= 159);
}

function hasDisallowedCommentControl(value: string): boolean {
  return [...value].some(
    (character) => character !== "\n" && isControlCharacter(character)
  );
}

export type MentionOccurrence = Readonly<{
  userId: string;
  start: number;
  end: number;
}>;

export function canonicalizeCommentBody(value: string): string {
  return value.replace(/\r\n?/gu, "\n").trim();
}

export function isCanonicalCommentBody(value: string): boolean {
  return (
    value.length >= 1 &&
    value.length <= MAX_COMMENT_LENGTH &&
    canonicalizeCommentBody(value) === value &&
    !hasDisallowedCommentControl(value)
  );
}

export function deriveMentionLabel(displayName: string): string {
  return displayName
    .replace(/\s+/gu, " ")
    .split("")
    .filter((character) => !isControlCharacter(character))
    .join("")
    .trim();
}

function hasMentionBoundary(body: string, start: number): boolean {
  return start === 0 || MENTION_OPEN_BOUNDARY_PATTERN.test(body[start - 1] ?? "");
}

export function hasValidMentionOccurrences(
  body: string,
  occurrences: readonly MentionOccurrence[],
  mentionLabelsByUserId: ReadonlyMap<string, string>,
  actorId: string
): boolean {
  if (occurrences.length > MAX_MENTION_OCCURRENCES) {
    return false;
  }

  const distinctUserIds = new Set(occurrences.map(({ userId }) => userId));
  if (
    distinctUserIds.size > MAX_MENTIONED_USERS ||
    distinctUserIds.has(actorId)
  ) {
    return false;
  }

  const ordered = [...occurrences].sort(
    (left, right) => left.start - right.start || left.end - right.end
  );
  const ranges = new Set<string>();
  let previousEnd = -1;

  for (const occurrence of ordered) {
    const rangeKey = `${occurrence.start}:${occurrence.end}`;
    const mentionLabel = mentionLabelsByUserId.get(occurrence.userId);
    if (
      !Number.isInteger(occurrence.start) ||
      !Number.isInteger(occurrence.end) ||
      occurrence.start < 0 ||
      occurrence.end <= occurrence.start ||
      occurrence.end > body.length ||
      occurrence.start < previousEnd ||
      ranges.has(rangeKey) ||
      !mentionLabel ||
      !hasMentionBoundary(body, occurrence.start) ||
      body.slice(occurrence.start, occurrence.end) !== `@${mentionLabel}`
    ) {
      return false;
    }
    ranges.add(rangeKey);
    previousEnd = occurrence.end;
  }

  return true;
}
