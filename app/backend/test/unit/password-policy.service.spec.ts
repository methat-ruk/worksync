import { PasswordPolicyService } from "../../src/auth/services/password-policy.service";

describe("PasswordPolicyService", () => {
  const service = new PasswordPolicyService();

  it("accepts a strong passphrase without composition rules", () => {
    expect(() =>
      service.assertValid("orbit lantern velvet meadow 47")
    ).not.toThrow();
  });

  it.each([
    ["too short", "short"],
    ["leading whitespace", " orbit lantern velvet meadow 47"],
    ["trailing whitespace", "orbit lantern velvet meadow 47 "],
    ["known weak password", "password1234"]
  ])("rejects %s through the stable public code", (_case, password) => {
    expect(() => service.assertValid(password)).toThrow(
      expect.objectContaining({
        response: {
          message: "Password does not meet security requirements",
          code: "AUTH_PASSWORD_POLICY_VIOLATION"
        }
      })
    );
  });
});
