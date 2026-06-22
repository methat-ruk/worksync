import {
  isAuthoritativeGoogleEmail
} from "../../src/auth/services/google-identity.service";

describe("Google identity policy", () => {
  it.each([
    ["user@gmail.com", undefined, true],
    ["user@company.example", "company.example", true],
    ["user@third-party.example", undefined, false]
  ])(
    "classifies %s with hosted domain %s",
    (email, hostedDomain, expected) => {
      expect(
        isAuthoritativeGoogleEmail({
          subject: "subject",
          email,
          displayName: "User",
          ...(hostedDomain ? { hostedDomain } : {})
        })
      ).toBe(expected);
    }
  );
});
