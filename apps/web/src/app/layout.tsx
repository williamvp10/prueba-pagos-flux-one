import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Providers } from "@/components/providers";
import "./globals.css";
export const metadata: Metadata = { title: "Flux One | Pagos personales", description: "Gestiona tus cuentas y transferencias con Flux One." };
export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="es" suppressHydrationWarning><body><a href="#main-content" className="sr-only z-[100] rounded bg-background p-3 text-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Saltar al contenido</a><Providers>{children}</Providers></body></html>;
}
