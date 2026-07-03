import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  FolderKanban,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  Users
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import type { PublicUser } from "../auth/auth-contract";

const readinessItems = [
  {
    label: "Password auth",
    description: "Credentials protected",
    tone: "text-emerald-700",
    surface: "bg-emerald-500/10",
    icon: LockKeyhole
  },
  {
    label: "Google sign-in",
    description: "Provider connected",
    tone: "text-blue-700",
    surface: "bg-blue-500/10",
    icon: ShieldCheck
  },
  {
    label: "Session lifecycle",
    description: "Refresh rotation ready",
    tone: "text-violet-700",
    surface: "bg-violet-500/10",
    icon: CheckCircle2
  }
];

const nextSteps = [
  {
    icon: Users,
    title: "Workspace foundation",
    body: "Create the shared place where members, projects, and permissions will converge.",
    status: "Coming soon",
    accent: "bg-blue-500/10 text-blue-700",
    statusClass:
      "bg-blue-50 text-blue-700 border-blue-100 dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-200"
  },
  {
    icon: FolderKanban,
    title: "Project planning layer",
    body: "Turn workspace goals into project streams with ownership and visible progress.",
    status: "Designing",
    accent: "bg-violet-500/10 text-violet-700",
    statusClass:
      "bg-violet-50 text-violet-700 border-violet-100 dark:border-violet-400/20 dark:bg-violet-400/10 dark:text-violet-200"
  },
  {
    icon: CalendarClock,
    title: "Task operating rhythm",
    body: "Prepare tasks, notifications, and activity context without changing identity.",
    status: "Queued",
    accent: "bg-amber-500/10 text-amber-700",
    statusClass:
      "bg-amber-50 text-amber-700 border-amber-100 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200"
  }
];

function firstName(displayName: string): string {
  return displayName.split(" ")[0] ?? displayName;
}

function ProductIllustration() {
  return (
    <div
      aria-hidden="true"
      className="relative hidden min-h-52 w-full max-w-sm overflow-hidden rounded-[1.75rem] border bg-white/70 p-4 shadow-sm dark:border-white/15 dark:bg-slate-800/70 dark:shadow-black/20 lg:block"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-white via-slate-50 to-blue-50 dark:from-slate-800 dark:via-slate-900 dark:to-blue-950/45" />
      <div className="absolute right-0 top-0 size-40 rounded-full bg-blue-200/45 blur-3xl dark:bg-blue-400/18" />
      <div className="relative space-y-3">
        <div className="flex items-center justify-between rounded-2xl border bg-white/85 p-3 shadow-sm dark:border-white/15 dark:bg-slate-800/85">
          <div>
            <div className="h-2 w-16 rounded-full bg-slate-200 dark:bg-slate-700" />
            <div className="mt-2 h-2 w-24 rounded-full bg-slate-100 dark:bg-slate-800" />
          </div>
          <span className="grid size-9 place-items-center rounded-xl bg-emerald-500/10 text-emerald-600">
            <ShieldCheck className="size-4" />
          </span>
        </div>
        <div className="grid grid-cols-[1fr_0.72fr] gap-3">
          <div className="rounded-2xl border bg-white/90 p-3 shadow-sm dark:border-white/15 dark:bg-slate-800/85">
            <div className="mb-4 flex items-center gap-2">
              <span className="size-2 rounded-full bg-blue-500" />
              <div className="h-2 w-20 rounded-full bg-slate-200 dark:bg-slate-700" />
            </div>
            <div className="space-y-2">
              <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800" />
              <div className="h-2 w-4/5 rounded-full bg-slate-100 dark:bg-slate-800" />
              <div className="h-2 w-2/3 rounded-full bg-slate-100 dark:bg-slate-800" />
            </div>
          </div>
          <div className="rounded-2xl border bg-slate-950 p-3 text-white shadow-sm dark:border-white/15 dark:bg-slate-950/80">
            <div className="mb-3 flex -space-x-1.5">
              {["bg-blue-400", "bg-violet-400", "bg-emerald-400"].map(
                (color) => (
                  <span
                    className={`size-6 rounded-full border-2 border-slate-950 ${color}`}
                    key={color}
                  />
                )
              )}
            </div>
            <div className="h-2 w-16 rounded-full bg-white/35" />
            <div className="mt-2 h-2 w-10 rounded-full bg-white/20" />
          </div>
        </div>
        <div className="rounded-2xl border bg-white/80 p-3 shadow-sm dark:border-white/15 dark:bg-slate-800/85">
          <div className="flex items-center justify-between">
            <div className="h-2 w-24 rounded-full bg-slate-200 dark:bg-slate-700" />
            <Badge className="rounded-full border-blue-200 bg-blue-50 px-2.5 text-[10px] font-semibold text-blue-700 shadow-sm shadow-blue-950/5 dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-200">
              Coming soon
            </Badge>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div className="h-full w-3/5 rounded-full bg-primary" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function HomeDashboard({ user }: { user: PublicUser }) {
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <section className="relative overflow-hidden rounded-[1.75rem] border bg-card shadow-sm dark:border-white/15 dark:bg-slate-900 dark:shadow-[0_24px_80px_rgb(0_0_0_/_0.28),inset_0_1px_0_rgb(255_255_255_/_0.05)]">
        <div className="absolute inset-0 bg-gradient-to-br from-white via-slate-50 to-blue-50/70 dark:hidden" />
        <div className="absolute inset-0 hidden bg-slate-900 dark:block" />
        <div className="absolute inset-0 hidden bg-[radial-gradient(circle_at_82%_26%,rgb(59_130_246_/_0.18),transparent_32%),linear-gradient(135deg,rgb(30_41_59),rgb(15_23_42)_48%,rgb(17_24_39))] dark:block" />
        <div className="absolute right-12 top-8 size-56 rounded-full bg-blue-200/45 blur-3xl dark:bg-blue-400/18" />
        <div className="relative grid gap-8 p-6 md:p-8 lg:grid-cols-[1fr_360px] lg:p-9">
          <div className="max-w-2xl">
            <div className="inline-flex max-w-full items-center rounded-full border bg-white/75 px-3 py-1.5 text-sm font-semibold text-blue-700 shadow-sm shadow-slate-950/5 dark:border-blue-300/20 dark:bg-blue-400/10 dark:text-blue-100">
              <Sparkles aria-hidden="true" className="mr-2 size-4 shrink-0" />
              <span className="truncate">Auth foundation</span>
            </div>
            <h1 className="mt-6 text-balance text-3xl font-semibold tracking-[-0.04em] text-slate-950 dark:text-foreground md:text-5xl">
              Welcome back, {firstName(user.displayName)}.
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground md:text-base md:leading-7">
              Your identity foundation is ready. WorkSync is now preparing the
              workspace layer where teams, projects, and task context will begin
              to connect.
            </p>
            <div className="mt-7 grid gap-3 sm:grid-cols-3">
              {readinessItems.map((item) => (
                <div
                  className="rounded-2xl border bg-white/78 p-3 shadow-sm dark:border-white/15 dark:bg-slate-800/65"
                  key={item.label}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-lg p-1.5 ${item.surface} ${item.tone}`}
                    >
                      <item.icon aria-hidden="true" className="size-3.5" />
                    </span>
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                      {item.label}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {item.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
          <ProductIllustration />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {nextSteps.map((item) => (
          <article
            className="group rounded-[1.35rem] border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-md dark:border-white/15 dark:bg-slate-800/70 dark:shadow-[0_18px_48px_rgb(0_0_0_/_0.20),inset_0_1px_0_rgb(255_255_255_/_0.04)] dark:hover:border-white/25 dark:hover:bg-slate-800/90"
            key={item.title}
          >
            <div className="flex items-start justify-between gap-3">
              <span
                className={`grid size-11 place-items-center rounded-2xl ${item.accent}`}
              >
                <item.icon aria-hidden="true" className="size-5" />
              </span>
              <Badge
                variant="secondary"
                className={`rounded-full border px-2.5 text-[10px] font-semibold ${item.statusClass}`}
              >
                {item.status}
              </Badge>
            </div>
            <h2 className="mt-5 text-base font-semibold tracking-[-0.015em]">
              {item.title}
            </h2>
            <p className="mt-2 min-h-16 text-sm leading-6 text-muted-foreground">
              {item.body}
            </p>
            <Button
              className="mt-4 h-auto cursor-not-allowed items-center gap-1.5 px-0 text-muted-foreground opacity-70"
              disabled
              variant="link"
            >
              <span className="leading-none">Product preview</span>
              <ArrowRight aria-hidden="true" className="size-3.5 translate-y-px" />
            </Button>
          </article>
        ))}
      </section>
    </div>
  );
}
