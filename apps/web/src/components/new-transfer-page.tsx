"use client";
import { useQuery } from "@tanstack/react-query";
import { api, type Account, type Beneficiary } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { BootstrapRetry } from "@/components/bootstrap-retry";
import { NewTransferForm } from "@/components/new-transfer-form";
export function NewTransferPage() {
  const accounts = useQuery({ queryKey: ["accounts"], queryFn: () => api<Account[]>("/accounts") });
  const beneficiaries = useQuery({ queryKey: ["beneficiaries"], queryFn: () => api<Beneficiary[]>("/beneficiaries") });
  if (accounts.isPending || beneficiaries.isPending) return <div className="mx-auto grid max-w-3xl gap-7" aria-live="polite"><div><div className="h-4 w-24 animate-pulse rounded bg-muted" /><div className="mt-3 h-9 w-64 animate-pulse rounded bg-muted" /></div><div className="h-80 rounded-2xl bg-muted" /></div>;
  if (accounts.isError || beneficiaries.isError) return <Card><CardContent className="grid justify-items-center gap-3 p-10 text-center"><p className="font-semibold">No pudimos preparar la transferencia</p><p className="text-sm text-muted-foreground">Los datos de cuentas o destinos no están disponibles.</p><button className="h-10 rounded-lg border px-4 text-sm font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => { void accounts.refetch(); void beneficiaries.refetch(); }}>Reintentar lectura</button></CardContent></Card>;
  const accountList = accounts.data ?? [];
  const beneficiaryList = beneficiaries.data ?? [];
  if (!accountList.length) return <div className="mx-auto grid max-w-3xl gap-7"><div><p className="text-sm font-medium text-primary">Pagos</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Nueva transferencia</h1></div><BootstrapRetry /></div>;
  return <div className="mx-auto grid max-w-3xl gap-7"><div><p className="text-sm font-medium text-primary">Pagos</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Nueva transferencia</h1><p className="mt-2 text-sm text-muted-foreground">Revisa los datos antes de confirmar el envío.</p></div>{beneficiaryList.length ? <NewTransferForm accounts={accountList} beneficiaries={beneficiaryList} /> : <Card><CardContent className="p-8 text-center"><p className="font-semibold">No hay destinos disponibles</p><p className="mt-1 text-sm text-muted-foreground">Inténtalo de nuevo más tarde.</p></CardContent></Card>}</div>;
}
