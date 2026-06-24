import { AuthService } from "../../src/auth/services/auth.service";
import type { PasswordHasher } from "../../src/auth/services/password-hasher.service";
import type { PasswordPolicyService } from "../../src/auth/services/password-policy.service";
import type { SessionService } from "../../src/auth/services/session.service";
import type { PrismaService } from "../../src/database/prisma.service";
import type { CorrelationContextService } from "../../src/observability/correlation-context.service";
import type { PinoLogger } from "nestjs-pino";

describe("AuthService", () => {
  it.each([
    ["unknown email", null, "USER_NOT_FOUND"],
    [
      "missing password hash",
      {
        id: "user-1",
        email: "ada@example.com",
        displayName: "Ada",
        passwordHash: null,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      "PASSWORD_HASH_MISSING"
    ],
    [
      "incorrect password",
      {
        id: "user-1",
        email: "ada@example.com",
        displayName: "Ada",
        passwordHash: "encoded",
        createdAt: new Date(),
        updatedAt: new Date()
      },
      "PASSWORD_MISMATCH"
    ]
  ])(
    "logs %s without changing the public login failure",
    async (_case, user, reasonCode) => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(user) }
    } as unknown as PrismaService;
    const passwordHasher = {
      verifyWithDummy: jest.fn().mockResolvedValue(false)
    } as unknown as PasswordHasher;
    const sessions = {} as SessionService;
    const passwordPolicy = {} as PasswordPolicyService;
    const logger = {
      setContext: jest.fn(),
      warn: jest.fn()
    } as unknown as PinoLogger;
    const correlationContext = {
      getCorrelationId: jest.fn().mockReturnValue("request-123")
    } as unknown as CorrelationContextService;
    const service = new AuthService(
      prisma,
      passwordHasher,
      passwordPolicy,
      sessions,
      logger,
      correlationContext
    );

    await expect(
      service.login({
        email: " ADA@Example.com ",
        password: "incorrect password"
      }, undefined)
    ).rejects.toMatchObject({
      response: {
        message: "Invalid email or password",
        code: "INVALID_CREDENTIALS"
      }
    });
    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: "ada@example.com" } })
    );
    expect(passwordHasher.verifyWithDummy).toHaveBeenCalledWith(
      "incorrect password",
      user?.passwordHash
    );
    expect(logger.warn).toHaveBeenCalledWith(
      {
        reasonCode,
        correlationId: "request-123"
      },
      "Password login failed"
    );
    const loggedData = JSON.stringify(
      (logger.warn as jest.Mock).mock.calls
    );
    expect(loggedData).not.toContain("ADA@Example.com");
    expect(loggedData).not.toContain("incorrect password");
    expect(loggedData).not.toContain("encoded");
    expect(loggedData).not.toContain("token");
    }
  );
});
