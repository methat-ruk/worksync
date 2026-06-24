import { BadRequestException, Injectable } from "@nestjs/common";
import { evaluatePasswordPolicy } from "@worksync/auth-policy/evaluate";

import { API_ERROR_CODE } from "../../common/errors/api-error-code";

@Injectable()
export class PasswordPolicyService {
  assertValid(
    password: string,
    userInputs: string[] = []
  ): void {
    const evaluation = evaluatePasswordPolicy(password, userInputs);
    if (evaluation.valid) {
      return;
    }

    throw new BadRequestException({
      message: "Password does not meet security requirements",
      code: API_ERROR_CODE.AUTH_PASSWORD_POLICY_VIOLATION
    });
  }
}
