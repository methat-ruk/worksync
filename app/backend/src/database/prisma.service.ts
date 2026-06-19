import {
  Injectable,
  type BeforeApplicationShutdown,
  type OnModuleInit
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaPg } from "@prisma/adapter-pg";

import type { Environment } from "../config/environment";
import { PrismaClient } from "../generated/prisma/client";

const DATABASE_CONNECTION_TIMEOUT_MS = 5_000;

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, BeforeApplicationShutdown
{
  constructor(config: ConfigService<Environment, true>) {
    const connectionString = config.get("DATABASE_URL", { infer: true });
    const adapter = new PrismaPg({
      connectionString,
      connectionTimeoutMillis: DATABASE_CONNECTION_TIMEOUT_MS
    });
    super({ adapter });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async beforeApplicationShutdown(): Promise<void> {
    await this.$disconnect();
  }
}
