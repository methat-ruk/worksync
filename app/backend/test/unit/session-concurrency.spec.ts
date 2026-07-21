import {
  classifyRefreshReuse,
  REFRESH_CONCURRENCY_GRACE_MS
} from "../../src/auth/services/session.service";

describe("refresh reuse classification", () => {
  const lastUsedAt = new Date("2026-07-21T00:00:00.000Z");

  it.each([
    [4_999, "CONCURRENCY_CONFLICT"],
    [5_000, "CONCURRENCY_CONFLICT"],
    [5_001, "REPLAY"]
  ] as const)("classifies %i ms deterministically", (elapsedMs, expected) => {
    expect(
      classifyRefreshReuse(
        lastUsedAt,
        new Date(lastUsedAt.getTime() + elapsedMs)
      )
    ).toBe(expected);
  });

  it("keeps the grace policy fixed at five seconds", () => {
    expect(REFRESH_CONCURRENCY_GRACE_MS).toBe(5_000);
  });

  it("rejects a future last-used timestamp as unclassifiable", () => {
    expect(
      classifyRefreshReuse(lastUsedAt, new Date(lastUsedAt.getTime() - 1))
    ).toBe("UNCLASSIFIABLE");
  });
});
