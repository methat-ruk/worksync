import "./globals.css";

import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AuthProvider } from "@/features/auth/auth-provider";

export const metadata: Metadata = {
  title: "WorkSync",
  description: "Team collaboration workspace for projects, tasks, comments, and notifications."
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" className="font-sans">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
