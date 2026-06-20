import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse
} from "@nestjs/swagger";

import {
  AuthResponseDto,
  CurrentUserResponseDto,
  LoginRequestDto,
  SignUpRequestDto
} from "./auth.dto";
import { ApiErrorResponseDto } from "../common/errors/api-error.dto";
import { AuthGuard } from "./auth.guard";
import { AuthService } from "./auth.service";
import { CurrentUser } from "./current-user.decorator";
import type { PublicUser } from "./auth.types";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("signup")
  @ApiOperation({ summary: "Create a password-authenticated account" })
  @ApiCreatedResponse({ type: AuthResponseDto })
  @ApiBadRequestResponse({
    description: "Request validation failed",
    type: ApiErrorResponseDto
  })
  @ApiConflictResponse({
    description: "The normalized email is already registered",
    type: ApiErrorResponseDto
  })
  async signUp(@Body() input: SignUpRequestDto): Promise<AuthResponseDto> {
    return {
      success: true,
      message: "Account created",
      data: await this.authService.signUp(input)
    };
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Authenticate with email and password" })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiBadRequestResponse({
    description: "Request validation failed",
    type: ApiErrorResponseDto
  })
  @ApiUnauthorizedResponse({
    description: "Invalid email or password",
    type: ApiErrorResponseDto
  })
  async login(@Body() input: LoginRequestDto): Promise<AuthResponseDto> {
    return {
      success: true,
      message: "Authentication successful",
      data: await this.authService.login(input)
    };
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
}
