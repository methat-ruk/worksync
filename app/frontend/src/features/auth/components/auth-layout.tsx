import type { ReactNode } from "react";
import Link from "next/link";

import { BrandMark } from "./brand-mark";

export function AuthLayout({
  title,
  description,
  children
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <main className="bg-auth-shell min-h-screen">
      <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(480px,0.82fr)]">
        <section className="bg-auth-marketing-panel relative hidden overflow-hidden border-r px-12 py-10 lg:flex lg:flex-col">
          <Link href="/" aria-label="WorkSync home">
            <BrandMark />
          </Link>
          <div className="relative z-10 my-auto max-w-lg">
            <p className="mb-5 w-fit rounded-full border bg-background/65 px-3 py-1 text-xs font-medium text-primary shadow-sm shadow-primary/5">
              Enterprise-ready team operations
            </p>
            <p className="text-4xl font-semibold leading-tight tracking-[-0.035em] text-foreground xl:text-5xl">
              Bring your team&apos;s work into focus.
            </p>
            <p className="mt-5 max-w-md text-base leading-7 text-muted-foreground">
              One calm place for projects, tasks, conversations, and the work
              that moves your team forward.
            </p>
            <div className="mt-8 grid max-w-md grid-cols-2 gap-3">
              {["Secure sessions", "Workspace-ready"].map((item) => (
                <div
                  key={item}
                  className="rounded-2xl border bg-background/55 px-4 py-3 text-sm font-medium text-foreground/85 shadow-sm shadow-primary/5"
                >
                  {item}
                </div>
              ))}
            </div>
          </div>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 auth-grid opacity-50"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-32 -right-28 size-[28rem] rounded-full bg-primary/10 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-12 right-24 size-48 rounded-full border border-primary/10"
          />
        </section>

        <section className="auth-form-surface flex min-h-screen items-center justify-center bg-card px-5 py-10 sm:px-8 lg:px-12">
          <div className="w-full max-w-[420px]">
            <div className="mb-10 lg:hidden">
              <Link href="/" aria-label="WorkSync home">
                <BrandMark />
              </Link>
            </div>
            <div className="mb-8">
              <h1 className="text-3xl font-semibold tracking-[-0.025em]">
                {title}
              </h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {description}
              </p>
            </div>
            {children}
          </div>
        </section>
      </div>
    </main>
  );
}
