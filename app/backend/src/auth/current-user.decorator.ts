import {
  createParamDecorator,
  type ExecutionContext
} from "@nestjs/common";

import type { AuthenticatedRequest, PublicUser } from "./auth.types";

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): PublicUser => {
    return context.switchToHttp().getRequest<AuthenticatedRequest>().user;
  }
);

