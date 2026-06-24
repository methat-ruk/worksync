import { PublicOnlyRoute } from "@/features/auth/auth-guard";
import { AuthLayout } from "@/features/auth/components/auth-layout";
import { SignupForm } from "@/features/auth/components/signup-form";

export default function SignupPage() {
  return (
    <PublicOnlyRoute>
      <AuthLayout
        title="Create your account"
        description="Start with secure access. Build your team workspace next."
      >
        <SignupForm />
      </AuthLayout>
    </PublicOnlyRoute>
  );
}
