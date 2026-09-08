import { PrismaPg } from "@prisma/adapter-pg";
import { Client, Pool, type PoolClient } from "pg";
import { PrismaClient } from "../generated/prisma/client";

/** A worker-owned pool: API connections and session semantics remain independent. */
export function createJobsDatabase(connectionString: string) {
  const clients = new Set<PoolClient>();
  const pool = new Pool({
    connectionString, max: 2, connectionTimeoutMillis: 2000,
    statement_timeout: 2000, lock_timeout: 500,
    idle_in_transaction_session_timeout: 5000, query_timeout: 3000,
    application_name: "worksync-session-cleanup"
  });
  pool.on("connect", (client) => clients.add(client));
  pool.on("remove", (client) => clients.delete(client));
  // Query callers handle failures; idle socket errors must not crash without cleanup.
  pool.on("error", () => undefined);
  const schema = new URL(connectionString).searchParams.get("schema") ?? "public";
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool, { schema }) });
  return {
    prisma,
    async close() { await prisma.$disconnect(); await pool.end(); },
    forceClose() {
      for (const client of clients) {
        if (client instanceof Client) void client.end().catch(() => undefined);
      }
    }
  };
}

export type JobsDatabase = ReturnType<typeof createJobsDatabase>;
