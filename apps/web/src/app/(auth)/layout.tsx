import type { ReactNode } from "react";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
export default function AuthLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-background"><header className="flex h-16 items-center justify-between border-b px-5 sm:px-10"><Link href="/login" className="flex items-center gap-2 font-semibold"><span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground">F</span>Flux One</Link><ThemeToggle /></header><main id="main-content" className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl place-items-center px-4 py-10"><div className="w-full max-w-md">{children}</div></main></div>;
}
