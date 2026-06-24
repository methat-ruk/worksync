"use client";

import { useEffect, useState } from "react";
import { Check, Circle } from "lucide-react";

import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

import {
  evaluatePassword,
  immediatePasswordChecks,
  PASSWORD_POLICY_MESSAGES,
  type PasswordPolicyEvaluation
} from "../password-policy";

const labels = ["Very weak", "Weak", "Fair", "Strong", "Very strong"];

export function PasswordStrength({
  password,
  userInputs
}: {
  password: string;
  userInputs: string[];
}) {
  const immediate = immediatePasswordChecks(password);
  const [evaluation, setEvaluation] =
    useState<PasswordPolicyEvaluation | null>(null);

  useEffect(() => {
    let active = true;
    const timeout = window.setTimeout(() => {
      void evaluatePassword(password, userInputs).then((result) => {
        if (active) {
          setEvaluation(result);
        }
      });
    }, 160);
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [password, userInputs]);

  const score = evaluation?.score ?? 0;
  const checks = {
    length: immediate.length,
    noOuterWhitespace: immediate.noOuterWhitespace,
    strongEnough: evaluation?.checks.strongEnough ?? false
  };

  return (
    <div className="flex flex-col gap-3" aria-live="polite">
      <div className="flex items-center gap-3">
        <Progress
          aria-label="Password strength"
          className="flex-1"
          value={password ? (score + 1) * 20 : 0}
        />
        <span className="w-20 text-right text-xs font-medium text-muted-foreground">
          {password ? labels[score] : "Not rated"}
        </span>
      </div>
      <ul className="flex flex-col gap-1.5 text-xs text-muted-foreground">
        {(
          Object.entries(PASSWORD_POLICY_MESSAGES) as Array<
            [keyof typeof checks, string]
          >
        ).map(([key, message]) => {
          const complete = checks[key];
          return (
            <li
              key={key}
              className={cn(
                "flex items-start gap-2 transition-colors motion-reduce:transition-none",
                complete && "text-emerald-700"
              )}
            >
              {complete ? (
                <Check aria-hidden="true" className="mt-0.5 size-3.5" />
              ) : (
                <Circle aria-hidden="true" className="mt-0.5 size-3.5" />
              )}
              <span>{message}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
