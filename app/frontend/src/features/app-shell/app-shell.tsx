"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronsUpDown,
  Home,
  LogOut,
  Menu,
  Moon,
  Monitor,
  PanelsTopLeft,
  ShieldCheck,
  Sun,
  X
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
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { BrandMark } from "@/components/brand-mark";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import { authErrorMessage } from "../auth/model/auth-error-message";
import { logout, logoutAll, useAuth } from "../auth/auth-store";
import { useTheme } from "../theme/theme-provider";

const themeOptions = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon }
] as const;

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
    <div className="flex h-full flex-col border-r border-white/20 bg-sidebar-dark px-3 py-4 text-white shadow-[1px_0_0_rgb(255_255_255/0.06),8px_0_30px_rgb(0_0_0/0.12)]">
      <div className="px-2 pb-7">
        <BrandMark />
      </div>
      <nav aria-label="Primary" className="flex flex-col gap-1">
        <Link
          aria-current="page"
          className="flex h-11 w-full items-center gap-3 rounded-2xl bg-white/13 px-3 text-left text-sm font-medium text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.08),0_10px_30px_rgb(0_0_0/0.10)] transition-colors hover:bg-white/18 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          href="/app"
        >
          <Home aria-hidden="true" className="size-4" />
          <span>Home</span>
        </Link>
      </nav>
      <div className="mt-auto overflow-hidden rounded-2xl border border-white/10 bg-white/4.5 p-3 shadow-2xl shadow-black/10">
        <div className="mb-3 flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-lg bg-primary/20 text-primary-foreground">
            <ShieldCheck aria-hidden="true" className="size-3.5" />
          </span>
          <p className="text-xs font-semibold text-white/86">Workspace access</p>
        </div>
        <p className="mt-1 text-xs leading-5 text-white/45">
          Workspaces, projects, and tasks are limited by your current membership
          and role.
        </p>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const router = useRouter();
  const theme = useTheme();
  const [logoutAllOpen, setLogoutAllOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const mobileSidebarRef = useRef<HTMLElement>(null);
  const user = auth.user!;

  useEffect(() => {
    if (mobileSidebarRef.current) {
      mobileSidebarRef.current.inert = !mobileSidebarOpen;
    }
  }, [mobileSidebarOpen]);

  useEffect(() => {
    if (!profileMenuOpen && !mobileSidebarOpen) {
      return undefined;
    }

    const mobileQuery = window.matchMedia("(max-width: 639px)");
    if (!mobileQuery.matches) {
      return undefined;
    }

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [mobileSidebarOpen, profileMenuOpen]);

  async function finishLogout(allDevices: boolean) {
    setBusy(true);
    setLogoutError(null);
    try {
      await (allDevices ? logoutAll() : logout());
      router.replace("/login");
    } catch (error: unknown) {
      setLogoutError(authErrorMessage(error));
    } finally {
      setBusy(false);
      setLogoutAllOpen(false);
    }
  }

  return (
    <div
      className={cn(
        "min-h-screen bg-app-canvas lg:grid",
        sidebarCollapsed
          ? "lg:grid-cols-[0_1fr]"
          : "lg:grid-cols-[248px_1fr]"
      )}
    >
      <aside
        className={cn(
          "fixed inset-y-0 left-0 hidden overflow-hidden transition-[width] duration-200 lg:block",
          sidebarCollapsed ? "w-0" : "w-62"
        )}
      >
        <Sidebar />
      </aside>
      <div
        aria-hidden="true"
        className={cn(
          "fixed inset-0 z-40 bg-slate-950/35 backdrop-blur-[1px] transition-opacity duration-200 lg:hidden",
          mobileSidebarOpen
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0"
        )}
        onClick={() => setMobileSidebarOpen(false)}
      />
      <aside
        aria-label="Navigation"
        aria-modal={mobileSidebarOpen}
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-62 overflow-hidden transition-transform duration-200 lg:hidden",
          mobileSidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
        ref={mobileSidebarRef}
        role="dialog"
      >
        <Sidebar />
        <Button
          aria-label="Close navigation"
          className="absolute right-3 top-3 rounded-xl text-white hover:bg-white/10 hover:text-white"
          onClick={() => setMobileSidebarOpen(false)}
          size="icon"
          type="button"
          variant="ghost"
        >
          <X aria-hidden="true" className="size-4" />
        </Button>
      </aside>
      <div className="min-w-0 lg:col-start-2">
        <header className="sticky top-0 z-30 flex h-16 items-center border-b bg-background/90 px-4 backdrop-blur md:px-7">
          <Button
            aria-label={sidebarCollapsed ? "Show navigation" : "Hide navigation"}
            className="mr-3 hidden rounded-xl border bg-background shadow-xs hover:bg-muted lg:inline-flex"
            onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
            size="icon"
            type="button"
            variant="ghost"
          >
            <Menu aria-hidden="true" />
          </Button>
          <Button
            aria-expanded={mobileSidebarOpen}
            aria-label={mobileSidebarOpen ? "Close navigation" : "Open navigation"}
            className="mr-3 rounded-xl border bg-background shadow-xs hover:bg-muted lg:hidden"
            onClick={() => setMobileSidebarOpen((open) => !open)}
            size="icon"
            type="button"
            variant="ghost"
          >
            <Menu aria-hidden="true" />
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold">Home</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Workspace home
            </p>
          </div>
          <Separator
            className="ml-auto mr-2 h-7 self-auto"
            orientation="vertical"
          />
          {profileMenuOpen && (
            <button
              aria-label="Close profile menu"
              className="fixed inset-x-0 bottom-0 top-16 z-20 cursor-default bg-slate-950/25 backdrop-blur-[1px] sm:hidden"
              onClick={() => setProfileMenuOpen(false)}
              type="button"
            />
          )}
          <DropdownMenu
            open={profileMenuOpen}
            onOpenChange={setProfileMenuOpen}
          >
            <DropdownMenuTrigger
              className="ml-0"
              render={
                <Button
                  className="h-11 gap-2.5 rounded-xl border bg-background px-2 pr-2.5 shadow-xs hover:bg-muted dark:border-white/10 dark:bg-slate-900/80 dark:hover:bg-slate-800"
                  variant="ghost"
                />
              }
            >
              <span className="relative">
                <Avatar className="size-8 border border-primary/20 bg-primary/10" size="default">
                  <AvatarFallback className="bg-primary/10 text-[11px] font-semibold text-primary-emphasis">
                    {initials(user.displayName)}
                  </AvatarFallback>
                </Avatar>
                <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-background bg-success" />
              </span>
              <span className="hidden min-w-0 text-left sm:block">
                <span className="block max-w-40 truncate text-sm font-semibold">
                  {user.displayName}
                </span>
              </span>
              <ChevronsUpDown aria-hidden="true" className="size-3.5 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-64 rounded-2xl border bg-card p-2 shadow-xl shadow-slate-950/12"
              sideOffset={8}
            >
              <DropdownMenuGroup>
                <DropdownMenuLabel className="rounded-xl p-0">
                  <div className="flex items-center gap-2">
                    <Avatar className="size-8 border border-primary/20 bg-primary/10" size="default">
                      <AvatarFallback className="bg-primary/10 text-[11px] font-semibold text-primary-emphasis">
                        {initials(user.displayName)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-foreground">
                        {user.displayName}
                      </span>
                      <span className="block truncate text-[11px] font-normal text-muted-foreground">
                        {user.email}
                      </span>
                      <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-success/10 px-1.5 py-0.5 text-[10px] font-semibold text-success-emphasis">
                        <span className="size-1.5 rounded-full bg-success" />
                        Active session
                      </span>
                    </span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="my-1.5" />
                <div className="px-2 py-1.5">
                  <div className="mb-1 text-[10px] font-semibold text-muted-foreground">
                    Theme
                  </div>
                  <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">
                    {themeOptions.map((option) => (
                      <button
                        className={cn(
                          "inline-flex h-7 items-center justify-center gap-1 rounded-lg px-1.5 text-[11px] font-semibold transition-colors",
                          theme.mode === option.value
                            ? "bg-background text-foreground shadow-xs"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                        key={option.value}
                        onClick={() => theme.setMode(option.value)}
                        type="button"
                      >
                        <option.icon aria-hidden="true" className="size-3" />
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
                <DropdownMenuSeparator className="my-1.5" />
                <DropdownMenuItem
                  className="h-auto cursor-pointer rounded-xl px-2 py-1.5"
                  disabled={busy}
                  onClick={() => void finishLogout(false)}
                >
                  <LogOut
                    aria-hidden="true"
                    className="mr-2 size-3.5 text-muted-foreground"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold text-foreground">
                      Sign out
                    </span>
                    <span className="block text-[10px] font-normal text-muted-foreground">
                      Sign out of this device
                    </span>
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="h-auto cursor-pointer rounded-xl px-2 py-1.5"
                  disabled={busy}
                  variant="destructive"
                  onClick={() => setLogoutAllOpen(true)}
                >
                  <PanelsTopLeft aria-hidden="true" className="mr-2 size-3.5" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold">
                      Sign out all devices
                    </span>
                    <span className="block text-[10px] font-normal text-muted-foreground">
                      Sign out from all devices and browsers
                    </span>
                  </span>
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        <main className="flex flex-col gap-4 p-4 md:p-7">
          {logoutError && (
            <Alert variant="destructive">
              <AlertDescription>{logoutError}</AlertDescription>
            </Alert>
          )}
          {children}
        </main>
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
