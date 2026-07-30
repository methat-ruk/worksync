import { randomUUID } from "node:crypto";

import { Client } from "pg";

import { normalizeEmail } from "../src/auth/dto/auth.dto";
import { PasswordHasher } from "../src/auth/services/password-hasher.service";
import { PasswordPolicyService } from "../src/auth/services/password-policy.service";

const DEFAULT_EMAIL = "demo@worksync.local";
const DEFAULT_DISPLAY_NAME = "WorkSync Demo User";
const DEFAULT_PASSWORD = "WorkSync demo passphrase 2026!";
const LOCAL_SEED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "postgres",
  "worksync-postgres"
]);

type SeedOptions = {
  useTestDatabase: boolean;
  allowNonLocal: boolean;
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
  let allowNonLocal = process.env.WORKSYNC_ALLOW_NON_LOCAL_SEED === "true";
  let email = DEFAULT_EMAIL;
  let displayName = DEFAULT_DISPLAY_NAME;
  let password = DEFAULT_PASSWORD;

  for (const argument of argv) {
    if (argument === "--test") {
      useTestDatabase = true;
      continue;
    }

    if (argument === "--allow-non-local") {
      allowNonLocal = true;
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
  return { useTestDatabase, allowNonLocal, email, displayName, password };
}

function connectionString(options: SeedOptions): string {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  if (options.useTestDatabase) {
    let parsedDatabaseUrl: URL;
    try {
      parsedDatabaseUrl = new URL(databaseUrl);
    } catch {
      throw new Error("DATABASE_URL must be a valid PostgreSQL URL");
    }
    if (
      parsedDatabaseUrl.protocol !== "postgresql:" &&
      parsedDatabaseUrl.protocol !== "postgres:"
    ) {
      throw new Error("DATABASE_URL must use the PostgreSQL protocol");
    }
    const databaseName = decodeURIComponent(
      parsedDatabaseUrl.pathname.replace(/^\/+/, "")
    );
    if (!databaseName.endsWith("_test")) {
      throw new Error(
        "DATABASE_URL must target a test database whose name ends in _test"
      );
    }
  }

  return databaseUrl;
}

function assertSafeSeedTarget(connectionStringValue: string, options: SeedOptions): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed auth users when NODE_ENV=production");
  }

  const databaseUrl = new URL(connectionStringValue);
  const hostname = databaseUrl.hostname.toLowerCase();
  const isLocalTarget = LOCAL_SEED_HOSTS.has(hostname);
  if (isLocalTarget) {
    return;
  }

  if (!options.allowNonLocal) {
    throw new Error(
      "Refusing to seed a non-local database. Use --allow-non-local or WORKSYNC_ALLOW_NON_LOCAL_SEED=true only for an intentional shared development target."
    );
  }

  if (options.password === DEFAULT_PASSWORD) {
    throw new Error(
      "WORKSYNC_SEED_PASSWORD is required when seeding a non-local database"
    );
  }
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const email = normalizeEmail(options.email);
  const displayName = options.displayName.trim();
  const passwordPolicy = new PasswordPolicyService();
  passwordPolicy.assertValid(options.password, [email, displayName]);
  const targetConnectionString = connectionString(options);
  assertSafeSeedTarget(targetConnectionString, options);

  const client = new Client({
    connectionString: targetConnectionString,
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
