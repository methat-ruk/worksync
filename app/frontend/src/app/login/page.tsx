import { Suspense } from "react";

import { PublicOnlyRoute } from "@/features/auth/auth-guard";
import { AuthLayout } from "@/features/auth/components/auth-layout";
import { LoginForm } from "@/features/auth/components/login-form";

export default function LoginPage() {
  return (
    <PublicOnlyRoute>
      <AuthLayout
        title="Welcome back"
        description="Sign in to continue to your WorkSync workspace."
      >
        <Suspense>
          <LoginForm />
        </Suspense>
      </AuthLayout>
    </PublicOnlyRoute>
  );
}
