import type { INestApplication } from "@nestjs/common";
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
      displayName: "Project Security User",
      email,
      password: "correct horse battery staple"
    })
    .expect(201);
  return response.body.data.accessToken as string;
}

describe("project security controls", () => {
  let context: AuthTestContext;
  let app: INestApplication;
  let ownerToken: string;
  let adminToken: string;
  let outsiderToken: string;
  let viewerToken: string;
  let workspaceId: string;
  let projectId: string;

  beforeAll(async () => {
    context = await createAuthTestApp();
    app = context.app;
    ownerToken = await signUp(app, "project-security-owner@example.com");
    adminToken = await signUp(app, "project-security-admin@example.com");
    outsiderToken = await signUp(
      app,
      "project-security-outsider@example.com"
    );
    viewerToken = await signUp(app, "project-security-viewer@example.com");
    const workspace = await request(app.getHttpServer())
      .post("/api/workspaces")
      .set("authorization", `Bearer ${ownerToken}`)
      .send({ name: "Project Security Workspace" })
      .expect(201);
    workspaceId = workspace.body.data.workspace.id as string;
    await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/members`)
      .set("authorization", `Bearer ${ownerToken}`)
      .send({
        email: "project-security-admin@example.com",
        role: "ADMIN"
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/members`)
      .set("authorization", `Bearer ${ownerToken}`)
      .send({
        email: "project-security-viewer@example.com",
        role: "VIEWER"
      })
      .expect(201);
    const project = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/projects`)
      .set("authorization", `Bearer ${ownerToken}`)
      .send({ name: "Secure Project", key: "SECURE" })
      .expect(201);
    projectId = project.body.data.project.id as string;
  });

  afterAll(async () => {
    await app.close();
  });

  it("requires authentication for every project endpoint", async () => {
    await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/projects`)
      .send({ name: "Unauthorized", key: "UNAUTH" })
      .expect(401);
    await request(app.getHttpServer())
      .get(`/api/workspaces/${workspaceId}/projects`)
      .expect(401);
    await request(app.getHttpServer())
      .get(`/api/workspaces/${workspaceId}/projects/${projectId}`)
      .expect(401);
    await request(app.getHttpServer())
      .patch(`/api/workspaces/${workspaceId}/projects/${projectId}`)
      .send({ name: "Unauthorized" })
      .expect(401);
  });

  it("lets viewers read but rejects direct mutation attempts", async () => {
    await request(app.getHttpServer())
      .get(`/api/workspaces/${workspaceId}/projects`)
      .set("authorization", `Bearer ${viewerToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/workspaces/${workspaceId}/projects/${projectId}`)
      .set("authorization", `Bearer ${viewerToken}`)
      .expect(200);

    for (const response of [
      await request(app.getHttpServer())
        .post(`/api/workspaces/${workspaceId}/projects`)
        .set("authorization", `Bearer ${viewerToken}`)
        .send({ name: "Viewer Project", key: "VIEWER" }),
      await request(app.getHttpServer())
        .patch(`/api/workspaces/${workspaceId}/projects/${projectId}`)
        .set("authorization", `Bearer ${viewerToken}`)
        .send({ name: "Viewer Update" })
    ]) {
      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({
        success: false,
        message: "Not authorized for this project action",
        data: { code: "AUTHORIZATION_DENIED" }
      });
    }
  });

  it("lets admins create and update projects through the HTTP boundary", async () => {
    const created = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/projects`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ name: "Admin Project", key: "ADMIN" })
      .expect(201);

    await request(app.getHttpServer())
      .patch(
        `/api/workspaces/${workspaceId}/projects/${
          created.body.data.project.id as string
        }`
      )
      .set("authorization", `Bearer ${adminToken}`)
      .send({ name: "Admin Project Updated" })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.project).toMatchObject({
          name: "Admin Project Updated",
          key: "ADMIN"
        });
      });
  });

  it("hides project endpoints and identifiers from workspace outsiders", async () => {
    const paths = [
      `/api/workspaces/${workspaceId}/projects`,
      `/api/workspaces/${workspaceId}/projects/${projectId}`
    ];
    for (const path of paths) {
      const response = await request(app.getHttpServer())
        .get(path)
        .set("authorization", `Bearer ${outsiderToken}`)
        .expect(404);
      expect(response.body).toMatchObject({
        success: false,
        message: "Workspace not found",
        data: { code: "RESOURCE_NOT_FOUND" }
      });
      expect(JSON.stringify(response.body)).not.toContain(projectId);
    }

    const create = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/projects`)
      .set("authorization", `Bearer ${outsiderToken}`)
      .send({ name: "Outsider Project", key: "OUTSIDE" })
      .expect(404);
    expect(JSON.stringify(create.body)).not.toContain(projectId);

    const update = await request(app.getHttpServer())
      .patch(`/api/workspaces/${workspaceId}/projects/${projectId}`)
      .set("authorization", `Bearer ${outsiderToken}`)
      .send({ name: "Outsider Update" })
      .expect(404);
    expect(JSON.stringify(update.body)).not.toContain(projectId);
  });

  it("rejects a project id from another visible workspace", async () => {
    const secondWorkspace = await request(app.getHttpServer())
      .post("/api/workspaces")
      .set("authorization", `Bearer ${ownerToken}`)
      .send({ name: "Second Project Security Workspace" })
      .expect(201);
    const secondWorkspaceId = secondWorkspace.body.data.workspace.id as string;

    for (const response of [
      await request(app.getHttpServer())
        .get(`/api/workspaces/${secondWorkspaceId}/projects/${projectId}`)
        .set("authorization", `Bearer ${ownerToken}`),
      await request(app.getHttpServer())
        .patch(`/api/workspaces/${secondWorkspaceId}/projects/${projectId}`)
        .set("authorization", `Bearer ${ownerToken}`)
        .send({ name: "Cross Workspace Update" })
    ]) {
      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({
        success: false,
        message: "Project not found",
        data: { code: "RESOURCE_NOT_FOUND" }
      });
      expect(JSON.stringify(response.body)).not.toContain(workspaceId);
    }
  });
});
