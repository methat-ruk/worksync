import { ArrowUpRight, FolderKanban, Sparkles, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import type { PublicUser } from "../auth/auth-contract";

export function HomeDashboard({ user }: { user: PublicUser }) {
  return (
    <div className="mx-auto max-w-6xl space-y-7">
      <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="grid gap-8 p-6 md:grid-cols-[1fr_auto] md:p-9">
          <div>
            <Badge variant="secondary">
              <Sparkles aria-hidden="true" />
              Foundation ready
            </Badge>
            <h1 className="mt-5 max-w-2xl text-3xl font-semibold tracking-[-0.035em] md:text-4xl">
              Welcome back, {user.displayName.split(" ")[0]}.
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
              Your secure workspace is ready. Team collaboration features will
              arrive here without changing how you sign in.
            </p>
          </div>
          <div className="hidden size-28 place-items-center rounded-2xl bg-primary/8 text-primary md:grid">
            <Sparkles aria-hidden="true" className="size-10" />
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {[
          {
            icon: Users,
            title: "Create your first workspace",
            body: "Bring people, projects, and decisions into one shared place."
          },
          {
            icon: FolderKanban,
            title: "Plan a project",
            body: "Turn a goal into focused work with clear ownership and status."
          }
        ].map((item) => (
          <article
            key={item.title}
            className="rounded-2xl border bg-card p-6 shadow-sm"
          >
            <span className="grid size-10 place-items-center rounded-xl bg-muted text-foreground">
              <item.icon aria-hidden="true" />
            </span>
            <h2 className="mt-5 text-base font-semibold">{item.title}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {item.body}
            </p>
            <Button className="mt-5 px-0" disabled variant="link">
              Coming soon
              <ArrowUpRight aria-hidden="true" />
            </Button>
          </article>
        ))}
      </section>
    </div>
  );
}
