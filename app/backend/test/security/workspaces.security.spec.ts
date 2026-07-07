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
      displayName: "Workspace Security User",
      email,
      password: "correct horse battery staple"
    })
    .expect(201);
  return response.body.data.accessToken as string;
}

describe("workspace security controls", () => {
  let context: AuthTestContext;
  let app: INestApplication;
  let ownerToken: string;
  let outsiderToken: string;

  beforeAll(async () => {
    context = await createAuthTestApp();
    app = context.app;
    ownerToken = await signUp(app, "workspace-owner@example.com");
    outsiderToken = await signUp(app, "workspace-outsider@example.com");
  });

  afterAll(async () => {
    await app.close();
  });

  it("requires authentication for every workspace endpoint", async () => {
    await request(app.getHttpServer())
      .post("/api/workspaces")
      .send({ name: "Unauthenticated Workspace" })
      .expect(401);
    await request(app.getHttpServer()).get("/api/workspaces").expect(401);
    await request(app.getHttpServer())
      .get("/api/workspaces/workspace-id")
      .expect(401);
    await request(app.getHttpServer())
      .get("/api/workspaces/workspace-id/members")
      .expect(401);
    await request(app.getHttpServer())
      .post("/api/workspaces/workspace-id/members")
      .send({ email: "member@example.com", role: "MEMBER" })
      .expect(401);
    await request(app.getHttpServer())
      .patch("/api/workspaces/workspace-id/members/member-id")
      .send({ role: "VIEWER" })
      .expect(401);
    await request(app.getHttpServer())
      .delete("/api/workspaces/workspace-id/members/member-id")
      .expect(401);
  });

  it("does not expose cross-user workspaces through direct id reads", async () => {
    const created = await request(app.getHttpServer())
      .post("/api/workspaces")
      .set("authorization", `Bearer ${ownerToken}`)
      .send({ name: "Private Roadmap Workspace" })
      .expect(201);
    const hiddenWorkspace = created.body.data.workspace;

    const response = await request(app.getHttpServer())
      .get(`/api/workspaces/${hiddenWorkspace.id as string}`)
      .set("authorization", `Bearer ${outsiderToken}`)
      .expect(404);

    expect(response.body).toMatchObject({
      success: false,
      message: "Workspace not found",
      data: {
        code: "RESOURCE_NOT_FOUND",
        correlationId: expect.any(String)
      }
    });
    const body = JSON.stringify(response.body);
    expect(body).not.toContain(hiddenWorkspace.id);
    expect(body).not.toContain(hiddenWorkspace.name);
    expect(body).not.toContain(hiddenWorkspace.slug);
  });

  it("does not expose cross-user workspaces through lists", async () => {
    const ownerOnly = await request(app.getHttpServer())
      .post("/api/workspaces")
      .set("authorization", `Bearer ${ownerToken}`)
      .send({ name: "Owner Only Workspace" })
      .expect(201);
    await request(app.getHttpServer())
      .post("/api/workspaces")
      .set("authorization", `Bearer ${outsiderToken}`)
      .send({ name: "Outsider Workspace" })
      .expect(201);

    const response = await request(app.getHttpServer())
      .get("/api/workspaces")
      .set("authorization", `Bearer ${outsiderToken}`)
      .expect(200);

    expect(JSON.stringify(response.body)).not.toContain(
      ownerOnly.body.data.workspace.id
    );
    expect(JSON.stringify(response.body)).not.toContain(
      ownerOnly.body.data.workspace.slug
    );
    expect(response.body.data.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Outsider Workspace" })
      ])
    );
  });

  it("hides workspace membership endpoints from outsiders", async () => {
    await signUp(app, "workspace-hidden-member@example.com");
    const created = await request(app.getHttpServer())
      .post("/api/workspaces")
      .set("authorization", `Bearer ${ownerToken}`)
      .send({ name: "Hidden Membership Workspace" })
      .expect(201);
    const workspaceId = created.body.data.workspace.id as string;

    const list = await request(app.getHttpServer())
      .get(`/api/workspaces/${workspaceId}/members`)
      .set("authorization", `Bearer ${outsiderToken}`)
      .expect(404);
    expect(JSON.stringify(list.body)).not.toContain(workspaceId);

    const add = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/members`)
      .set("authorization", `Bearer ${outsiderToken}`)
      .send({ email: "workspace-hidden-member@example.com", role: "MEMBER" })
      .expect(404);
    expect(JSON.stringify(add.body)).not.toContain(
      "workspace-hidden-member@example.com"
    );
  });

  it("denies member and viewer access to member management", async () => {
    const memberToken = await signUp(app, "workspace-member-role@example.com");
    const viewerToken = await signUp(app, "workspace-viewer-role@example.com");
    await signUp(app, "workspace-managed-target@example.com");
    const created = await request(app.getHttpServer())
      .post("/api/workspaces")
      .set("authorization", `Bearer ${ownerToken}`)
      .send({ name: "Lower Role Workspace" })
      .expect(201);
    const workspaceId = created.body.data.workspace.id as string;

    await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/members`)
      .set("authorization", `Bearer ${ownerToken}`)
      .send({ email: "workspace-member-role@example.com", role: "MEMBER" })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/members`)
      .set("authorization", `Bearer ${ownerToken}`)
      .send({ email: "workspace-viewer-role@example.com", role: "VIEWER" })
      .expect(201);

    for (const token of [memberToken, viewerToken]) {
      await request(app.getHttpServer())
        .get(`/api/workspaces/${workspaceId}/members`)
        .set("authorization", `Bearer ${token}`)
        .expect(403);
      const response = await request(app.getHttpServer())
        .post(`/api/workspaces/${workspaceId}/members`)
        .set("authorization", `Bearer ${token}`)
        .send({ email: "workspace-managed-target@example.com", role: "MEMBER" })
        .expect(403);
      expect(response.body).toMatchObject({
        success: false,
        message: "Not authorized for this workspace action",
        data: { code: "AUTHORIZATION_DENIED" }
      });
    }
  });

  it("keeps admin member management below owner and admin authority", async () => {
    const adminToken = await signUp(app, "workspace-admin-role@example.com");
    await signUp(app, "workspace-admin-target@example.com");
    const created = await request(app.getHttpServer())
      .post("/api/workspaces")
      .set("authorization", `Bearer ${ownerToken}`)
      .send({ name: "Admin Boundary Workspace" })
      .expect(201);
    const workspaceId = created.body.data.workspace.id as string;
    const admin = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/members`)
      .set("authorization", `Bearer ${ownerToken}`)
      .send({ email: "workspace-admin-role@example.com", role: "ADMIN" })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/members`)
      .set("authorization", `Bearer ${adminToken}`)
      .send({ email: "workspace-admin-target@example.com", role: "ADMIN" })
      .expect(403);
    await request(app.getHttpServer())
      .patch(
        `/api/workspaces/${workspaceId}/members/${
          admin.body.data.member.id as string
        }`
      )
      .set("authorization", `Bearer ${adminToken}`)
      .send({ role: "MEMBER" })
      .expect(403);
  });

  it("prevents self-removal and cross-workspace member targeting", async () => {
    await signUp(app, "workspace-other-target@example.com");
    const first = await request(app.getHttpServer())
      .post("/api/workspaces")
      .set("authorization", `Bearer ${ownerToken}`)
      .send({ name: "Self Protection Workspace" })
      .expect(201);
    const second = await request(app.getHttpServer())
      .post("/api/workspaces")
      .set("authorization", `Bearer ${ownerToken}`)
      .send({ name: "Other Member Workspace" })
      .expect(201);
    const firstWorkspaceId = first.body.data.workspace.id as string;
    const secondWorkspaceId = second.body.data.workspace.id as string;

    const owners = await request(app.getHttpServer())
      .get(`/api/workspaces/${firstWorkspaceId}/members`)
      .set("authorization", `Bearer ${ownerToken}`)
      .expect(200);
    const ownerMember = owners.body.data.items.find(
      (member: { role: string }) => member.role === "OWNER"
    );

    await request(app.getHttpServer())
      .delete(`/api/workspaces/${firstWorkspaceId}/members/${ownerMember.id}`)
      .set("authorization", `Bearer ${ownerToken}`)
      .expect(403);

    const otherMember = await request(app.getHttpServer())
      .post(`/api/workspaces/${secondWorkspaceId}/members`)
      .set("authorization", `Bearer ${ownerToken}`)
      .send({ email: "workspace-other-target@example.com", role: "MEMBER" })
      .expect(201);

    await request(app.getHttpServer())
      .patch(
        `/api/workspaces/${firstWorkspaceId}/members/${
          otherMember.body.data.member.id as string
        }`
      )
      .set("authorization", `Bearer ${ownerToken}`)
      .send({ role: "VIEWER" })
      .expect(404);
  });

  it("does not expose internal unique-constraint details during slug fallback", async () => {
    const token = await signUp(app, "workspace-slug-security@example.com");
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await request(app.getHttpServer())
        .post("/api/workspaces")
        .set("authorization", `Bearer ${token}`)
        .send({ name: "Sensitive Collision" })
        .expect(201);
    }

    const response = await request(app.getHttpServer())
      .post("/api/workspaces")
      .set("authorization", `Bearer ${token}`)
      .send({ name: "Sensitive Collision" })
      .expect(201);
    const body = JSON.stringify(response.body);

    expect(response.body.data.workspace.slug).toEqual(
      expect.stringMatching(/^sensitive-collision-[a-f0-9]{8}$/)
    );
    expect(body).not.toContain("P2002");
    expect(body).not.toContain("Unique constraint");
    expect(body).not.toContain("Workspace_slug_key");
  });
});
