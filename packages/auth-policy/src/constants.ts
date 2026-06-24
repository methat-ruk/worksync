export const PASSWORD_POLICY = {
  minLength: 12,
  maxLength: 128,
  minimumScore: 3,
  version: 1
} as const;

export const PASSWORD_POLICY_MESSAGES = {
  length: `Use ${PASSWORD_POLICY.minLength}–${PASSWORD_POLICY.maxLength} characters.`,
  noOuterWhitespace: "Do not start or end the password with whitespace.",
  strongEnough: "Use a password that is not common or easily guessed."
} as const;

export type PasswordPolicyCheck =
  keyof typeof PASSWORD_POLICY_MESSAGES;
