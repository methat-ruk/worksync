import type { AuthRateLimitStore } from "../../src/auth/services/auth-rate-limit.service";
import { AttachmentRateLimiterService } from "../../src/attachments/attachment-rate-limiter.service";

describe("AttachmentRateLimiterService", () => {
  it("consumes actor then workspace windows", async () => {
    const store: AuthRateLimitStore = { consume: jest.fn().mockResolvedValue(1) };
    const limiter = new AttachmentRateLimiterService(store);
    await expect(limiter.consume("actor-1", "workspace-1")).resolves.toBeUndefined();
    expect(store.consume).toHaveBeenCalledTimes(2);
    expect(store.consume).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("worksync:attachment-rate:actor:"),
      600_000
    );
    expect(store.consume).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("worksync:attachment-rate:workspace:"),
      600_000
    );
  });

  it("fails closed when the actor counter is unavailable", async () => {
    const store: AuthRateLimitStore = {
      consume: jest.fn().mockRejectedValue(new Error("offline"))
    };
    await expect(
      new AttachmentRateLimiterService(store).consume("actor-1", "workspace-1")
    ).rejects.toMatchObject({ status: 503 });
  });

  it("fails closed when the workspace counter is unavailable", async () => {
    const store: AuthRateLimitStore = {
      consume: jest
        .fn()
        .mockResolvedValueOnce(1)
        .mockRejectedValueOnce(new Error("offline"))
    };
    await expect(
      new AttachmentRateLimiterService(store).consume("actor-1", "workspace-1")
    ).rejects.toMatchObject({ status: 503 });
    expect(store.consume).toHaveBeenCalledTimes(2);
  });

  it("does not consume workspace capacity after actor exhaustion", async () => {
    const store: AuthRateLimitStore = {
      consume: jest.fn().mockResolvedValue(11)
    };
    await expect(
      new AttachmentRateLimiterService(store).consume("actor-1", "workspace-1")
    ).rejects.toMatchObject({
      status: 429,
      response: {
        code: "RATE_LIMITED",
        retryAfterSeconds: 600
      }
    });
    expect(store.consume).toHaveBeenCalledTimes(1);
    expect(store.consume).toHaveBeenCalledWith(
      expect.stringContaining("worksync:attachment-rate:actor:"),
      600_000
    );
  });

  it("rejects workspace limit exhaustion after an admitted actor", async () => {
    const store: AuthRateLimitStore = {
      consume: jest.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(101)
    };
    await expect(
      new AttachmentRateLimiterService(store).consume("actor-1", "workspace-1")
    ).rejects.toMatchObject({ status: 429 });
    expect(store.consume).toHaveBeenCalledTimes(2);
  });
});
