import type { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import request = require("supertest");

import {
  createAuthTestApp,
  type AuthTestContext
} from "../helpers/auth-test-app";

async function signUp(
  app: INestApplication,
  email: string
): Promise<string> {
  const response = await request(app.getHttpServer())
    .post("/api/auth/signup")
    .send({
      displayName: "Workspace Contract User",
      email,
      password: "correct horse battery staple"
    })
    .expect(201);
  return response.body.data.accessToken as string;
}

describe("workspace API contract", () => {
  let context: AuthTestContext;
  let app: INestApplication;
  let accessToken: string;

  beforeAll(async () => {
    context = await createAuthTestApp();
    app = context.app;
    accessToken = await signUp(app, "workspace-contract@example.com");
  });

  afterAll(async () => {
    await app.close();
  });

  it("creates a workspace with the public workspace envelope", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/workspaces")
      .set("authorization", `Bearer ${accessToken}`)
      .send({ name: "  Product Team  " })
      .expect(201);

    expect(response.body).toMatchObject({
      success: true,
      message: "Workspace created",
      data: {
        workspace: {
          id: expect.any(String),
          name: "Product Team",
          slug: "product-team",
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
          membershipRole: "OWNER"
        }
      }
    });
    expect(response.body.data.workspace).not.toHaveProperty("members");
    expect(response.body.data.workspace).not.toHaveProperty("projects");
  });

  it("returns paginated workspaces with stable list metadata", async () => {
    await request(app.getHttpServer())
      .post("/api/workspaces")
      .set("authorization", `Bearer ${accessToken}`)
      .send({ name: "Second Team" })
      .expect(201);

    const response = await request(app.getHttpServer())
      .get("/api/workspaces")
      .set("authorization", `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body).toMatchObject({
      success: true,
      data: {
        items: expect.any(Array),
        page: 1,
        pageSize: 20,
        total: expect.any(Number)
      }
    });
    expect(response.body.data.items).toHaveLength(2);
    expect(response.body.data.items[0]).toMatchObject({
      id: expect.any(String),
      name: expect.any(String),
      slug: expect.any(String),
      membershipRole: "OWNER"
    });
  });

  it("reads a visible workspace by id", async () => {
    const created = await request(app.getHttpServer())
      .post("/api/workspaces")
      .set("authorization", `Bearer ${accessToken}`)
      .send({ name: "Read Team" })
      .expect(201);

    const response = await request(app.getHttpServer())
      .get(`/api/workspaces/${created.body.data.workspace.id as string}`)
      .set("authorization", `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body).toMatchObject({
      success: true,
      data: {
        workspace: {
          id: created.body.data.workspace.id,
          name: "Read Team",
          membershipRole: "OWNER"
        }
      }
    });
  });

  it("rejects invalid create bodies through the standard envelope", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/workspaces")
      .set("authorization", `Bearer ${accessToken}`)
      .send({
        name: "",
        role: "OWNER"
      })
      .expect(400);

    expect(response.body).toMatchObject({
      success: false,
      message: "Validation failed",
      data: {
        code: "VALIDATION_ERROR",
        fields: {
          name: expect.any(Array),
          role: expect.any(Array)
        }
      }
    });
  });

  it("rejects invalid pagination query fields", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/workspaces")
      .query({ page: "0", pageSize: "101", sort: "name" })
      .set("authorization", `Bearer ${accessToken}`)
      .expect(400);

    expect(response.body).toMatchObject({
      success: false,
      message: "Validation failed",
      data: {
        code: "VALIDATION_ERROR",
        fields: {
          page: expect.any(Array),
          pageSize: expect.any(Array),
          sort: expect.any(Array)
        }
      }
    });
  });

  it("uses an entropy fallback when deterministic slug candidates are exhausted", async () => {
    const token = await signUp(app, "workspace-conflict@example.com");
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await request(app.getHttpServer())
        .post("/api/workspaces")
        .set("authorization", `Bearer ${token}`)
        .send({ name: "Repeated Workspace" })
        .expect(201);
    }

    const response = await request(app.getHttpServer())
      .post("/api/workspaces")
      .set("authorization", `Bearer ${token}`)
      .send({ name: "Repeated Workspace" })
      .expect(201);

    expect(response.body).toMatchObject({
      success: true,
      data: {
        workspace: {
          name: "Repeated Workspace",
          slug: expect.stringMatching(/^repeated-workspace-[a-f0-9]{8}$/),
          membershipRole: "OWNER"
        }
      }
    });
    expect(JSON.stringify(response.body)).not.toContain("P2002");
  });

  it("documents workspace requests, responses, bearer security, and errors", () => {
    const config = new DocumentBuilder()
      .setTitle("WorkSync API")
      .setVersion("0.1.0")
      .addBearerAuth(
        { type: "http", scheme: "bearer", bearerFormat: "JWT" },
        "access-token"
      )
      .build();
    const document = SwaggerModule.createDocument(app, config);

    expect(document.paths["/api/workspaces"]?.post).toMatchObject({
      security: [{ "access-token": [] }],
      requestBody: { required: true },
      responses: {
        "201": expect.any(Object),
        "400": expect.any(Object),
        "401": expect.any(Object),
        "409": expect.any(Object)
      }
    });
    expect(document.paths["/api/workspaces"]?.get).toMatchObject({
      security: [{ "access-token": [] }],
      responses: {
        "200": expect.any(Object),
        "400": expect.any(Object),
        "401": expect.any(Object)
      }
    });
    expect(document.paths["/api/workspaces/{id}"]?.get).toMatchObject({
      security: [{ "access-token": [] }],
      responses: {
        "200": expect.any(Object),
        "401": expect.any(Object),
        "404": expect.any(Object)
      }
    });
    expect(document.components?.schemas).toHaveProperty(
      "CreateWorkspaceRequestDto"
    );
    expect(document.components?.schemas).toHaveProperty("WorkspaceResponseDto");
    expect(document.components?.schemas).toHaveProperty(
      "WorkspaceListResponseDto"
    );
    expect(
      document.paths["/api/workspaces/{id}"]?.get?.responses?.["404"]
    ).toMatchObject({
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/ApiErrorResponseDto" }
        }
      }
    });
  });
});
