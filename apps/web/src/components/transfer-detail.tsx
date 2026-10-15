"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, CircleAlert, Clock3, RotateCcw, ShieldCheck, Activity } from "lucide-react";
import { toast } from "sonner";
import type { BrowserComponents } from "@fluxone/api-client";
import { api, ApiError, type AuditPage, type Transfer } from "@/lib/api";
import { formatCop, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/alert-dialog";

type Reversal = BrowserComponents["schemas"]["Reversal"];
const pendingTransferKey = "fluxone:transfer-intent:v1";
const reversalKey = (id: string) => "fluxone:reversal:" + id + ":v1";
const pending = (status: string) => ["PENDING", "PROCESSING", "UNKNOWN"].includes(status);
export function TransferDetail({ id }: { id: string }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reverseBusy, setReverseBusy] = useState(false);
  const reverseLock = useRef(false);
  const [reverseError, setReverseError] = useState("");
  const [auditStarted, setAuditStarted] = useState(Date.now());
  const [auditTimedOut, setAuditTimedOut] = useState(false);
  const transferQuery = useQuery({
    queryKey: ["transfer", id],
    queryFn: () => api<Transfer>("/transfers/" + id),
    refetchInterval: (query) => query.state.data && (pending(query.state.data.status) || Boolean(query.state.data.reversal && pending(query.state.data.reversal.status))) ? 2000 : false,
    refetchIntervalInBackground: false,
  });
  const transfer = transferQuery.data;
  const auditQuery = useQuery({
    queryKey: ["audit", id],
    queryFn: () => api<AuditPage>("/transfers/" + id + "/audit?limit=50"),
    enabled: Boolean(transfer),
    refetchInterval: (query) => query.state.data?.items.length === 0 && Date.now() - auditStarted < 30_000 ? 2500 : false,
    refetchIntervalInBackground: false,
  });
  useEffect(() => {
    setAuditStarted(Date.now());
    setAuditTimedOut(false);
    const timer = window.setTimeout(() => setAuditTimedOut(true), 30_000);
    return () => window.clearTimeout(timer);
  }, [id]);
  useEffect(() => {
    if (transfer?.reversal?.status === "FAILED") sessionStorage.removeItem(reversalKey(id));
  }, [transfer?.reversal?.status, id]);
  useEffect(() => {
    if (!transfer || pending(transfer.status)) return;
    const raw = sessionStorage.getItem(pendingTransferKey);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as { transferId?: string };
      if (parsed.transferId === id) sessionStorage.removeItem(pendingTransferKey);
    } catch { sessionStorage.removeItem(pendingTransferKey); }
  }, [transfer, id]);
  const requestReversal = async () => {
    if (reverseLock.current) return;
    reverseLock.current = true;
    setReverseBusy(true);
    setReverseError("");
    let key = sessionStorage.getItem(reversalKey(id));
    if (!key) { key = crypto.randomUUID(); sessionStorage.setItem(reversalKey(id), key); }
    try {
      const result = await api<Reversal>("/transfers/" + id + "/reversals", { method: "POST", headers: { "Idempotency-Key": key } });
      setConfirmOpen(false);
      if (result.status === "FAILED") {
        sessionStorage.removeItem(reversalKey(id));
        toast.error("El reverso no fue aceptado", { description: result.failureCode ?? "Puedes revisar el motivo y volver a intentarlo." });
      } else {
        toast.success("Solicitud de reverso enviada", { description: "Estamos confirmando el resultado." });
      }
      await transferQuery.refetch();
    } catch (error) {
      if (error instanceof ApiError && [400, 404, 409, 422].includes(error.status)) sessionStorage.removeItem(reversalKey(id));
      setReverseError(error instanceof Error ? error.message : "No pudimos confirmar el reverso. Reintenta con la misma clave.");
    } finally { reverseLock.current = false; setReverseBusy(false); }
  };
  if (transferQuery.isPending) return <div className="grid gap-5" aria-live="polite"><div className="h-8 w-56 animate-pulse rounded bg-muted" /><Card><CardContent className="grid gap-4 p-8"><div className="h-5 w-40 animate-pulse rounded bg-muted" /><div className="h-9 w-64 animate-pulse rounded bg-muted" /><div className="h-4 w-full animate-pulse rounded bg-muted" /></CardContent></Card></div>;
  if (transferQuery.isError || !transfer) return <Card><CardContent className="grid justify-items-center gap-3 p-12 text-center"><CircleAlert className="size-8 text-destructive" /><p className="font-semibold">No pudimos cargar esta transferencia</p><p className="text-sm text-muted-foreground">Puede no existir o tu usuario no tener acceso.</p><div className="flex gap-3"><Button variant="outline" onClick={() => void transferQuery.refetch()}>Reintentar lectura</Button><Link className="inline-flex h-10 items-center rounded-lg border px-4 text-sm font-semibold hover:bg-muted" href="/transfers">Volver a movimientos</Link></div></CardContent></Card>;
  const canReverse = transfer.status === "COMPLETED" && (!transfer.reversal || transfer.reversal.status === "FAILED");
  const audit = auditQuery.data?.items ?? [];
  return <div className="mx-auto grid max-w-4xl gap-7">
    <div><Link href="/transfers" className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Volver a movimientos</Link><p className="text-sm font-medium text-primary">Detalle de movimiento</p><div className="mt-1 flex flex-wrap items-center gap-3"><h1 className="text-3xl font-semibold tracking-tight">Transferencia</h1><StatusBadge status={transfer.status} /></div></div>
    {transfer.reversal && pending(transfer.reversal.status) && <div role="status" className="flex items-start gap-3 rounded-xl border border-blue-500/25 bg-blue-500/10 p-4 text-sm"><Clock3 className="mt-0.5 size-5 shrink-0 text-blue-600 dark:text-blue-300" /><div><p className="font-semibold">Reverso {transfer.reversal.status === "UNKNOWN" ? "por confirmar" : "en seguimiento"}</p><p className="mt-1 text-muted-foreground">Actualizamos el estado automáticamente cada 2 segundos. No vuelvas a enviar la solicitud.</p></div></div>}
    {pending(transfer.status) && <div role="status" className="flex items-start gap-3 rounded-xl border border-blue-500/25 bg-blue-500/10 p-4 text-sm"><Clock3 className="mt-0.5 size-5 shrink-0 text-blue-600 dark:text-blue-300" /><div><p className="font-semibold">{transfer.status === "UNKNOWN" ? "Estamos confirmando el resultado" : "Transferencia en seguimiento"}</p><p className="mt-1 text-muted-foreground">Actualizamos el estado automáticamente cada 2 segundos. Puedes salir de esta página y volver más tarde.</p></div></div>}
    <Card><CardHeader className="flex-row flex-wrap items-start justify-between gap-4"><div><p className="text-sm text-muted-foreground">Monto transferido</p><p className="mt-1 text-3xl font-semibold tracking-tight">{formatCop(transfer.amount)}</p></div>{canReverse && <Button variant="outline" onClick={() => setConfirmOpen(true)}><RotateCcw className="size-4" />Solicitar reverso</Button>}</CardHeader><CardContent><dl className="grid gap-x-6 gap-y-5 border-t pt-5 sm:grid-cols-2"><div><dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Destino</dt><dd className="mt-1 font-medium">{transfer.destination.label}</dd><dd className="text-sm text-muted-foreground">{transfer.destination.code} · {transfer.destination.kind === "EXTERNAL" ? "Otro banco" : "Flux One"}</dd></div><div><dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Fecha de creación</dt><dd className="mt-1 font-medium">{formatDate(transfer.createdAt)}</dd></div><div><dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Identificador</dt><dd className="mt-1 break-all font-mono text-xs">{transfer.id}</dd></div>{transfer.failureCode && <div><dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Código de resultado</dt><dd className="mt-1 font-medium">{transfer.failureCode}</dd></div>}</dl></CardContent></Card>
    {transfer.reversal && <Card><CardHeader><CardTitle className="flex items-center gap-2"><RotateCcw className="size-4" />Último reverso</CardTitle></CardHeader><CardContent><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-medium">{formatCop(transfer.reversal.amount)}</p><p className="mt-1 text-xs text-muted-foreground">{formatDate(transfer.reversal.updatedAt)}</p></div><StatusBadge status={transfer.reversal.status} /></div>{transfer.reversal.failureCode && <p className="mt-3 text-sm text-muted-foreground">Motivo: {transfer.reversal.failureCode}</p>}</CardContent></Card>}
    <section aria-labelledby="audit-title"><div className="mb-4 flex items-end justify-between"><div><h2 id="audit-title" className="flex items-center gap-2 text-lg font-semibold"><ShieldCheck className="size-5 text-primary" />Trazabilidad</h2><p className="mt-1 text-sm text-muted-foreground">Eventos confirmados por los servicios.</p></div><Button variant="outline" size="sm" onClick={() => void auditQuery.refetch()}>Actualizar</Button></div><Card>{auditQuery.isError ? <div className="p-6"><p role="alert" className="text-sm text-muted-foreground">La auditoría no está disponible en este momento.</p><Button className="mt-3" variant="outline" size="sm" onClick={() => void auditQuery.refetch()}>Reintentar lectura</Button></div> : audit.length === 0 ? <div role="status" className="flex items-start gap-3 p-6"><Activity className="mt-0.5 size-5 text-muted-foreground" /><div><p className="font-medium">{!auditTimedOut ? "Sincronizando eventos" : "Aún no hay eventos de auditoría"}</p><p className="mt-1 text-sm text-muted-foreground">La auditoría puede tardar unos segundos en reflejar la operación. Esta ausencia no significa que se haya perdido.</p></div></div> : <ol className="divide-y">{audit.map((entry) => <li key={entry.eventId} className="flex flex-wrap items-start justify-between gap-3 p-5"><div><p className="font-medium">{entry.type.replaceAll("_", " ")}</p><p className="mt-1 text-xs text-muted-foreground">Secuencia {entry.sequence} · {formatDate(entry.occurredAt)}</p></div><StatusBadge status={entry.transferStatus} /></li>)}</ol>}</Card></section>
    {reverseError && <p role="alert" className="text-sm text-destructive">{reverseError} <button className="underline" onClick={() => void requestReversal()}>Reintentar solicitud</button></p>}
    <div className="flex justify-end"><Link className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90" href="/transfers/new">Nueva transferencia <ArrowRight className="size-4" /></Link></div>
    <ConfirmDialog open={confirmOpen} onOpenChange={setConfirmOpen} title="¿Solicitar reverso total?" description={"Se solicitará devolver " + formatCop(transfer.amount) + " a la cuenta de origen. El reverso solo se completa cuando el servicio confirma la operación."} confirmLabel="Confirmar reverso" onConfirm={() => void requestReversal()} busy={reverseBusy} />
  </div>;
}
