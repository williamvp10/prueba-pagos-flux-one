"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Link2, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError, type Account, type PaymentLink, type PaymentLinkPage as PaymentLinkPageData } from "@/lib/api";
import { canonicalPaymentLinkAmount, newLinkIntent, parseStoredIntent, paymentLinkIntentStorageKey, paymentLinkErrorMessage } from "@/lib/payment-links";
import { formatCop } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, ConfirmDialog } from "@/components/ui/alert-dialog";
import { Badge, statusLabel } from "@/components/ui/badge";

const statusTone: Record<string, string> = { ACTIVE: "border-primary/30 bg-primary/10 text-primary", PAID: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300", CANCELLED: "border-muted-foreground/30 bg-muted text-muted-foreground", EXPIRED: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300" };
type Payload = { destinationAccountId: string; amount: string; currency: "COP" };
function isPayload(value: unknown): value is Payload { return !!value && typeof value === "object" && typeof (value as Payload).destinationAccountId === "string" && typeof (value as Payload).amount === "string" && (value as Payload).currency === "COP"; }
const storageKey = paymentLinkIntentStorageKey;

export function PaymentLinksPage() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [destination, setDestination] = useState("");
  const [amount, setAmount] = useState("");
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [intent, setIntent] = useState<ReturnType<typeof parseStoredIntent<Payload>>>(null);
  const intentRef = useRef<typeof intent>(null);
  const sendingRef = useRef(false);
  const accountsQuery = useQuery({ queryKey: ["accounts"], queryFn: () => api<Account[]>("/accounts") });
  const queryKey = ["payment-links", status, cursor];
  const linksQuery = useQuery({ queryKey, queryFn: () => api<PaymentLinkPageData>(`/payment-links?limit=20${status ? `&status=${status}` : ""}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`) });
  const canonicalAmount = canonicalPaymentLinkAmount(amount);
  const account = accountsQuery.data?.find((item) => item.id === destination);

  useEffect(() => {
    const restored = parseStoredIntent(sessionStorage.getItem(storageKey), isPayload);
    if (restored) { intentRef.current = restored; setIntent(restored); setDestination(restored.payload.destinationAccountId); setAmount(restored.payload.amount); setFailure("Hay una creación cuyo resultado aún no confirmamos. Reintenta con la misma clave."); }
  }, []);

  const submit = async (current: NonNullable<typeof intent>) => {
    if (sendingRef.current) return;
    sendingRef.current = true; setBusy(true); setFailure("");
    try {
      const created = await api<PaymentLink>("/payment-links", { method: "POST", headers: { "Idempotency-Key": current.key }, body: JSON.stringify(current.payload) });
      sessionStorage.removeItem(storageKey); intentRef.current = null; setIntent(null);
      await queryClient.invalidateQueries({ queryKey: ["payment-links"] });
      window.location.assign(`/payment-links/${created.id}`);
    } catch (error) {
      if (error instanceof ApiError && [400, 404, 409, 422].includes(error.status)) {
        sessionStorage.removeItem(storageKey); intentRef.current = null; setIntent(null);
        setFailure(paymentLinkErrorMessage(error.code));
      } else {
        intentRef.current = current; setIntent(current); sessionStorage.setItem(storageKey, JSON.stringify(current));
        setFailure("No confirmamos el resultado. Conservamos la misma clave; vuelve a intentar para consultar la creación.");
      }
    } finally { sendingRef.current = false; setBusy(false); }
  };
  const confirm = () => {
    if (!account || !canonicalAmount) return;
    const payload: Payload = { destinationAccountId: account.id, amount: canonicalAmount, currency: "COP" };
    const current = intentRef.current?.payload.destinationAccountId === payload.destinationAccountId && intentRef.current?.payload.amount === payload.amount
      ? intentRef.current : newLinkIntent(payload);
    intentRef.current = current; setIntent(current); sessionStorage.setItem(storageKey, JSON.stringify(current)); setReview(false); void submit(current);
  };
  const beginReview = () => { setFailure(""); if (!account || !canonicalAmount) { setFailure("Selecciona una cuenta propia e ingresa un monto válido mayor que cero."); return; } setReview(true); };

  return <div className="grid gap-7">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-medium text-primary">Links de cobro</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Cobros</h1><p className="mt-2 text-sm text-muted-foreground">Crea un link de un solo uso para recibir un pago en pesos colombianos.</p></div><Button onClick={() => document.getElementById("create-link")?.scrollIntoView({ behavior: "smooth", block: "center" })}><Plus className="size-4" />Crear cobro</Button></div>
    <Card id="create-link"><CardHeader><CardTitle>Crear un cobro</CardTitle><p className="text-sm text-muted-foreground">El link vence en 24 horas y no reserva dinero en tu cuenta.</p></CardHeader><CardContent><div className="grid gap-5 sm:grid-cols-2">
      <Field label="Cuenta receptora"><select className="h-11 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60" value={destination} disabled={Boolean(intent)} onChange={(event) => setDestination(event.target.value)}><option value="">Selecciona una cuenta propia</option>{(accountsQuery.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.code}</option>)}</select></Field>
      <Field label="Monto en COP" hint="Hasta dos decimales; máximo $ 999.999.999.999,99."><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span><Input className="pl-8" inputMode="decimal" placeholder="0,00" value={amount} disabled={Boolean(intent)} onChange={(event) => setAmount(event.target.value)} /></div></Field>
      {failure && <p role="alert" className="sm:col-span-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">{failure}</p>}
      <div className="sm:col-span-2 flex flex-wrap items-center gap-3">{intent ? <Button onClick={() => void submit(intent)} disabled={busy}><RefreshCw className="size-4" />{busy ? "Consultando resultado…" : "Reintentar con la misma clave"}</Button> : <Button onClick={beginReview} disabled={accountsQuery.isPending || busy}>Revisar cobro<ArrowRight className="size-4" /></Button>}<span className="text-xs text-muted-foreground">Cualquier persona con el link podrá ver el monto y pagar mientras esté activo.</span></div>
    </div></CardContent></Card>
    <section aria-labelledby="links-heading" className="grid gap-4"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 id="links-heading" className="text-lg font-semibold">Tus links</h2><p className="text-sm text-muted-foreground">Estado confirmado por el servicio.</p></div><label className="grid gap-1 text-sm font-medium">Estado<select className="h-11 min-w-40 rounded-lg border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={status} onChange={(event) => { setStatus(event.target.value); setCursor(null); }}><option value="">Todos</option><option value="ACTIVE">Activo</option><option value="PAID">Pagado</option><option value="CANCELLED">Cancelado</option><option value="EXPIRED">Vencido</option></select></label></div>
      <Card>{linksQuery.isPending ? <div aria-live="polite" className="p-8 text-center text-sm text-muted-foreground">Cargando tus links…</div> : linksQuery.isError ? <div role="alert" className="grid justify-items-center gap-3 p-8 text-center"><p className="font-medium">No pudimos cargar tus links</p><Button variant="outline" onClick={() => void linksQuery.refetch()}>Reintentar lectura</Button></div> : linksQuery.data?.items.length ? <div className="divide-y">{linksQuery.data.items.map((link) => <Link key={link.id} href={`/payment-links/${link.id}`} className="flex min-h-20 flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-6"><div className="flex min-w-0 items-center gap-3"><div className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><Link2 className="size-4" aria-hidden="true" /></div><div className="min-w-0"><p className="font-medium">{link.destination.code} · {link.destination.label}</p><p className="text-xs text-muted-foreground">Vence {new Date(link.expiresAt).toLocaleString("es-CO", { timeZone: "America/Bogota" })}</p></div></div><div className="flex items-center gap-3"><span className="font-semibold">{formatCop(link.amount)}</span><Badge className={statusTone[link.status]}>{statusLabel(link.status)}</Badge></div></Link>)}</div> : <div className="grid justify-items-center gap-2 p-10 text-center"><div className="grid size-12 place-items-center rounded-full bg-muted"><Link2 className="size-5 text-muted-foreground" /></div><p className="font-semibold">Aún no tienes cobros</p><p className="max-w-sm text-sm text-muted-foreground">Crea tu primer link y compártelo para recibir un pago.</p></div>}</Card>
      {linksQuery.data?.nextCursor && <Button variant="outline" className="justify-self-center" onClick={() => setCursor(linksQuery.data?.nextCursor ?? null)}>Cargar más links</Button>}
    </section>
    <ConfirmDialog open={review} onOpenChange={setReview} title="Confirma el cobro" description="Se creará un link de un solo uso que vence en 24 horas." confirmLabel="Crear link" onConfirm={confirm} busy={busy} />
  </div>;
}
