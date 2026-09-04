import type { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

import {
  createAuthTestApp,
  type AuthTestContext
} from "../helpers/auth-test-app";

describe("attachment API contract", () => {
  let context: AuthTestContext;
  let app: INestApplication;

  beforeAll(async () => {
    context = await createAuthTestApp();
    app = context.app;
  });

  afterAll(async () => app.close());

  it("documents upload, list, download, and delete contracts", () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .addBearerAuth({ type: "http", scheme: "bearer" }, "access-token")
        .build()
    );
    const collection =
      document.paths[
        "/api/workspaces/{workspaceId}/projects/{projectId}/tasks/{taskId}/attachments"
      ];
    const content =
      document.paths[
        "/api/workspaces/{workspaceId}/projects/{projectId}/tasks/{taskId}/attachments/{attachmentId}/content"
      ];
    const item =
      document.paths[
        "/api/workspaces/{workspaceId}/projects/{projectId}/tasks/{taskId}/attachments/{attachmentId}"
      ];

    expect(collection?.post?.requestBody).toBeDefined();
    expect(collection?.post?.responses).toMatchObject({
      "200": expect.any(Object),
      "201": expect.any(Object),
      "409": expect.any(Object),
      "413": expect.any(Object),
      "422": expect.any(Object),
      "429": expect.any(Object),
      "503": expect.any(Object)
    });
    expect(collection?.get?.responses).toHaveProperty("200");
    expect(content?.get?.responses).toMatchObject({
      "200": expect.any(Object),
      "404": expect.any(Object),
      "503": expect.any(Object)
    });
    expect(item?.delete?.responses).toHaveProperty("204");
    expect(document.components?.schemas).toHaveProperty("PublicAttachmentDto");
    expect(document.components?.schemas).toHaveProperty(
      "AttachmentListResponseDto"
    );
  });
});
