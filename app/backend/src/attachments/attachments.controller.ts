import {
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  PayloadTooLargeException,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UnprocessableEntityException,
  UseGuards
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiConsumes,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiPayloadTooLargeResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse
} from "@nestjs/swagger";
import type { Request, Response } from "express";

import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AuthGuard } from "../auth/guards/auth.guard";
import type { PublicUser } from "../auth/types/auth.types";
import { API_ERROR_CODE } from "../common/errors/api-error-code";
import { ApiErrorResponseDto } from "../common/errors/api-error.dto";
import { MAX_ATTACHMENT_BYTES } from "./attachment-policy";
import { AttachmentsService } from "./attachments.service";
import {
  AttachmentListResponseDto,
  AttachmentResponseDto,
  ListAttachmentsQueryDto
} from "./dto/attachment.dto";
import {
  MultipartUploadError,
  parseAttachmentUpload
} from "./multipart-upload";

function singleHeader(request: Request, name: string): string | undefined {
  const value = request.headers[name.toLowerCase()];
  return Array.isArray(value) ? undefined : value;
}

function requireIdempotencyKey(request: Request): string {
  const value = singleHeader(request, "idempotency-key")?.trim();
  if (!value || value.length > 128 || !/^[A-Za-z0-9._~-]+$/u.test(value)) {
    throw new UnprocessableEntityException({
      message: "Idempotency-Key must be 1-128 URL-safe characters",
      code: API_ERROR_CODE.VALIDATION_ERROR
    });
  }
  return value;
}

function requireUploadLength(request: Request): number {
  const value = singleHeader(request, "x-upload-length")?.trim();
  if (!value || !/^\d+$/u.test(value)) {
    throw new UnprocessableEntityException({
      message: "X-Upload-Length must be a positive integer",
      code: API_ERROR_CODE.VALIDATION_ERROR
    });
  }
  const size = Number(value);
  if (!Number.isSafeInteger(size) || size < 1) {
    throw new UnprocessableEntityException({
      message: "X-Upload-Length must be a positive integer",
      code: API_ERROR_CODE.VALIDATION_ERROR
    });
  }
  if (size > MAX_ATTACHMENT_BYTES) {
    throw new PayloadTooLargeException({
      message: "Attachment exceeds the 10 MiB limit",
      code: API_ERROR_CODE.ATTACHMENT_TOO_LARGE
    });
  }
  return size;
}

function contentDisposition(filename: string): string {
  const fallback = filename.replace(/[^\x20-\x21\x23-\x5b\x5d-\x7e]/gu, "_");
  const encoded = encodeURIComponent(filename).replace(
    /[!'()*]/gu,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

async function requireMultipartUpload(request: Request) {
  try {
    return await parseAttachmentUpload(request);
  } catch (error: unknown) {
    if (
      error instanceof MultipartUploadError &&
      error.reasonCode === "FILE_TOO_LARGE"
    ) {
      throw new PayloadTooLargeException({
        message: "Attachment exceeds the 10 MiB limit",
        code: API_ERROR_CODE.ATTACHMENT_TOO_LARGE
      });
    }
    throw new UnprocessableEntityException({
      message: "A single multipart file field is required",
      code: API_ERROR_CODE.ATTACHMENT_CONTENT_REJECTED
    });
  }
}

@ApiTags("attachments")
@ApiBearerAuth("access-token")
@UseGuards(AuthGuard)
@Controller(
  "workspaces/:workspaceId/projects/:projectId/tasks/:taskId/attachments"
)
export class AttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  @Post()
  @ApiOperation({ summary: "Upload one PNG or JPEG task attachment" })
  @ApiConsumes("multipart/form-data")
  @ApiHeader({ name: "Idempotency-Key", required: true })
  @ApiHeader({ name: "X-Upload-Length", required: true })
  @ApiBody({
    schema: {
      type: "object",
      required: ["file"],
      properties: { file: { type: "string", format: "binary" } }
    }
  })
  @ApiCreatedResponse({ type: AttachmentResponseDto })
  @ApiOkResponse({
    type: AttachmentResponseDto,
    description: "Completed idempotent replay"
  })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiPayloadTooLargeResponse({ type: ApiErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ApiErrorResponseDto })
  @ApiServiceUnavailableResponse({ type: ApiErrorResponseDto })
  async upload(
    @CurrentUser() user: PublicUser,
    @Param("workspaceId") workspaceId: string,
    @Param("projectId") projectId: string,
    @Param("taskId") taskId: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ): Promise<AttachmentResponseDto> {
    const idempotencyKey = requireIdempotencyKey(request);
    const declaredSize = requireUploadLength(request);
    const upload = await requireMultipartUpload(request);
    const result = await this.attachments.upload(
      user.id,
      workspaceId,
      projectId,
      taskId,
      idempotencyKey,
      declaredSize,
      upload
    );
    response.status(result.replayed ? HttpStatus.OK : HttpStatus.CREATED);
    return {
      success: true,
      message: result.replayed ? "Attachment already uploaded" : "Attachment uploaded",
      data: { attachment: result.attachment }
    };
  }

  @Get()
  @ApiOperation({ summary: "List available task attachments" })
  @ApiOkResponse({ type: AttachmentListResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  async list(
    @CurrentUser() user: PublicUser,
    @Param("workspaceId") workspaceId: string,
    @Param("projectId") projectId: string,
    @Param("taskId") taskId: string,
    @Query() query: ListAttachmentsQueryDto
  ): Promise<AttachmentListResponseDto> {
    return {
      success: true,
      data: await this.attachments.list(
        user.id,
        workspaceId,
        projectId,
        taskId,
        query
      )
    };
  }

  @Get(":attachmentId/content")
  @ApiOperation({ summary: "Download an authorized task attachment" })
  @ApiOkResponse({ description: "Forced-download binary stream" })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiServiceUnavailableResponse({ type: ApiErrorResponseDto })
  async download(
    @CurrentUser() user: PublicUser,
    @Param("workspaceId") workspaceId: string,
    @Param("projectId") projectId: string,
    @Param("taskId") taskId: string,
    @Param("attachmentId") attachmentId: string,
    @Res({ passthrough: true }) response: Response
  ): Promise<StreamableFile> {
    const download = await this.attachments.download(
      user.id,
      workspaceId,
      projectId,
      taskId,
      attachmentId
    );
    response.setHeader("Content-Type", "application/octet-stream");
    response.setHeader("Content-Length", String(download.size));
    response.setHeader("Content-Disposition", contentDisposition(download.filename));
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Cache-Control", "private, no-store");
    return new StreamableFile(download.body);
  }

  @Delete(":attachmentId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "Delete an authorized task attachment" })
  @ApiNoContentResponse()
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  @ApiServiceUnavailableResponse({ type: ApiErrorResponseDto })
  async delete(
    @CurrentUser() user: PublicUser,
    @Param("workspaceId") workspaceId: string,
    @Param("projectId") projectId: string,
    @Param("taskId") taskId: string,
    @Param("attachmentId") attachmentId: string
  ): Promise<void> {
    await this.attachments.delete(
      user.id,
      workspaceId,
      projectId,
      taskId,
      attachmentId
    );
  }
}
