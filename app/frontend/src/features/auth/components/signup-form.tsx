"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

import { signUp } from "../auth-store";
import { authErrorMessage } from "../error-message";
import { evaluatePassword, PASSWORD_POLICY } from "../password-policy";
import { AuthError } from "./auth-error";
import { GoogleButton } from "./google-button";
import { PasswordInput } from "./password-input";
import { PasswordStrength } from "./password-strength";

const signupSchema = z
  .object({
    displayName: z
      .string()
      .trim()
      .min(1, "Enter your name.")
      .max(100, "Name must be 100 characters or fewer."),
    email: z.string().trim().email("Enter a valid email address."),
    password: z.string(),
    confirmPassword: z.string()
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match."
  });

type SignupValues = z.infer<typeof signupSchema>;

export function SignupForm() {
  const router = useRouter();
  const [requestError, setRequestError] = useState<string | null>(null);
  const form = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      displayName: "",
      email: "",
      password: "",
      confirmPassword: ""
    }
  });
  const password = form.watch("password") ?? "";
  const displayName = form.watch("displayName") ?? "";
  const email = form.watch("email") ?? "";
  const userInputs = useMemo(
    () => [displayName.trim(), email.trim().toLowerCase()],
    [displayName, email]
  );

  const onSubmit = form.handleSubmit(async (values) => {
    setRequestError(null);
    const evaluation = await evaluatePassword(values.password, [
      values.displayName.trim(),
      values.email.trim().toLowerCase()
    ]);
    if (!evaluation.valid) {
      form.setError("password", {
        type: "policy",
        message: "Your password must meet every requirement below."
      });
      return;
    }

    try {
      await signUp(
        values.displayName.trim(),
        values.email.trim().toLowerCase(),
        values.password
      );
      router.replace("/app");
    } catch (error: unknown) {
      setRequestError(authErrorMessage(error));
    }
  });

  return (
    <div className="flex flex-col gap-4">
      <GoogleButton />
      <FieldSeparator>or create an account with email</FieldSeparator>
      <AuthError message={requestError} />
      <form className="flex flex-col gap-4" noValidate onSubmit={onSubmit}>
        <FieldGroup className="gap-4">
          <Field data-invalid={Boolean(form.formState.errors.displayName)}>
            <FieldLabel htmlFor="displayName">Name</FieldLabel>
            <Input
              id="displayName"
              autoComplete="name"
              className="h-10"
              aria-invalid={Boolean(form.formState.errors.displayName)}
              {...form.register("displayName")}
            />
            <FieldError errors={[form.formState.errors.displayName]} />
          </Field>
          <Field data-invalid={Boolean(form.formState.errors.email)}>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              className="h-10"
              aria-invalid={Boolean(form.formState.errors.email)}
              {...form.register("email")}
            />
            <FieldError errors={[form.formState.errors.email]} />
          </Field>
          <Field data-invalid={Boolean(form.formState.errors.password)}>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <PasswordInput
              id="password"
              autoComplete="new-password"
              maxLength={PASSWORD_POLICY.maxLength}
              aria-invalid={Boolean(form.formState.errors.password)}
              {...form.register("password")}
            />
            <FieldDescription>
              Use a memorable passphrase. Composition rules are not required.
            </FieldDescription>
            <PasswordStrength password={password} userInputs={userInputs} />
            <FieldError errors={[form.formState.errors.password]} />
          </Field>
          <Field data-invalid={Boolean(form.formState.errors.confirmPassword)}>
            <FieldLabel htmlFor="confirmPassword">Confirm password</FieldLabel>
            <PasswordInput
              id="confirmPassword"
              autoComplete="new-password"
              maxLength={PASSWORD_POLICY.maxLength}
              aria-invalid={Boolean(form.formState.errors.confirmPassword)}
              {...form.register("confirmPassword")}
            />
            <FieldDescription>
              Confirmation is checked only in this browser and is never sent.
            </FieldDescription>
            <FieldError errors={[form.formState.errors.confirmPassword]} />
          </Field>
        </FieldGroup>
        <Button
          className="h-10 w-full hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/20"
          disabled={form.formState.isSubmitting}
          type="submit"
        >
          {form.formState.isSubmitting && (
            <LoaderCircle aria-hidden="true" className="animate-spin" />
          )}
          Create account
        </Button>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link className="font-medium text-primary hover:underline" href="/login">
          Sign in
        </Link>
      </p>
    </div>
  );
}
