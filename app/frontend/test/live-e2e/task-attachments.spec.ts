import { expect, test, type BrowserContext } from "@playwright/test";

const apiBaseUrl = "http://localhost:4000";
const password = "correct horse battery staple";

async function signUp(
  context: BrowserContext,
  email: string,
  displayName: string
): Promise<string> {
  const response = await context.request.post(`${apiBaseUrl}/api/auth/signup`, {
    data: { displayName, email, password }
  });
  expect(response.status()).toBe(201);
  const body = (await response.json()) as { data: { accessToken: string } };
  return body.data.accessToken;
}

function bearer(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}` };
}

async function downloadBytes(download: {
  createReadStream(): Promise<NodeJS.ReadableStream>;
}): Promise<Buffer> {
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

test("persists the browser attachment journey through MinIO with isolation", async ({
  browser
}) => {
  const ownerContext = await browser.newContext();
  const viewerContext = await browser.newContext();
  const outsiderContext = await browser.newContext();
  const runId = `${Date.now()}`;
  const fixture = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64"
  );
  const filename = `attachment-${runId}.png`;
  const consoleErrors: string[] = [];

  try {
    const ownerEmail = `attachment-owner-${runId}@example.com`;
    const viewerEmail = `attachment-viewer-${runId}@example.com`;
    const outsiderEmail = `attachment-outsider-${runId}@example.com`;
    const ownerToken = await signUp(
      ownerContext,
      ownerEmail,
      `Attachment Owner ${runId}`
    );
    await signUp(viewerContext, viewerEmail, `Attachment Viewer ${runId}`);
    const outsiderToken = await signUp(
      outsiderContext,
      outsiderEmail,
      `Attachment Outsider ${runId}`
    );
    const ownerAuthorization = bearer(ownerToken);
    const outsiderAuthorization = bearer(outsiderToken);

    const workspaceResponse = await ownerContext.request.post(
      `${apiBaseUrl}/api/workspaces`,
      {
        headers: ownerAuthorization,
        data: { name: `Attachment Live ${runId}` }
      }
    );
    expect(workspaceResponse.status()).toBe(201);
    const workspaceBody = (await workspaceResponse.json()) as {
      data: { workspace: { id: string } };
    };
    const workspaceId = workspaceBody.data.workspace.id;

    const viewerMembership = await ownerContext.request.post(
      `${apiBaseUrl}/api/workspaces/${workspaceId}/members`,
      {
        headers: ownerAuthorization,
        data: { email: viewerEmail, role: "VIEWER" }
      }
    );
    expect(viewerMembership.status()).toBe(201);

    const projectResponse = await ownerContext.request.post(
      `${apiBaseUrl}/api/workspaces/${workspaceId}/projects`,
      {
        headers: ownerAuthorization,
        data: {
          name: `Attachment Project ${runId}`,
          key: `A${runId.slice(-7)}`
        }
      }
    );
    expect(projectResponse.status()).toBe(201);
    const projectBody = (await projectResponse.json()) as {
      data: { project: { id: string } };
    };
    const projectId = projectBody.data.project.id;

    const taskTitle = `Attachment task ${runId}`;
    const taskResponse = await ownerContext.request.post(
      `${apiBaseUrl}/api/workspaces/${workspaceId}/projects/${projectId}/tasks`,
      {
        headers: ownerAuthorization,
        data: { title: taskTitle }
      }
    );
    expect(taskResponse.status()).toBe(201);
    const taskBody = (await taskResponse.json()) as {
      data: { task: { id: string } };
    };
    const taskId = taskBody.data.task.id;
    const attachmentPath = `/api/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}/attachments`;

    const foreignWorkspace = await outsiderContext.request.post(
      `${apiBaseUrl}/api/workspaces`,
      {
        headers: outsiderAuthorization,
        data: { name: `Attachment Foreign ${runId}` }
      }
    );
    expect(foreignWorkspace.status()).toBe(201);

    const ownerPage = await ownerContext.newPage();
    ownerPage.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });
    await ownerPage.goto("/app");
    await expect(ownerPage.getByText(taskTitle)).toBeVisible({ timeout: 20_000 });
    await ownerPage.getByRole("button", { name: "View details" }).click();
    const ownerDialog = ownerPage.getByRole("dialog");
    await expect(ownerDialog.getByText("No attachments yet")).toBeVisible();
    await ownerDialog.getByLabel("Choose an image").setInputFiles({
      name: filename,
      mimeType: "image/png",
      buffer: fixture
    });
    const uploadResponsePromise = ownerPage.waitForResponse(
      (response) =>
        response.url() === `${apiBaseUrl}${attachmentPath}` &&
        response.request().method() === "POST"
    );
    await ownerDialog
      .getByRole("button", { name: "Upload attachment" })
      .click();
    const uploadResponse = await uploadResponsePromise;
    expect(uploadResponse.status()).toBe(201);
    const uploadBody = (await uploadResponse.json()) as {
      data: { attachment: { id: string; filename: string } };
    };
    const attachmentId = uploadBody.data.attachment.id;
    expect(uploadBody.data.attachment.filename).toBe(filename);
    expect(JSON.stringify(uploadBody)).not.toContain("objectKey");
    await expect(ownerDialog.getByText(`${filename} uploaded.`)).toBeVisible();
    await expect(
      ownerDialog.getByRole("listitem").filter({ hasText: filename })
    ).toBeVisible();

    const ownerDownloadPromise = ownerPage.waitForEvent("download");
    await ownerDialog.getByRole("button", { name: "Download" }).click();
    const ownerDownload = await ownerDownloadPromise;
    expect(ownerDownload.suggestedFilename()).toBe(filename);
    expect(await downloadBytes(ownerDownload)).toEqual(fixture);

    const viewerPage = await viewerContext.newPage();
    viewerPage.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });
    await viewerPage.goto("/app");
    await expect(viewerPage.getByText(taskTitle)).toBeVisible({ timeout: 20_000 });
    await viewerPage.getByRole("button", { name: "View details" }).click();
    const viewerDialog = viewerPage.getByRole("dialog");
    await expect(viewerDialog.getByText(filename)).toBeVisible();
    await expect(viewerDialog.getByText(/VIEWER role can download/)).toBeVisible();
    await expect(viewerDialog.getByLabel("Choose an image")).toHaveCount(0);
    await expect(
      viewerDialog.getByRole("button", { name: `Delete ${filename}` })
    ).toHaveCount(0);
    const viewerDownloadPromise = viewerPage.waitForEvent("download");
    await viewerDialog.getByRole("button", { name: "Download" }).click();
    expect(await downloadBytes(await viewerDownloadPromise)).toEqual(fixture);

    const outsiderRead = await outsiderContext.request.get(
      `${apiBaseUrl}${attachmentPath}/${attachmentId}/content`,
      { headers: outsiderAuthorization }
    );
    expect(outsiderRead.status()).toBe(404);

    await ownerDialog
      .getByRole("button", { name: `Delete ${filename}` })
      .click();
    await ownerPage
      .getByRole("button", { name: "Delete attachment" })
      .click();
    await expect(ownerDialog.getByText(`${filename} deleted.`)).toBeVisible();
    await expect(
      ownerDialog.getByRole("listitem").filter({ hasText: filename })
    ).toHaveCount(0);

    const deletedRead = await ownerContext.request.get(
      `${apiBaseUrl}${attachmentPath}/${attachmentId}/content`,
      { headers: ownerAuthorization }
    );
    expect(deletedRead.status()).toBe(404);
    expect(consoleErrors).toEqual([]);
  } finally {
    await outsiderContext.close();
    await viewerContext.close();
    await ownerContext.close();
  }
});
