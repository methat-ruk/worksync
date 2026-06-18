import {
  isValidCorrelationId,
  resolveCorrelationId
} from "../../src/observability/correlation";
import { CorrelationContextService } from "../../src/observability/correlation-context.service";

describe("correlation", () => {
  it("accepts bounded safe identifiers", () => {
    expect(isValidCorrelationId("request-123:attempt.2")).toBe(true);
    expect(resolveCorrelationId("request-123")).toBe("request-123");
  });

  it("replaces invalid identifiers", () => {
    expect(resolveCorrelationId("contains spaces")).toMatch(
      /^[0-9a-f-]{36}$/
    );
    expect(resolveCorrelationId("x".repeat(129))).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("propagates the identifier across asynchronous work", async () => {
    const context = new CorrelationContextService();

    await context.run("request-123", async () => {
      await Promise.resolve();
      expect(context.getCorrelationId()).toBe("request-123");
    });
    expect(context.getCorrelationId()).toBeUndefined();
  });
});
