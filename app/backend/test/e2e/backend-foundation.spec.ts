import {
  Body,
  Controller,
  Get,
  INestApplication,
  Post
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { IsEmail, IsString } from "class-validator";
import request = require("supertest");

import { AppModule } from "../../src/app.module";
import { PrismaService } from "../../src/database/prisma.service";
import { configureApplication } from "../../src/main";

class ValidationRequestDto {
  @IsEmail()
  email!: string;

  @IsString()
  name!: string;
}

@Controller("_test")
class FoundationTestController {
  @Post("validation")
  validate(@Body() body: ValidationRequestDto): { success: true; data: unknown } {
    return { success: true, data: body };
  }

  @Get("failure")
  fail(): never {
    throw new Error("sensitive infrastructure detail");
  }
}

describe("backend foundation contracts", () => {
  let app: INestApplication;
  const queryRaw = jest.fn().mockResolvedValue([{ "?column?": 1 }]);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [FoundationTestController]
    })
      .overrideProvider(PrismaService)
      .useValue({
        $connect: jest.fn(),
        $disconnect: jest.fn(),
        $queryRaw: queryRaw
      })
      .compile();

    app = moduleRef.createNestApplication();
    configureApplication(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it.each(["/health", "/health/live"])(
    "returns the liveness contract from %s",
    async (path) => {
      const response = await request(app.getHttpServer()).get(path).expect(200);

      expect(response.body).toEqual({
        success: true,
        data: { status: "ok", service: "worksync-backend" }
      });
      expect(response.headers["x-correlation-id"]).toMatch(/^[0-9a-f-]{36}$/);
    }
  );

  it("preserves a valid incoming correlation ID", async () => {
    const response = await request(app.getHttpServer())
      .get("/health")
      .set("x-correlation-id", "client-request-123")
      .expect(200);

    expect(response.headers["x-correlation-id"]).toBe("client-request-123");
  });

  it("returns readiness when PostgreSQL responds", async () => {
    const response = await request(app.getHttpServer())
      .get("/health/ready")
      .expect(200);

    expect(response.body).toEqual({
      success: true,
      data: {
        status: "ok",
        service: "worksync-backend",
        database: "up"
      }
    });
  });

  it("returns the standard 503 error when PostgreSQL is unavailable", async () => {
    queryRaw.mockRejectedValueOnce(new Error("connection failed"));

    const response = await request(app.getHttpServer())
      .get("/health/ready")
      .set("x-correlation-id", "readiness-failure")
      .expect(503);

    expect(response.body).toEqual({
      success: false,
      message: "Service is not ready",
      data: {
        code: "SERVICE_NOT_READY",
        correlationId: "readiness-failure"
      }
    });
  });

  it("normalizes validation errors and rejects unknown fields", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/_test/validation")
      .send({ email: "invalid", name: "WorkSync", unexpected: true })
      .expect(400);

    expect(response.body).toMatchObject({
      success: false,
      message: "Validation failed",
      data: {
        code: "VALIDATION_ERROR",
        fields: {
          email: expect.any(Array),
          unexpected: expect.any(Array)
        },
        correlationId: expect.any(String)
      }
    });
  });

  it("normalizes unknown routes", async () => {
    const response = await request(app.getHttpServer())
      .get("/missing")
      .expect(404);

    expect(response.body).toMatchObject({
      success: false,
      message: "Cannot GET /missing",
      data: { correlationId: expect.any(String) }
    });
  });

  it("hides unexpected failure details", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/_test/failure")
      .set("x-correlation-id", "unexpected-failure")
      .expect(500);

    expect(response.body).toEqual({
      success: false,
      message: "Internal server error",
      data: {
        code: "INTERNAL_SERVER_ERROR",
        correlationId: "unexpected-failure"
      }
    });
    expect(JSON.stringify(response.body)).not.toContain(
      "sensitive infrastructure detail"
    );
  });

  it("requires the API prefix for application routes", async () => {
    await request(app.getHttpServer()).get("/_test/failure").expect(404);
    await request(app.getHttpServer()).get("/api/_test/failure").expect(500);
  });

  it("keeps Swagger documentation outside the API prefix", async () => {
    await request(app.getHttpServer()).get("/docs").expect(200);
    await request(app.getHttpServer()).get("/api/docs").expect(404);
  });
});
