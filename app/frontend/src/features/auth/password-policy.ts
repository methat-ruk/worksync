import {
  PASSWORD_POLICY,
  PASSWORD_POLICY_MESSAGES
} from "@worksync/auth-policy/constants";
import type { PasswordPolicyEvaluation } from "@worksync/auth-policy/evaluate";

export {
  PASSWORD_POLICY,
  PASSWORD_POLICY_MESSAGES,
  type PasswordPolicyEvaluation
};

let evaluatorPromise:
  | Promise<typeof import("@worksync/auth-policy/evaluate")>
  | null = null;

export async function evaluatePassword(
  password: string,
  userInputs: string[] = []
): Promise<PasswordPolicyEvaluation> {
  evaluatorPromise ??= import("@worksync/auth-policy/evaluate");
  const { evaluatePasswordPolicy } = await evaluatorPromise;
  return evaluatePasswordPolicy(password, userInputs);
}

export function immediatePasswordChecks(password: string) {
  return {
    length:
      password.length >= PASSWORD_POLICY.minLength &&
      password.length <= PASSWORD_POLICY.maxLength,
    noOuterWhitespace: password === password.trim()
  };
}
