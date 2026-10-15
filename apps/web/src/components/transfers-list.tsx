"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownLeft, ArrowUpRight, ExternalLink, FileClock } from "lucide-react";
import { api, type TransferPage } from "@/lib/api";
import { formatCop, formatDate } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { TransferFilters } from "@/components/transfer-filters";
export function TransfersList({ status, cursor }: { status?: string; cursor?: string }) {
  const params = { status, cursor };
  const allowed = ["PENDING", "PROCESSING", "UNKNOWN", "COMPLETED", "FAILED", "REVERSED"];
  const selectedStatus = params.status && allowed.includes(params.status) ? params.status : undefined;
  const query = new URLSearchParams({ limit: "50" });
  if (selectedStatus) query.set("status", selectedStatus);
  if (params.cursor) query.set("cursor", params.cursor);
  const pageQuery = useQuery({ queryKey: ["transfers", params.status ?? "ALL", params.cursor ?? ""], queryFn: () => api<TransferPage>("/transfers?" + query.toString()) });
  const page = pageQuery.data;
  if (pageQuery.isPending) return <div className="grid gap-7" aria-live="polite"><div className="h-12 w-full animate-pulse rounded bg-muted" /><div className="h-80 rounded-2xl bg-muted" /></div>;
  if (pageQuery.isError || !page) return <Card><CardContent className="grid justify-items-center gap-3 p-10 text-center"><p className="font-semibold">No pudimos cargar los movimientos</p><p className="text-sm text-muted-foreground">Intenta actualizar el historial.</p><button className="h-10 rounded-lg border px-4 text-sm font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => void pageQuery.refetch()}>Reintentar lectura</button></CardContent></Card>;
  return <div className="grid gap-7"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-medium text-primary">Actividad</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Movimientos</h1><p className="mt-2 text-sm text-muted-foreground">Revisa el estado y la trazabilidad de tus transferencias.</p></div><TransferFilters selected={selectedStatus ?? "ALL"} /></div>
    <Card>{page.items.length ? <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left"><thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-5 py-3 font-medium">Destino</th><th className="px-5 py-3 font-medium">Fecha</th><th className="px-5 py-3 font-medium">Monto</th><th className="px-5 py-3 font-medium">Estado</th><th className="px-5 py-3"><span className="sr-only">Detalle</span></th></tr></thead><tbody className="divide-y">{page.items.map((transfer) => <tr key={transfer.id} className="hover:bg-muted/30"><td className="px-5 py-4"><Link href={`/transfers/${transfer.id}`} className="flex items-center gap-3 font-medium hover:text-primary"><span className="grid size-9 place-items-center rounded-full bg-muted">{transfer.destination.kind === "INTERNAL" ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}</span><span>{transfer.destination.label}<span className="mt-0.5 block text-xs font-normal text-muted-foreground">{transfer.destination.code}</span></span></Link></td><td className="px-5 py-4 text-sm text-muted-foreground">{formatDate(transfer.createdAt)}</td><td className="px-5 py-4 text-sm font-semibold">{formatCop(transfer.amount)}</td><td className="px-5 py-4"><StatusBadge status={transfer.status} /></td><td className="px-5 py-4"><Link className="rounded p-2 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href={`/transfers/${transfer.id}`} aria-label={`Ver transferencia a ${transfer.destination.label}`}><ExternalLink className="size-4" /></Link></td></tr>)}</tbody></table></div> : <div className="grid justify-items-center gap-3 p-12 text-center"><FileClock className="size-8 text-muted-foreground" /><p className="font-medium">No hay movimientos para este filtro</p><p className="max-w-sm text-sm text-muted-foreground">Cuando realices una transferencia, podrás seguir su estado desde aquí.</p></div>}</Card>
    {page.nextCursor && <div className="flex justify-center"><Link className="rounded-lg border px-4 py-2 text-sm font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href={`/transfers?${new URLSearchParams({ ...(params.status ? { status: params.status } : {}), cursor: page.nextCursor }).toString()}`}>Cargar más movimientos</Link></div>}
  </div>;
}
