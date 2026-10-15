"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, type Account } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
export function BootstrapRetry() {
  const router = useRouter(); const queryClient = useQueryClient(); const [busy, setBusy] = useState(false);
  const retry = async () => { setBusy(true); try { await api<Account>("/accounts/bootstrap", { method: "POST" }); await queryClient.invalidateQueries({ queryKey: ["accounts"] }); router.refresh(); } catch { toast.error("No pudimos preparar tu cuenta", { description: "Tu sesión sigue activa. Inténtalo de nuevo en unos minutos." }); } finally { setBusy(false); } };
  return <Card><CardContent className="grid justify-items-center gap-3 py-12 text-center"><p className="text-lg font-semibold">Tu cuenta está por configurarse</p><p className="max-w-md text-sm text-muted-foreground">La sesión está activa, pero el servicio de cuentas no respondió. Puedes volver a intentar el proceso.</p><Button onClick={retry} disabled={busy}>{busy ? "Preparando…" : "Reintentar configuración"}</Button></CardContent></Card>;
}
