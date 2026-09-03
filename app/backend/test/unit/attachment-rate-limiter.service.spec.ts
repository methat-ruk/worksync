import type { AuthRateLimitStore } from "../../src/auth/services/auth-rate-limit.service";
import { AttachmentRateLimiterService } from "../../src/attachments/attachment-rate-limiter.service";

describe("AttachmentRateLimiterService", () => {
  it("consumes actor and workspace windows", async () => {
    const store: AuthRateLimitStore = { consume: jest.fn().mockResolvedValue(1) };
    const limiter = new AttachmentRateLimiterService(store);
    await expect(limiter.consume("actor-1", "workspace-1")).resolves.toBeUndefined();
    expect(store.consume).toHaveBeenCalledTimes(2);
    expect(store.consume).toHaveBeenCalledWith(
      expect.stringContaining("worksync:attachment-rate:actor:"),
      600_000
    );
  });

  it("fails closed when Redis is unavailable", async () => {
    const store: AuthRateLimitStore = {
      consume: jest.fn().mockRejectedValue(new Error("offline"))
    };
    await expect(
      new AttachmentRateLimiterService(store).consume("actor-1", "workspace-1")
    ).rejects.toMatchObject({ status: 503 });
  });

  it("rejects actor or workspace limit exhaustion", async () => {
    const store: AuthRateLimitStore = {
      consume: jest.fn().mockResolvedValueOnce(11).mockResolvedValueOnce(1)
    };
    await expect(
      new AttachmentRateLimiterService(store).consume("actor-1", "workspace-1")
    ).rejects.toMatchObject({ status: 429 });
  });
});
