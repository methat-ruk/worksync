import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCookieAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiSeeOtherResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse
} from "@nestjs/swagger";
import type { Request, Response } from "express";

import { API_ERROR_CODE } from "../../common/errors/api-error-code";
import { ApiErrorResponseDto } from "../../common/errors/api-error.dto";
import {
  AuthMessageResponseDto,
  AuthResponseDto,
  CurrentUserResponseDto,
  LoginRequestDto,
  SignUpRequestDto
} from "../dto/auth.dto";
import { CurrentUser } from "../decorators/current-user.decorator";
import { GoogleOAuthError } from "../errors/google-oauth.error";
import { AuthGuard } from "../guards/auth.guard";
import { AuthOriginGuard } from "../guards/auth-origin.guard";
import { AuthService } from "../services/auth.service";
import { GoogleOAuthService } from "../services/google-oauth.service";
import { GoogleOAuthTransactionService } from "../services/google-oauth-transaction.service";
import { SessionCookieService } from "../services/session-cookie.service";
import { SessionService } from "../services/session.service";
import type { PublicUser } from "../types/auth.types";

const REFRESH_COOKIE_RESPONSE_HEADERS = {
  "Set-Cookie": {
    description:
      "Sets, rotates, or clears the scoped HttpOnly refresh-token cookie",
    schema: { type: "string" }
  }
} as const;

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly sessions: SessionService,
    private readonly cookies: SessionCookieService,
    private readonly googleOAuth: GoogleOAuthService,
    private readonly googleTransactions: GoogleOAuthTransactionService
  ) {}

  @Get("google")
  @ApiOperation({ summary: "Start Google OAuth login" })
  @ApiFoundResponse({
    description: "Redirects the browser to Google authorization"
  })
  @ApiServiceUnavailableResponse({
    description: "Google OAuth is disabled or not configured",
    type: ApiErrorResponseDto
  })
  googleLogin(
    @Res() response: Response
  ): void {
    const start = this.googleOAuth.begin();
    this.googleTransactions.set(response, start.transaction);
    response.redirect(HttpStatus.FOUND, start.authorizationUrl);
  }

  @Get("google/callback")
  @ApiOperation({ summary: "Complete Google OAuth login" })
  @ApiQuery({ name: "code", required: false, type: String })
  @ApiQuery({ name: "state", required: false, type: String })
  @ApiQuery({ name: "error", required: false, type: String })
  @ApiSeeOtherResponse({
    description:
      "Sets the refresh cookie on success and redirects to the frontend with a generic status"
  })
  @ApiServiceUnavailableResponse({
    description: "Google OAuth is disabled or not configured",
    type: ApiErrorResponseDto
  })
  async googleCallback(
    @Query("code") code: string | undefined,
    @Query("state") state: string | undefined,
    @Query("error") providerError: string | undefined,
    @Req() request: Request,
    @Res() response: Response
  ): Promise<void> {
    this.googleOAuth.ensureEnabled();
    const transaction = this.googleTransactions.read(request.headers.cookie);
    this.googleTransactions.clear(response);

    if (providerError) {
      try {
        this.googleOAuth.validateState(state, transaction);
        if (providerError === "access_denied") {
          response.redirect(
            HttpStatus.SEE_OTHER,
            this.googleOAuth.cancelledRedirect()
          );
          return;
        }
        throw new GoogleOAuthError("PROVIDER_ERROR");
      } catch (error: unknown) {
        this.googleOAuth.logFailure(error);
        response.redirect(
          HttpStatus.SEE_OTHER,
          this.googleOAuth.failureRedirect()
        );
        return;
      }
    }

    try {
      const authentication = await this.googleOAuth.complete(
        code,
        state,
        transaction,
        request.headers["user-agent"]
      );
      this.cookies.set(
        response,
        authentication.refreshToken,
        authentication.refreshExpiresAt
      );
      response.redirect(
        HttpStatus.SEE_OTHER,
        this.googleOAuth.successRedirect()
      );
    } catch (error: unknown) {
      this.googleOAuth.logFailure(error);
      response.redirect(
        HttpStatus.SEE_OTHER,
        this.googleOAuth.failureRedirect()
      );
    }
  }

  @Post("signup")
  @UseGuards(AuthOriginGuard)
  @ApiOperation({ summary: "Create a password-authenticated account" })
  @ApiCreatedResponse({
    type: AuthResponseDto,
    headers: REFRESH_COOKIE_RESPONSE_HEADERS
  })
  @ApiBadRequestResponse({
    description: "Request validation failed",
    type: ApiErrorResponseDto
  })
  @ApiConflictResponse({
    description: "The normalized email is already registered",
    type: ApiErrorResponseDto
  })
  @ApiForbiddenResponse({
    description: "The browser request origin is not allowed",
    type: ApiErrorResponseDto
  })
  async signUp(
    @Body() input: SignUpRequestDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ): Promise<AuthResponseDto> {
    const authentication = await this.authService.signUp(
      input,
      request.headers["user-agent"]
    );
    this.cookies.set(
      response,
      authentication.refreshToken,
      authentication.refreshExpiresAt
    );
    return {
      success: true,
      message: "Account created",
      data: authentication.data
    };
  }

  @Post("login")
  @UseGuards(AuthOriginGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Authenticate with email and password" })
  @ApiOkResponse({
    type: AuthResponseDto,
    headers: REFRESH_COOKIE_RESPONSE_HEADERS
  })
  @ApiBadRequestResponse({
    description: "Request validation failed",
    type: ApiErrorResponseDto
  })
  @ApiUnauthorizedResponse({
    description: "Invalid email or password",
    type: ApiErrorResponseDto
  })
  @ApiForbiddenResponse({
    description: "The browser request origin is not allowed",
    type: ApiErrorResponseDto
  })
  async login(
    @Body() input: LoginRequestDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ): Promise<AuthResponseDto> {
    const authentication = await this.authService.login(
      input,
      request.headers["user-agent"]
    );
    this.cookies.set(
      response,
      authentication.refreshToken,
      authentication.refreshExpiresAt
    );
    return {
      success: true,
      message: "Authentication successful",
      data: authentication.data
    };
  }

  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthOriginGuard)
  @ApiCookieAuth("refresh-token")
  @ApiOperation({ summary: "Rotate the refresh token and issue a new access token" })
  @ApiOkResponse({
    type: AuthResponseDto,
    headers: REFRESH_COOKIE_RESPONSE_HEADERS
  })
  @ApiUnauthorizedResponse({
    description: "A valid refresh-token cookie is required",
    type: ApiErrorResponseDto
  })
  @ApiForbiddenResponse({
    description: "The browser request origin is not allowed",
    type: ApiErrorResponseDto
  })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ): Promise<AuthResponseDto> {
    const refreshToken = this.requireRefreshToken(request);
    const authentication = await this.sessions.refresh(
      refreshToken,
      request.headers["user-agent"]
    );
    this.cookies.set(
      response,
      authentication.refreshToken,
      authentication.refreshExpiresAt
    );
    return {
      success: true,
      message: "Authentication refreshed",
      data: authentication.data
    };
  }

  @Post("logout")
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthOriginGuard)
  @ApiCookieAuth("refresh-token")
  @ApiOperation({ summary: "Revoke the current session" })
  @ApiOkResponse({
    type: AuthMessageResponseDto,
    headers: REFRESH_COOKIE_RESPONSE_HEADERS
  })
  @ApiForbiddenResponse({
    description: "The browser request origin is not allowed",
    type: ApiErrorResponseDto
  })
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ): Promise<AuthMessageResponseDto> {
    const refreshToken = this.cookies.read(request.headers.cookie);
    if (refreshToken) {
      await this.sessions.revokeFromToken(refreshToken);
    }
    this.cookies.clear(response);
    return { success: true, message: "Logged out" };
  }

  @Post("logout-all")
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  @ApiBearerAuth("access-token")
  @ApiOperation({ summary: "Revoke every session for the authenticated user" })
  @ApiOkResponse({
    type: AuthMessageResponseDto,
    headers: REFRESH_COOKIE_RESPONSE_HEADERS
  })
  @ApiUnauthorizedResponse({
    description: "A valid active access token is required",
    type: ApiErrorResponseDto
  })
  async logoutAll(
    @CurrentUser() user: PublicUser,
    @Res({ passthrough: true }) response: Response
  ): Promise<AuthMessageResponseDto> {
    await this.sessions.revokeAll(user.id);
    this.cookies.clear(response);
    return { success: true, message: "Logged out from all devices" };
  }

  @Get("me")
  @UseGuards(AuthGuard)
  @ApiBearerAuth("access-token")
  @ApiOperation({ summary: "Return the authenticated public user" })
  @ApiOkResponse({ type: CurrentUserResponseDto })
  @ApiUnauthorizedResponse({
    description: "A valid JWT access token is required",
    type: ApiErrorResponseDto
  })
  getCurrentUser(
    @CurrentUser() user: PublicUser
  ): CurrentUserResponseDto {
    return { success: true, data: { user } };
  }

  private requireRefreshToken(request: Request): string {
    const token = this.cookies.read(request.headers.cookie);
    if (!token) {
      throw new UnauthorizedException({
        message: "Refresh token required",
        code: API_ERROR_CODE.REFRESH_TOKEN_REQUIRED
      });
    }
    return token;
  }
}
