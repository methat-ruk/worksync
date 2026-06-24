"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, CheckCircle2 } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BrandMark } from "@/features/auth/components/brand-mark";
import { OAuthLanding } from "@/features/auth/components/oauth-landing";

const previewItems = [
  {
    label: "Authentication foundation",
    accent: "border-emerald-200/80 bg-emerald-50/55 text-emerald-700"
  },
  {
    label: "Google sign-in",
    accent: "border-blue-200/80 bg-blue-50/55 text-blue-700"
  },
  {
    label: "Session lifecycle",
    accent: "border-violet-200/80 bg-violet-50/55 text-violet-700"
  },
  {
    label: "Shared password policy",
    accent: "border-amber-200/80 bg-amber-50/55 text-amber-700"
  }
];

function LandingContent() {
  const searchParams = useSearchParams();
  if (searchParams.has("auth")) {
    return <OAuthLanding />;
  }

  return (
    <main className="bg-landing-canvas min-h-screen overflow-hidden">
      <header className="mx-auto flex h-16 max-w-7xl items-center px-5 md:px-8">
        <BrandMark linked />
        <div className="ml-auto flex items-center gap-2">
          <Link
            className={cn(
              buttonVariants({ variant: "ghost" }),
              "h-9 px-3 leading-none hover:-translate-y-0.5 hover:bg-background hover:shadow-md hover:shadow-primary/15"
            )}
            href="/login"
          >
            Sign in
          </Link>
          <Link
            className={cn(
              buttonVariants({ variant: "default" }),
              "h-9 px-3 leading-none hover:-translate-y-0.5 hover:bg-primary/90 hover:shadow-md hover:shadow-primary/25"
            )}
            href="/signup"
          >
            Get started
          </Link>
        </div>
      </header>
      <section className="relative mx-auto grid max-w-7xl gap-12 px-5 pb-20 pt-20 md:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:pt-28">
        <div className="relative z-10">
          <p className="w-fit rounded-full border bg-background/70 px-3 py-1 text-sm font-medium text-primary shadow-sm shadow-primary/5">
            One calm place for collaborative work
          </p>
          <h1 className="mt-5 max-w-3xl text-5xl font-semibold leading-[0.98] tracking-[-0.055em] text-foreground md:text-7xl">
            Keep your team&apos;s work in sync.
          </h1>
          <p className="mt-7 max-w-xl text-lg leading-8 text-muted-foreground">
            Secure authentication today, with workspaces, projects, tasks, and
            conversations designed to fit together tomorrow.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link
              className={cn(
                buttonVariants({ size: "lg" }),
                "h-11 px-5 hover:-translate-y-0.5 hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/25"
              )}
              href="/signup"
            >
              Create your account
              <ArrowRight aria-hidden="true" />
            </Link>
            <Link
              className={cn(
                buttonVariants({ size: "lg", variant: "outline" }),
                "h-11 px-5 hover:-translate-y-0.5 hover:border-primary/25 hover:bg-background hover:shadow-lg hover:shadow-primary/15"
              )}
              href="/login"
            >
              Sign in
            </Link>
          </div>
        </div>
        <div className="relative">
          <div
            aria-hidden="true"
            className="absolute -inset-10 rounded-full bg-primary/10 blur-3xl"
          />
          <div className="relative rounded-3xl border bg-background/65 p-3 shadow-xl shadow-primary/5 backdrop-blur">
            <div className="rounded-2xl border bg-card/95 p-6 shadow-sm shadow-slate-950/5">
              <div className="flex items-center gap-3 border-b pb-5">
                <span className="size-3 rounded-full bg-rose-300" />
                <span className="size-3 rounded-full bg-amber-300" />
                <span className="size-3 rounded-full bg-emerald-300" />
                <span className="ml-auto rounded-full border bg-muted/45 px-2.5 py-1 text-xs font-medium text-muted-foreground">
                  Auth system
                </span>
              </div>
              <div className="grid gap-3 pt-6">
                {previewItems.map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center gap-3 rounded-xl border bg-background/85 p-3.5 text-sm font-medium shadow-sm shadow-slate-950/[0.03]"
                  >
                    <span
                      className={cn(
                        "grid size-8 place-items-center rounded-lg border",
                        item.accent
                      )}
                    >
                      <CheckCircle2 aria-hidden="true" className="size-4" />
                    </span>
                    <span className="text-foreground/90">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

export default function HomePage() {
  return (
    <Suspense>
      <LandingContent />
    </Suspense>
  );
}
