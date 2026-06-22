export type GoogleOAuthTransaction = {
  state: string;
  nonce: string;
  codeVerifier: string;
  codeChallenge: string;
};

export type GoogleOAuthTransactionCookies = Pick<
  GoogleOAuthTransaction,
  "state" | "nonce" | "codeVerifier"
>;

export type GoogleIdentityProfile = {
  subject: string;
  email: string;
  displayName: string;
  hostedDomain?: string;
};
