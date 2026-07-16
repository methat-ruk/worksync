import { describe, expect, it } from "vitest";

import { safeNextPath } from "./navigation";

describe("safeNextPath", () => {
  it.each([
    ["/app", "/app"],
    ["/app/projects/project-1?tab=board#task-2", "/app/projects/project-1?tab=board#task-2"],
    ["/app?return=%2Fprojects", "/app?return=%2Fprojects"]
  ])("accepts local application paths", (value, expected) => {
    expect(safeNextPath(value)).toBe(expected);
  });

  it.each([
    null,
    "",
    "app",
    "https://evil.example/path",
    "//evil.example/path",
    "///evil.example/path",
    "\\\\evil.example\\path",
    "/\\evil.example/path",
    "javascript:alert(1)",
    "data:text/html,unsafe",
    "%2F%2Fevil.example",
    "%252F%252Fevil.example",
    "/%5Cevil.example",
    "/%255Cevil.example",
    "/..//evil.example",
    "/safe/..//evil.example",
    "/.//evil.example",
    "/%2e%2e//evil.example",
    "/a/..///evil.example",
    "/app%0Aevil",
    "/app%",
    "%2525252525252F%2525252525252Fevil.example"
  ])("rejects unsafe redirect value %#", (value) => {
    expect(safeNextPath(value)).toBe("/app");
  });
});
