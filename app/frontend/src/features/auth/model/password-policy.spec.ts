import { PASSWORD_POLICY as sharedPolicy } from "@worksync/auth-policy/constants";
import { evaluatePasswordPolicy } from "@worksync/auth-policy/evaluate";
import { describe, expect, it } from "vitest";

import {
  evaluatePassword,
  PASSWORD_POLICY as frontendPolicy
} from "./password-policy";

describe("frontend password policy contract", () => {
  it("uses the exact shared policy constants", () => {
    expect(frontendPolicy).toBe(sharedPolicy);
    expect(frontendPolicy).toEqual({
      minLength: 12,
      maxLength: 128,
      minimumScore: 3,
      version: 1
    });
  });

  it.each([
    "orbit lantern velvet meadow 47",
    "violet river atlas harbor 82"
  ])("matches the shared evaluator for accepted password %s", async (password) => {
    expect(await evaluatePassword(password)).toEqual(
      evaluatePasswordPolicy(password)
    );
    expect((await evaluatePassword(password)).valid).toBe(true);
  });

  it.each([
    "too short",
    " password1234",
    "password1234 ",
    "password1234"
  ])("matches the shared evaluator for rejected password %s", async (password) => {
    expect(await evaluatePassword(password)).toEqual(
      evaluatePasswordPolicy(password)
    );
    expect((await evaluatePassword(password)).valid).toBe(false);
  });
});
