"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  CheckSquare2,
  ChevronsUpDown,
  FolderKanban,
  Home,
  LogOut,
  Menu,
  PanelsTopLeft,
  Users
} from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

import { BrandMark } from "../auth/components/brand-mark";
import { logout, logoutAll, useAuth } from "../auth/auth-store";

const navItems = [
  { label: "Home", icon: Home, active: true },
  { label: "Workspaces", icon: Users },
  { label: "Projects", icon: FolderKanban },
  { label: "Tasks", icon: CheckSquare2 },
  { label: "Notifications", icon: Bell }
];

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function Sidebar() {
  return (
    <div className="flex h-full flex-col bg-sidebar-dark px-3 py-4 text-white">
      <div className="px-2 pb-7">
        <BrandMark />
      </div>
      <nav aria-label="Primary" className="space-y-1">
        {navItems.map((item) => (
          <button
            key={item.label}
            className={cn(
              "flex h-9 w-full items-center gap-3 rounded-lg px-3 text-left text-sm transition-colors",
              item.active
                ? "bg-white/10 font-medium text-white"
                : "cursor-not-allowed text-white/50"
            )}
            disabled={!item.active}
            type="button"
          >
            <item.icon aria-hidden="true" className="size-4" />
            <span>{item.label}</span>
            {!item.active && (
              <Badge className="ml-auto border-white/10 bg-white/5 text-[10px] text-white/50">
                Soon
              </Badge>
            )}
          </button>
        ))}
      </nav>
      <div className="mt-auto rounded-xl border border-white/10 bg-white/[0.04] p-3">
        <p className="text-xs font-medium text-white/80">Your work, in sync</p>
        <p className="mt-1 text-xs leading-5 text-white/45">
          Workspaces and projects will appear here as the product grows.
        </p>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const router = useRouter();
  const [logoutAllOpen, setLogoutAllOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const user = auth.user!;

  async function finishLogout(allDevices: boolean) {
    setBusy(true);
    try {
      await (allDevices ? logoutAll() : logout());
      router.replace("/login");
    } finally {
      setBusy(false);
      setLogoutAllOpen(false);
    }
  }

  return (
    <div className="min-h-screen bg-app-canvas lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="fixed inset-y-0 left-0 hidden w-[248px] lg:block">
        <Sidebar />
      </aside>
      <div className="min-w-0 lg:col-start-2">
        <header className="sticky top-0 z-30 flex h-16 items-center border-b bg-background/90 px-4 backdrop-blur md:px-7">
          <Sheet>
            <SheetTrigger
              className="mr-3 lg:hidden"
              render={<Button size="icon" variant="ghost" />}
            >
              <Menu aria-hidden="true" />
              <span className="sr-only">Open navigation</span>
            </SheetTrigger>
            <SheetContent
              className="w-[280px] border-0 p-0"
              side="left"
              showCloseButton={false}
            >
              <SheetHeader className="sr-only">
                <SheetTitle>Navigation</SheetTitle>
              </SheetHeader>
              <Sidebar />
            </SheetContent>
          </Sheet>
          <div>
            <p className="text-sm font-semibold">Home</p>
            <p className="text-xs text-muted-foreground">Your WorkSync overview</p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger
              className="ml-auto"
              render={<Button className="h-10 gap-2 px-2" variant="ghost" />}
            >
              <Avatar size="sm">
                <AvatarFallback>{initials(user.displayName)}</AvatarFallback>
              </Avatar>
              <span className="hidden max-w-36 truncate text-sm sm:block">
                {user.displayName}
              </span>
              <ChevronsUpDown aria-hidden="true" className="size-3.5 opacity-50" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel>
                <span className="block truncate text-foreground">
                  {user.displayName}
                </span>
                <span className="block truncate font-normal">{user.email}</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={busy}
                onClick={() => void finishLogout(false)}
              >
                <LogOut aria-hidden="true" />
                Sign out
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={busy}
                variant="destructive"
                onClick={() => setLogoutAllOpen(true)}
              >
                <PanelsTopLeft aria-hidden="true" />
                Sign out all devices
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        <main className="p-4 md:p-7">{children}</main>
      </div>

      <AlertDialog open={logoutAllOpen} onOpenChange={setLogoutAllOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out all devices?</AlertDialogTitle>
            <AlertDialogDescription>
              Every active WorkSync session for this account will be revoked.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              variant="destructive"
              onClick={() => void finishLogout(true)}
            >
              Sign out all devices
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
