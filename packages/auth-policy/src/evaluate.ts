import { zxcvbn, zxcvbnOptions } from "@zxcvbn-ts/core";
import * as commonPackage from "@zxcvbn-ts/language-common";
import * as englishPackage from "@zxcvbn-ts/language-en";

import {
  PASSWORD_POLICY,
  PASSWORD_POLICY_MESSAGES,
  type PasswordPolicyCheck
} from "./constants";

zxcvbnOptions.setOptions({
  dictionary: {
    ...commonPackage.dictionary,
    ...englishPackage.dictionary
  },
  graphs: commonPackage.adjacencyGraphs,
  translations: englishPackage.translations
});

export type PasswordPolicyEvaluation = {
  valid: boolean;
  score: 0 | 1 | 2 | 3 | 4;
  checks: Record<PasswordPolicyCheck, boolean>;
  messages: string[];
};

export function evaluatePasswordPolicy(
  password: string,
  userInputs: string[] = []
): PasswordPolicyEvaluation {
  const length =
    password.length >= PASSWORD_POLICY.minLength &&
    password.length <= PASSWORD_POLICY.maxLength;
  const noOuterWhitespace = password === password.trim();
  const result =
    length && noOuterWhitespace
      ? zxcvbn(password, userInputs.filter(Boolean))
      : null;
  const score = result?.score ?? 0;
  const strongEnough = score >= PASSWORD_POLICY.minimumScore;
  const checks = { length, noOuterWhitespace, strongEnough };
  const messages = (
    Object.keys(checks) as PasswordPolicyCheck[]
  ).flatMap((check) =>
    checks[check] ? [] : [PASSWORD_POLICY_MESSAGES[check]]
  );

  return {
    valid: Object.values(checks).every(Boolean),
    score,
    checks,
    messages
  };
}
