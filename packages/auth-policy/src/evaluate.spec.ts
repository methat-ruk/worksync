import { describe, expect, it } from "vitest";

import { evaluatePasswordPolicy } from "./evaluate";

describe("evaluatePasswordPolicy", () => {
  it("accepts a strong passphrase without composition rules", () => {
    expect(
      evaluatePasswordPolicy("orbit lantern velvet meadow 47")
    ).toMatchObject({
      valid: true,
      checks: {
        length: true,
        noOuterWhitespace: true,
        strongEnough: true
      }
    });
  });

  it.each([
    ["too short", "short"],
    ["leading whitespace", " orbit lantern velvet meadow 47"],
    ["trailing whitespace", "orbit lantern velvet meadow 47 "],
    ["common password", "password1234"]
  ])("rejects %s", (_case, password) => {
    expect(evaluatePasswordPolicy(password).valid).toBe(false);
  });
});
