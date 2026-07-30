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
      displayName: "Project Contract User",
      email,
      password: "correct horse battery staple"
    })
    .expect(201);
  return response.body.data.accessToken as string;
}

describe("project API contract", () => {
  let context: AuthTestContext;
  let app: INestApplication;
  let accessToken: string;
  let workspaceId: string;

  beforeAll(async () => {
    context = await createAuthTestApp();
    app = context.app;
    accessToken = await signUp(app, "project-contract@example.com");
    const workspace = await request(app.getHttpServer())
      .post("/api/workspaces")
      .set("authorization", `Bearer ${accessToken}`)
      .send({ name: "Project Contract Workspace" })
      .expect(201);
    workspaceId = workspace.body.data.workspace.id as string;
  });

  afterAll(async () => {
    await app.close();
  });

  it("creates, lists, reads, and updates a project with stable envelopes", async () => {
    const created = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/projects`)
      .set("authorization", `Bearer ${accessToken}`)
      .send({ name: "  WorkSync  ", key: "  wsync  " })
      .expect(201);

    expect(created.body).toMatchObject({
      success: true,
      message: "Project created",
      data: {
        project: {
          name: "WorkSync",
          key: "WSYNC",
          createdAt: expect.any(String),
          updatedAt: expect.any(String)
        }
      }
    });
    expect(created.body.data.project).not.toHaveProperty("workspaceId");
    expect(created.body.data.project).not.toHaveProperty("workspace");
    expect(created.body.data.project).not.toHaveProperty("tasks");
    const projectId = created.body.data.project.id as string;

    const list = await request(app.getHttpServer())
      .get(`/api/workspaces/${workspaceId}/projects`)
      .set("authorization", `Bearer ${accessToken}`)
      .expect(200);
    expect(list.body).toMatchObject({
      success: true,
      data: {
        items: [expect.objectContaining({ id: projectId, key: "WSYNC" })],
        page: 1,
        pageSize: 20,
        total: 1
      }
    });

    const read = await request(app.getHttpServer())
      .get(`/api/workspaces/${workspaceId}/projects/${projectId}`)
      .set("authorization", `Bearer ${accessToken}`)
      .expect(200);
    expect(read.body.data.project).toMatchObject({
      id: projectId,
      name: "WorkSync",
      key: "WSYNC"
    });

    const updated = await request(app.getHttpServer())
      .patch(`/api/workspaces/${workspaceId}/projects/${projectId}`)
      .set("authorization", `Bearer ${accessToken}`)
      .send({ name: "  WorkSync Platform  " })
      .expect(200);
    expect(updated.body).toMatchObject({
      success: true,
      message: "Project updated",
      data: {
        project: {
          id: projectId,
          name: "WorkSync Platform",
          key: "WSYNC"
        }
      }
    });
  });

  it("rejects invalid, unknown, protected, and out-of-range input", async () => {
    const invalidCreate = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/projects`)
      .set("authorization", `Bearer ${accessToken}`)
      .send({ name: " ", key: "1", workspaceId: "other-workspace" })
      .expect(400);
    expect(invalidCreate.body).toMatchObject({
      success: false,
      message: "Validation failed",
      data: {
        code: "VALIDATION_ERROR",
        fields: expect.objectContaining({
          name: expect.any(Array),
          key: expect.any(Array),
          workspaceId: expect.any(Array)
        })
      }
    });

    const project = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/projects`)
      .set("authorization", `Bearer ${accessToken}`)
      .send({ name: "Protected Fields", key: "PROTECT" })
      .expect(201);
    const protectedUpdate = await request(app.getHttpServer())
      .patch(
        `/api/workspaces/${workspaceId}/projects/${
          project.body.data.project.id as string
        }`
      )
      .set("authorization", `Bearer ${accessToken}`)
      .send({ name: "Changed", key: "CHANGED" })
      .expect(400);
    expect(protectedUpdate.body.data).toMatchObject({
      code: "VALIDATION_ERROR",
      fields: { key: expect.any(Array) }
    });

    const invalidLowPage = await request(app.getHttpServer())
      .get(`/api/workspaces/${workspaceId}/projects`)
      .query({ page: "0" })
      .set("authorization", `Bearer ${accessToken}`)
      .expect(400);
    expect(invalidLowPage.body.data).toMatchObject({
      code: "VALIDATION_ERROR",
      fields: { page: expect.any(Array) }
    });

    const invalidList = await request(app.getHttpServer())
      .get(`/api/workspaces/${workspaceId}/projects`)
      .query({ page: "10001", pageSize: "101", sort: "name" })
      .set("authorization", `Bearer ${accessToken}`)
      .expect(400);
    expect(invalidList.body.data).toMatchObject({
      code: "VALIDATION_ERROR",
      fields: expect.objectContaining({
        page: expect.any(Array),
        pageSize: expect.any(Array),
        sort: expect.any(Array)
      })
    });
  });

  it("returns a stable conflict for duplicate normalized keys", async () => {
    await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/projects`)
      .set("authorization", `Bearer ${accessToken}`)
      .send({ name: "Conflict One", key: "DUPKEY" })
      .expect(201);
    const duplicate = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/projects`)
      .set("authorization", `Bearer ${accessToken}`)
      .send({ name: "Conflict Two", key: "dupkey" })
      .expect(409);
    expect(duplicate.body).toMatchObject({
      success: false,
      message: "Project key is already in use",
      data: { code: "RESOURCE_CONFLICT" }
    });
  });

  it("documents project paths, authentication, and schemas in OpenAPI", () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .addBearerAuth(
          { type: "http", scheme: "bearer" },
          "access-token"
        )
        .build()
    );
    const collectionPath =
      document.paths["/api/workspaces/{workspaceId}/projects"];
    const itemPath =
      document.paths["/api/workspaces/{workspaceId}/projects/{projectId}"];

    expect(collectionPath?.post?.security).toEqual([
      { "access-token": [] }
    ]);
    expect(collectionPath?.get?.responses).toHaveProperty("200");
    expect(itemPath?.get?.responses).toHaveProperty("404");
    expect(itemPath?.patch?.responses).toHaveProperty("403");
    expect(document.components?.schemas).toHaveProperty(
      "CreateProjectRequestDto"
    );
    expect(document.components?.schemas).toHaveProperty("PublicProjectDto");
  });
});
