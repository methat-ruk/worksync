import { performance } from "node:perf_hooks";
import { Prisma, type PrismaClient } from "../../generated/prisma/client";

export const SESSION_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export type CleanupResult = {
  mode: "dry-run" | "apply";
  deleted: number;
  wouldDelete: number;
  batches: number;
  capped: boolean;
};

export class SessionCleanupService {
  constructor(private readonly prisma: PrismaClient) {}

  async run(mode: CleanupResult["mode"], stopping: () => boolean = () => false): Promise<CleanupResult> {
    const started = performance.now();
    const clock = await this.prisma.$queryRaw<{ now: Date }[]>`SELECT CURRENT_TIMESTAMP AS now`;
    const now = clock[0]?.now;
    if (!now || !Number.isFinite(now.getTime()) || Math.abs(now.getTime() - Date.now()) > 300000) throw new Error("CLOCK_SKEW");
    const cutoff = new Date(now.getTime() - SESSION_RETENTION_MS);
    const result: CleanupResult = { mode, deleted: 0, wouldDelete: 0, batches: 0, capped: false };
    let cursor: { expiresAt: Date; id: string } | undefined;
    for (let batch = 0; batch < 10; batch++) {
      if (stopping() || performance.now() - started > 13000) return { ...result, capped: true };
      const selected = await this.prisma.$transaction(async (tx) => {
        const rows = await tx.authSession.findMany({
          where: {
            expiresAt: { lte: cutoff },
            ...(mode === "dry-run" && cursor ? { OR: [
              { expiresAt: { gt: cursor.expiresAt } },
              { expiresAt: cursor.expiresAt, id: { gt: cursor.id } }
            ] } : {})
          },
          orderBy: [{ expiresAt: "asc" }, { id: "asc" }], take: 500,
          select: { id: true, expiresAt: true }
        });
        if (mode === "apply" && rows.length) {
          const deleted = await tx.authSession.deleteMany({ where: {
            id: { in: rows.map((row) => row.id) }, expiresAt: { lte: cutoff }
          } });
          return { rows, deleted: deleted.count };
        }
        return { rows, deleted: 0 };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 2000, timeout: 5000 });
      if (!selected.rows.length) return result;
      result.batches++;
      result.deleted += selected.deleted;
      if (mode === "dry-run") result.wouldDelete += selected.rows.length;
      cursor = selected.rows[selected.rows.length - 1];
      if (selected.rows.length < 500) return result;
    }
    return { ...result, capped: true };
  }
}
