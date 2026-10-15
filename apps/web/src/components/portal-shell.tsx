"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeftRight, CircleUserRound, LayoutDashboard, LogOut, Menu, ReceiptText, Wallet, X } from "lucide-react";
import { toast } from "sonner";
import { ApiError, api, type User } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/accounts", label: "Resumen", icon: LayoutDashboard },
  { href: "/transfers/new", label: "Nueva transferencia", icon: ArrowLeftRight },
  { href: "/transfers", label: "Movimientos", icon: ReceiptText },
];
export function PortalShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const session = useQuery({ queryKey: ["session"], queryFn: () => api<User>("/auth/me"), retry: false });
  useEffect(() => { if (session.isError && session.error instanceof ApiError && session.error.status === 401) router.replace("/login"); }, [session.isError, session.error, router]);
  const logout = async () => {
    try { await api<void>("/auth/logout", { method: "POST" }); router.replace("/login"); }
    catch { toast.error("No se pudo cerrar la sesión. Intenta nuevamente."); }
  };
  return <div className="min-h-screen bg-background">
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r bg-sidebar lg:block">
      <div className="flex h-20 items-center gap-3 px-6"><div className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground"><Wallet className="size-5" /></div><div><p className="font-semibold tracking-tight">Flux One</p><p className="text-xs text-muted-foreground">Pagos seguros</p></div></div>
      <nav aria-label="Navegación principal" className="grid gap-1 px-3 pt-5">{nav.map(({ href, label, icon: Icon }) => <Link key={href} href={href} onClick={() => setOpen(false)} className={cn("flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", (pathname === href || (href === "/transfers" && pathname.startsWith("/transfers/"))) && "bg-primary/10 text-primary")}><Icon className="size-4" aria-hidden="true" />{label}</Link>)}</nav>
      <div className="absolute inset-x-4 bottom-5 rounded-xl border bg-card p-4"><p className="text-xs font-semibold">Tu dinero, bajo control</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Cada movimiento conserva su trazabilidad.</p></div>
    </aside>
    {open && <div className="fixed inset-0 z-50 bg-background lg:hidden"><div className="flex h-16 items-center justify-between border-b px-4"><span className="font-semibold">Flux One</span><Button variant="ghost" size="icon" aria-label="Cerrar menú" onClick={() => setOpen(false)}><X className="size-5" /></Button></div><nav aria-label="Navegación principal" className="grid gap-2 p-4">{nav.map(({ href, label, icon: Icon }) => <Link key={href} href={href} onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-lg p-3 font-medium"><Icon className="size-4" />{label}</Link>)}</nav></div>}
    <div className="lg:pl-64">
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-background/90 px-4 backdrop-blur sm:px-8">
        <div className="flex items-center gap-3"><Button className="lg:hidden" variant="ghost" size="icon" aria-label="Abrir menú" onClick={() => setOpen(true)}><Menu className="size-5" /></Button><div className="hidden text-sm text-muted-foreground sm:block">Portal personal</div></div>
        <div className="flex items-center gap-1"><ThemeToggle /><div className="ml-2 flex items-center gap-2 border-l pl-3"><div className="grid size-9 place-items-center rounded-full bg-secondary"><CircleUserRound className="size-4 text-muted-foreground" /></div><div className="hidden max-w-44 sm:block"><p className="truncate text-sm font-medium">{session.data?.email ?? "Cargando sesión…"}</p><p className="text-xs text-muted-foreground">Cuenta personal</p></div><Button variant="ghost" size="icon" aria-label="Cerrar sesión" onClick={logout}><LogOut className="size-4" /></Button></div></div>
      </header>
      <main id="main-content" className="mx-auto w-full max-w-[1200px] px-4 py-7 sm:px-8 sm:py-10">{session.isPending ? <div aria-live="polite" className="grid gap-5"><div className="h-8 w-48 animate-pulse rounded bg-muted" /><div className="h-48 rounded-2xl bg-muted" /></div> : session.isError ? session.error instanceof ApiError && session.error.status === 401 ? <div role="status" className="p-8 text-center text-sm text-muted-foreground">Redirigiendo al inicio de sesión…</div> : <div className="grid justify-items-center gap-3 rounded-2xl border bg-card p-10 text-center"><p className="font-semibold">No pudimos validar tu sesión</p><p className="text-sm text-muted-foreground">Revisa tu conexión e inténtalo nuevamente.</p><Button variant="outline" onClick={() => void session.refetch()}>Reintentar</Button></div> : children}</main>
    </div>
  </div>;
}
