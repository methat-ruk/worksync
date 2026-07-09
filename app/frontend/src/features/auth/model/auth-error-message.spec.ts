import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api/api-error";
import { authErrorMessage } from "./auth-error-message";

describe("authErrorMessage", () => {
  it("maps rate-limit errors to stable user feedback", () => {
    expect(
      authErrorMessage(
        new ApiError(429, {
          success: false,
          message: "Too many authentication attempts",
          data: { code: "RATE_LIMITED" }
        })
      )
    ).toBe("Too many attempts. Please wait and try again.");
  });
});
