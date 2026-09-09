import { UnrecoverableError } from "bullmq";
import { parseJobsConfig } from "../../src/jobs/jobs.config";
import { CLEANUP_DATA, CLEANUP_NAME, safeJobError, validateCleanupJob } from "../../src/jobs/jobs.contract";
import { parseControlArguments } from "../../src/jobs/control";

const environment = () => ({ NODE_ENV: "test", LOG_LEVEL: "silent", JOBS_DATABASE_URL: "postgresql://localhost/isolated_test", JOBS_REDIS_URL: "redis://localhost:6379/1", JOBS_QUEUE_PREFIX: "test-jobs", JOBS_SCHEDULER_ENABLED: "false" });

describe("jobs trust boundaries", () => {
  it("starts from a minimal worker environment with safe defaults", () => {
    expect(parseJobsConfig(environment())).toMatchObject({ mode: "dry-run", scheduler: false, healthPort: 4001 });
  });
  it.each([null, [], {}, { ...CLEANUP_DATA, version: "1" }, { ...CLEANUP_DATA, version: 2 }, { ...CLEANUP_DATA, cutoff: "2099-01-01" }])("rejects an invalid job without coercion: %j", (data) => {
    expect(() => validateCleanupJob(CLEANUP_NAME, data)).toThrow(UnrecoverableError);
  });
  it("checks name and exact payload", () => {
    expect(() => validateCleanupJob("other", CLEANUP_DATA)).toThrow();
    expect(() => validateCleanupJob(CLEANUP_NAME, CLEANUP_DATA)).not.toThrow();
  });
  it.each([
    { JOBS_DATABASE_URL: "postgresql://localhost/development" },
    { JOBS_QUEUE_PREFIX: "bad:prefix" }, { JOBS_SCHEDULER_ENABLED: "1" },
    { JOBS_REDIS_URL: "redis://localhost/-1" }, { JOBS_REDIS_URL: "redis://localhost/1?password=secret" },
    { JOBS_REDIS_URL: "http://localhost" }, { JOBS_HEALTH_PORT: "0" },
    { NODE_ENV: "production" }, { JOBS_REDIS_URL: "redis://bad%ZZ:secret@localhost" }
  ])("rejects unsafe configuration: %j", (override) => {
    expect(() => parseJobsConfig({ ...environment(), ...override })).toThrow();
  });
  it("does not reflect connection secrets in config errors", () => {
    expect(() => parseJobsConfig({ ...environment(), JOBS_REDIS_URL: "https://secret-canary@localhost" })).toThrow("Invalid or missing JOBS_REDIS_URL");
  });
  it("separates transient failures and sanitizes persisted exceptions", () => {
    expect(safeJobError({ code: "P2034", message: "secret-canary" })).not.toBeInstanceOf(UnrecoverableError);
    expect(safeJobError({ code: "42501", message: "secret-canary" })).toBeInstanceOf(UnrecoverableError);
    expect(safeJobError(new Error("secret-canary")).stack).not.toContain("secret-canary");
  });
  it("defaults control to read-only and guards mutations", () => {
    expect(parseControlArguments([]).command).toBe("inspect");
    expect(() => parseControlArguments(["enqueue"])).toThrow("EXPLICIT_APPLY_REQUIRED");
    expect(() => parseControlArguments(["retry", "job", "--apply"])).toThrow("REASON_REQUIRED");
    expect(() => parseControlArguments(["enqueue", "--apply", "--data=evil"])).toThrow();
    expect(parseControlArguments(["retry", "job", "--apply", "--reason=dependency-recovered"])).toMatchObject({ id: "job" });
    expect(() => parseControlArguments(["inspect", "--page=1", "--page=2"])).toThrow("INVALID_CONTROL_ARGUMENTS");
    expect(() => parseControlArguments(["pause", "--apply", "--reason=unknown"])).toThrow("INVALID_REASON");
    expect(() => parseControlArguments(["remove-failed", "../job", "--apply", "--reason=invalid-job"])).toThrow("EXACT_JOB_ID_REQUIRED");
  });
});
