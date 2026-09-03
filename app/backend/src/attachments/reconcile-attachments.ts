import { NestFactory } from "@nestjs/core";

import { AppModule } from "../app.module";
import { AttachmentReconciliationService } from "./attachment-reconciliation.service";

function batchSize(arguments_: string[]): number {
  const argument = arguments_.find((value) => value.startsWith("--batch="));
  return argument ? Number(argument.slice("--batch=".length)) : 100;
}

async function main(): Promise<void> {
  const application = await NestFactory.createApplicationContext(AppModule, {
    bufferLogs: true
  });
  try {
    const arguments_ = process.argv.slice(2);
    const report = await application
      .get(AttachmentReconciliationService)
      .reconcile(arguments_.includes("--apply"), batchSize(arguments_));
    process.stdout.write(`${JSON.stringify(report)}\n`);
  } finally {
    await application.close();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  process.stderr.write(
    `${JSON.stringify({ level: "error", message: "Attachment reconciliation failed", error: message })}\n`
  );
  process.exitCode = 1;
});
