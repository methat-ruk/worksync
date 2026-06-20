import {
  BadRequestException,
  HttpException,
  HttpStatus,
  NotFoundException
} from "@nestjs/common";

import { normalizeException } from "../../src/common/errors/global-exception.filter";

describe("normalizeException", () => {
  it("normalizes DTO validation failures", () => {
    expect(
      normalizeException(
        new BadRequestException({
          message: ["email must be an email", "name should not be empty"]
        })
      )
    ).toEqual({
      status: HttpStatus.BAD_REQUEST,
      body: {
        success: false,
        message: "Validation failed",
        data: {
          code: "VALIDATION_ERROR",
          fields: {
            email: ["email must be an email"],
            name: ["name should not be empty"]
          }
        }
      }
    });
  });

  it("attributes unknown properties to the rejected field", () => {
    expect(
      normalizeException(
        new BadRequestException({
          message: ["property unexpected should not exist"]
        })
      )
    ).toMatchObject({
      body: {
        data: {
          fields: {
            unexpected: ["property unexpected should not exist"]
          }
        }
      }
    });
  });

  it("preserves safe HTTP errors", () => {
    expect(normalizeException(new NotFoundException("Missing"))).toEqual({
      status: HttpStatus.NOT_FOUND,
      body: { success: false, message: "Missing" }
    });
  });

  it("preserves registered error codes and drops unknown codes", () => {
    expect(
      normalizeException(
        new HttpException(
          { message: "Conflict", code: "RESOURCE_CONFLICT" },
          HttpStatus.CONFLICT
        )
      )
    ).toMatchObject({
      body: { data: { code: "RESOURCE_CONFLICT" } }
    });

    expect(
      normalizeException(
        new HttpException(
          { message: "Conflict", code: "UNREGISTERED_CODE" },
          HttpStatus.CONFLICT
        )
      )
    ).toEqual({
      status: HttpStatus.CONFLICT,
      body: { success: false, message: "Conflict" }
    });
  });

  it("hides unexpected error details", () => {
    expect(normalizeException(new Error("database password leaked"))).toEqual({
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: {
        success: false,
        message: "Internal server error",
        data: { code: "INTERNAL_SERVER_ERROR" }
      }
    });
  });
});
