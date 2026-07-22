import type { Metadata } from "next";
import { Toaster } from "sonner";
import { QueryProvider } from "@/lib/query-provider";
import { RegisterSW } from "@/components/register-sw";
import "./globals.css";

export const metadata: Metadata = {
  title: "My Event Planner",
  description: "Plan events and keep budgets under control.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <QueryProvider>{children}</QueryProvider>
        <RegisterSW />
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
