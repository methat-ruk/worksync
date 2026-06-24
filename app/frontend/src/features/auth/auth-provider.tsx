"use client";

import { useEffect, type ReactNode } from "react";

import { TooltipProvider } from "@/components/ui/tooltip";

import { bootstrapAuth } from "./auth-store";

export function AuthProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    void bootstrapAuth();
  }, []);

  return <TooltipProvider>{children}</TooltipProvider>;
}
