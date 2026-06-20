import type { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import request = require("supertest");

import {
  createAuthTestApp,
  type AuthTestContext
} from "../helpers/auth-test-app";

describe("authentication API contract", () => {
  let context: AuthTestContext;
  let app: INestApplication;

  beforeAll(async () => {
    context = await createAuthTestApp();
    app = context.app;
  });

  afterAll(async () => {
    await app.close();
  });

  it("creates an account with normalized email and the public auth envelope", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/auth/signup")
      .send({
        displayName: "  Ada Lovelace  ",
        email: "  ADA@Example.com ",
        password: "correct horse battery staple"
      })
      .expect(201);

    expect(response.body).toMatchObject({
      success: true,
      message: "Account created",
      data: {
        user: {
          id: expect.any(String),
          email: "ada@example.com",
          displayName: "Ada Lovelace",
          createdAt: expect.any(String),
          updatedAt: expect.any(String)
        },
        accessToken: expect.any(String),
        tokenType: "Bearer",
        expiresIn: 900
      }
    });
    expect(response.body.data.user).not.toHaveProperty("passwordHash");
  });

  it("returns the defined duplicate-email conflict", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/auth/signup")
      .send({
        displayName: "Other Ada",
        email: "ADA@example.com",
        password: "another secure password"
      })
      .expect(409);

    expect(response.body).toMatchObject({
      success: false,
      message: "An account with this email already exists",
      data: {
        code: "AUTH_EMAIL_CONFLICT",
        correlationId: expect.any(String)
      }
    });
  });

  it("rejects invalid and unknown request fields through the standard envelope", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/auth/signup")
      .send({
        displayName: "",
        email: "invalid",
        password: "short",
        role: "OWNER"
      })
      .expect(400);

    expect(response.body).toMatchObject({
      success: false,
      message: "Validation failed",
      data: {
        code: "VALIDATION_ERROR",
        fields: {
          displayName: expect.any(Array),
          email: expect.any(Array),
          password: expect.any(Array),
          role: expect.any(Array)
        }
      }
    });
  });

  it("documents auth requests, responses, bearer security, and errors", () => {
    const config = new DocumentBuilder()
      .setTitle("WorkSync API")
      .setVersion("0.1.0")
      .addBearerAuth(
        { type: "http", scheme: "bearer", bearerFormat: "JWT" },
        "access-token"
      )
      .build();
    const document = SwaggerModule.createDocument(app, config);

    expect(document.paths["/api/auth/signup"]?.post).toMatchObject({
      requestBody: { required: true },
      responses: {
        "201": expect.any(Object),
        "400": expect.any(Object),
        "409": expect.any(Object)
      }
    });
    expect(document.paths["/api/auth/login"]?.post?.responses).toMatchObject({
      "200": expect.any(Object),
      "400": expect.any(Object),
      "401": expect.any(Object)
    });
    expect(document.paths["/api/auth/me"]?.get).toMatchObject({
      security: [{ "access-token": [] }],
      responses: {
        "200": expect.any(Object),
        "401": expect.any(Object)
      }
    });
    expect(
      document.paths["/api/auth/login"]?.post?.responses?.["401"]
    ).toMatchObject({
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/ApiErrorResponseDto" }
        }
      }
    });
    expect(document.paths["/health/ready"]?.get?.responses?.["503"]).toMatchObject({
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/ApiErrorResponseDto" }
        }
      }
    });
    expect(document.components?.schemas).toHaveProperty("SignUpRequestDto");
    expect(document.components?.schemas).toHaveProperty("AuthResponseDto");
    expect(document.components?.schemas).toHaveProperty("ApiErrorResponseDto");
    expect(document.components?.schemas).toHaveProperty("ApiErrorDataDto");
    const errorDataSchema = document.components?.schemas?.ApiErrorDataDto;
    if (!errorDataSchema || "$ref" in errorDataSchema) {
      throw new Error("ApiErrorDataDto must be an inline OpenAPI schema");
    }
    expect(errorDataSchema.properties?.code).toMatchObject({
      enum: expect.arrayContaining([
        "AUTH_EMAIL_CONFLICT",
        "AUTHENTICATION_REQUIRED",
        "INVALID_ACCESS_TOKEN",
        "INVALID_CREDENTIALS",
        "VALIDATION_ERROR"
      ])
    });
  });
});
