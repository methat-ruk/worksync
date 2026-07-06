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
