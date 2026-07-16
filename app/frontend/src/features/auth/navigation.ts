const FALLBACK_PATH = "/app";
const TRUSTED_ORIGIN = new URL("https://worksync.invalid");
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const MAX_DECODE_ROUNDS = 5;

function isSafeRepresentation(value: string): boolean {
  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    CONTROL_CHARACTERS.test(value)
  ) {
    return false;
  }

  try {
    return new URL(value, TRUSTED_ORIGIN).origin === TRUSTED_ORIGIN.origin;
  } catch {
    return false;
  }
}

function canonicalSafePath(value: string): string | null {
  try {
    const accepted = new URL(value, TRUSTED_ORIGIN);
    const canonical = `${accepted.pathname}${accepted.search}${accepted.hash}`;
    return isSafeRepresentation(canonical) ? canonical : null;
  } catch {
    return null;
  }
}

export function safeNextPath(value: string | null): string {
  if (!value) {
    return FALLBACK_PATH;
  }

  let representation = value;
  for (let round = 0; round < MAX_DECODE_ROUNDS; round += 1) {
    if (!isSafeRepresentation(representation)) {
      return FALLBACK_PATH;
    }

    let decoded: string;
    try {
      decoded = decodeURIComponent(representation);
    } catch {
      return FALLBACK_PATH;
    }

    if (decoded === representation) {
      return canonicalSafePath(value) ?? FALLBACK_PATH;
    }
    representation = decoded;
  }

  if (!isSafeRepresentation(representation)) {
    return FALLBACK_PATH;
  }
  try {
    if (decodeURIComponent(representation) !== representation) {
      return FALLBACK_PATH;
    }
  } catch {
    return FALLBACK_PATH;
  }

  return canonicalSafePath(value) ?? FALLBACK_PATH;
}
