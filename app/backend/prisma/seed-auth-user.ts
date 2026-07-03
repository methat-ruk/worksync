import { randomUUID } from "node:crypto";

import { Client } from "pg";

import { normalizeEmail } from "../src/auth/dto/auth.dto";
import { PasswordHasher } from "../src/auth/services/password-hasher.service";
import { PasswordPolicyService } from "../src/auth/services/password-policy.service";

const DEFAULT_EMAIL = "demo@worksync.local";
const DEFAULT_DISPLAY_NAME = "WorkSync Demo User";
const DEFAULT_PASSWORD = "WorkSync demo passphrase 2026!";

type SeedOptions = {
  useTestDatabase: boolean;
  email: string;
  displayName: string;
  password: string;
};

type SeededUser = {
  id: string;
  email: string;
  displayName: string;
};

function valueAfterPrefix(argument: string, prefix: string): string | undefined {
  return argument.startsWith(prefix) ? argument.slice(prefix.length) : undefined;
}

function parseOptions(argv: string[]): SeedOptions {
  let useTestDatabase = false;
  let email = DEFAULT_EMAIL;
  let displayName = DEFAULT_DISPLAY_NAME;
  let password = DEFAULT_PASSWORD;

  for (const argument of argv) {
    if (argument === "--test") {
      useTestDatabase = true;
      continue;
    }

    const nextEmail = valueAfterPrefix(argument, "--email=");
    if (nextEmail !== undefined) {
      email = nextEmail;
      continue;
    }

    const nextDisplayName = valueAfterPrefix(argument, "--display-name=");
    if (nextDisplayName !== undefined) {
      displayName = nextDisplayName;
      continue;
    }

    throw new Error(`Unknown seed argument: ${argument}`);
  }

  password = process.env.WORKSYNC_SEED_PASSWORD ?? password;
  return { useTestDatabase, email, displayName, password };
}

function connectionString(options: SeedOptions): string {
  if (options.useTestDatabase) {
    const testDatabaseUrl = process.env.TEST_DATABASE_URL;
    if (!testDatabaseUrl) {
      throw new Error("TEST_DATABASE_URL is required when using --test");
    }
    return testDatabaseUrl;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }
  return databaseUrl;
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const email = normalizeEmail(options.email);
  const displayName = options.displayName.trim();
  const passwordPolicy = new PasswordPolicyService();
  passwordPolicy.assertValid(options.password, [email, displayName]);

  const client = new Client({
    connectionString: connectionString(options),
    connectionTimeoutMillis: 5_000
  });
  const passwordHash = await new PasswordHasher().hash(options.password);

  try {
    await client.connect();
    const result = await client.query<SeededUser>(
      `
        INSERT INTO "User" (
          id,
          email,
          "displayName",
          "passwordHash",
          "createdAt",
          "updatedAt"
        )
        VALUES ($1, $2, $3, $4, NOW(), NOW())
        ON CONFLICT (email)
        DO UPDATE SET
          "displayName" = EXCLUDED."displayName",
          "passwordHash" = EXCLUDED."passwordHash",
          "updatedAt" = NOW()
        RETURNING id, email, "displayName"
      `,
      [randomUUID(), email, displayName, passwordHash]
    );
    const user = result.rows[0];
    if (!user) {
      throw new Error("Seed did not return a user");
    }

    console.log(
      JSON.stringify({
        success: true,
        database: options.useTestDatabase ? "test" : "development",
        user,
        login: {
          email,
          password:
            options.password === DEFAULT_PASSWORD
              ? "<default-demo-password>"
              : "<custom>"
        }
      })
    );
  } finally {
    await client.end();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown seed error";
  console.error(`Auth user seed failed: ${message}`);
  process.exitCode = 1;
});
