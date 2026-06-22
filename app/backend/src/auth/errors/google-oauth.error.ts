export type GoogleOAuthFailureReason =
  | "GOOGLE_OAUTH_NOT_CONFIGURED"
  | "STATE_MISMATCH"
  | "TOKEN_EXCHANGE_FAILED"
  | "ID_TOKEN_INVALID"
  | "EMAIL_UNVERIFIED"
  | "NON_AUTHORITATIVE_EMAIL_CONFLICT"
  | "IDENTITY_CONFLICT"
  | "PROVIDER_ERROR";

export class GoogleOAuthError extends Error {
  constructor(readonly reasonCode: GoogleOAuthFailureReason) {
    super("Google OAuth failed");
    this.name = GoogleOAuthError.name;
  }
}
