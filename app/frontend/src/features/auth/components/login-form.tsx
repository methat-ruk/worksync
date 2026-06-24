"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

import { login } from "../auth-store";
import { authErrorMessage } from "../error-message";
import { safeNextPath } from "../navigation";
import { AuthError } from "./auth-error";
import { GoogleButton } from "./google-button";
import { PasswordInput } from "./password-input";

const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password.")
});

type LoginValues = z.infer<typeof loginSchema>;

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [requestError, setRequestError] = useState<string | null>(null);
  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" }
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setRequestError(null);
    try {
      await login(values.email, values.password);
      router.replace(safeNextPath(searchParams.get("next")));
    } catch (error: unknown) {
      setRequestError(authErrorMessage(error));
    }
  });

  return (
    <div className="flex flex-col gap-4">
      <GoogleButton />
      <FieldSeparator>or continue with email</FieldSeparator>
      <AuthError message={requestError} />
      <form className="flex flex-col gap-4" noValidate onSubmit={onSubmit}>
        <FieldGroup className="gap-4">
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
              autoComplete="current-password"
              aria-invalid={Boolean(form.formState.errors.password)}
              {...form.register("password")}
            />
            <FieldError errors={[form.formState.errors.password]} />
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
          Sign in
        </Button>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        New to WorkSync?{" "}
        <Link className="font-medium text-primary hover:underline" href="/signup">
          Create an account
        </Link>
      </p>
    </div>
  );
}
