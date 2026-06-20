import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";

import { API_ERROR_CODE } from "../common/errors/api-error-code";
import { AccessTokenService } from "./access-token.service";
import { AuthService } from "./auth.service";
import type { AuthenticatedRequest } from "./auth.types";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly accessTokens: AccessTokenService,
    private readonly authService: AuthService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    if (!authorization) {
      throw new UnauthorizedException({
        message: "Authentication required",
        code: API_ERROR_CODE.AUTHENTICATION_REQUIRED
      });
    }

    const match = /^Bearer ([^\s]+)$/i.exec(authorization);
    if (!match?.[1]) {
      throw new UnauthorizedException({
        message: "Invalid access token",
        code: API_ERROR_CODE.INVALID_ACCESS_TOKEN
      });
    }

    const payload = await this.accessTokens.verify(match[1]);
    const user = await this.authService.findPublicUserById(payload.sub);
    if (!user) {
      throw new UnauthorizedException({
        message: "Invalid access token",
        code: API_ERROR_CODE.INVALID_ACCESS_TOKEN
      });
    }

    request.user = user;
    return true;
  }
}
