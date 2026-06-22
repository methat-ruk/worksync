import { GoogleOAuthError } from "../../src/auth/errors/google-oauth.error";
import type {
  GoogleIdentityProfile,
  GoogleOAuthTransaction
} from "../../src/auth/types/google-oauth.types";

export type GoogleOAuthTestHarnessOptions = {
  profile?: GoogleIdentityProfile | undefined;
  failure?: Error | undefined;
  enforceSingleUseCodes?: boolean;
};

export function createGoogleOAuthTestHarness(
  options: GoogleOAuthTestHarnessOptions = {}
) {
  let profile = options.profile;
  let failure = options.failure;
  const usedCodes = new Set<string>();
  const enforceSingleUseCodes = options.enforceSingleUseCodes ?? true;

  const provider = {
    authorizationUrl: jest.fn(
      (transaction: GoogleOAuthTransaction) =>
        `https://accounts.google.test/authorize?state=${encodeURIComponent(transaction.state)}`
    ),
    authenticate: jest.fn(
      async (code: string): Promise<GoogleIdentityProfile> => {
        if (failure) {
          throw failure;
        }
        if (enforceSingleUseCodes && usedCodes.has(code)) {
          throw new GoogleOAuthError("TOKEN_EXCHANGE_FAILED");
        }
        usedCodes.add(code);
        if (!profile) {
          throw new Error("Google profile is not configured for this test");
        }
        return profile;
      }
    )
  };

  return {
    provider,
    setProfile(nextProfile: GoogleIdentityProfile | undefined): void {
      profile = nextProfile;
    },
    setFailure(nextFailure: Error | undefined): void {
      failure = nextFailure;
    },
    resetUsedCodes(): void {
      usedCodes.clear();
    }
  };
}
