"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowLeft, ArrowRight, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import type { BrowserComponents } from "@fluxone/api-client";
import { api, ApiError, type Account, type Beneficiary, type Transfer } from "@/lib/api";
import { amountToCanonical, formatCop } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/alert-dialog";
import { StatusBadge } from "@/components/ui/badge";

type Payload = BrowserComponents["schemas"]["CreateTransfer"];
type Intent = { key: string; payload: Payload; transferId?: string };
const storageKey = "fluxone:transfer-intent:v1";
const storedSchema = z.object({ key: z.string().uuid(), payload: z.object({ sourceAccountId: z.string().uuid(), destination: z.object({ kind: z.enum(["INTERNAL", "EXTERNAL"]), code: z.string() }), amount: z.string(), currency: z.literal("COP") }), transferId: z.string().uuid().optional() });
export function NewTransferForm({ accounts, beneficiaries }: { accounts: Account[]; beneficiaries: Beneficiary[] }) {
  const router = useRouter();
  const [source, setSource] = useState(accounts[0]?.id ?? "");
  const [destinationCode, setDestinationCode] = useState("");
  const [amount, setAmount] = useState("");
  const [intent, setIntent] = useState<Intent | null>(null);
  const intentRef = useRef<Intent | null>(null);
  const sendingRef = useRef(false);
  const [review, setReview] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  useEffect(() => {
    const stored = sessionStorage.getItem(storageKey);
    if (!stored) return;
    try {
      const parsed = storedSchema.parse(JSON.parse(stored));
      intentRef.current = parsed;
      setIntent(parsed);
      if (parsed.transferId) router.replace(`/transfers/${parsed.transferId}`);
      else { setSource(parsed.payload.sourceAccountId); setDestinationCode(parsed.payload.destination.code); setAmount(parsed.payload.amount); setFailure("Hay una transferencia cuyo resultado aún no confirmamos. Reintenta con la misma intención."); }
    } catch { sessionStorage.removeItem(storageKey); }
  }, [router]);
  const account = accounts.find((item) => item.id === source);
  const destination = beneficiaries.find((item) => item.code === destinationCode);
  const canonicalAmount = amountToCanonical(amount);
  const valid = Boolean(account && destination && canonicalAmount && BigInt(canonicalAmount.replace(".", "")) <= BigInt(account.available.replace(".", "")));
  const makePayload = (): Payload => ({ sourceAccountId: source, destination: { kind: destination!.kind, code: destination!.code }, amount: canonicalAmount!, currency: "COP" });
  const submit = async (current: Intent) => {
    if (sendingRef.current) return;
    sendingRef.current = true;
    setBusy(true); setFailure("");
    try {
      const result = await api<Transfer>("/transfers", { method: "POST", headers: { "Idempotency-Key": current.key }, body: JSON.stringify(current.payload) });
      const withId = { ...current, transferId: result.id };
      intentRef.current = withId;
      sessionStorage.setItem(storageKey, JSON.stringify(withId));
      try {
        const live = await api<Transfer>(`/transfers/${result.id}`);
        router.push(`/transfers/${live.id}`);
      } catch { router.push(`/transfers/${result.id}`); }
    } catch (error) {
      if (error instanceof ApiError && [400, 404, 409, 422].includes(error.status)) {
        sessionStorage.removeItem(storageKey); intentRef.current = null; setIntent(null);
        setFailure(error.message); toast.error("No se pudo crear la transferencia", { description: error.message });
      } else {
        intentRef.current = current; sessionStorage.setItem(storageKey, JSON.stringify(current)); setIntent(current);
        setFailure("El servicio no confirmó el resultado. Conservamos los datos y la misma clave para que puedas reintentar.");
      }
    } finally { sendingRef.current = false; setBusy(false); }
  };
  const startReview = () => { setAttempted(true); if (!valid) return; setReview(true); };
  const confirm = () => {
    const next = intentRef.current ?? { key: crypto.randomUUID(), payload: makePayload() };
    intentRef.current = next;
    sessionStorage.setItem(storageKey, JSON.stringify(next)); setIntent(next); setReview(false); void submit(next);
  };
  return <>
    <Card><CardHeader><CardTitle>Datos de envío</CardTitle><p className="text-sm text-muted-foreground">El disponible refleja el saldo menos los montos reservados.</p></CardHeader><CardContent>
      <div className="grid gap-5">
        <Field label="Cuenta de origen"><select className="h-11 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60" value={source} disabled={Boolean(intent)} onChange={(event) => setSource(event.target.value)}><option value="">Selecciona una cuenta</option>{accounts.map((item) => <option key={item.id} value={item.id}>{item.code} · disponible {formatCop(item.available)}</option>)}</select></Field>
        <Field label="Destino"><select className="h-11 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60" value={destinationCode} disabled={Boolean(intent)} onChange={(event) => setDestinationCode(event.target.value)}><option value="">Selecciona un destino</option>{beneficiaries.map((item) => <option key={item.code} value={item.code}>{item.label} · {item.code}{item.kind === "EXTERNAL" ? " · otro banco" : ""}</option>)}</select></Field>
        <Field label="Monto en COP" hint="Usa coma o punto para los centavos; máximo $ 999.999.999.999,99."><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span><Input className="pl-8" inputMode="decimal" placeholder="0,00" value={amount} disabled={Boolean(intent)} onChange={(event) => setAmount(event.target.value)} aria-describedby="monto-en-cop-hint" /></div></Field>
        {attempted && !canonicalAmount && <p id="amount-error" role="alert" className="-mt-3 text-sm text-destructive">Ingresa un monto mayor que cero con máximo dos decimales.</p>}{canonicalAmount && account && BigInt(canonicalAmount.replace(".", "")) > BigInt(account.available.replace(".", "")) && <p id="amount-error" role="alert" className="-mt-3 text-sm text-destructive">El monto supera el saldo disponible de esta cuenta.</p>}{attempted && !destination && <p role="alert" className="-mt-3 text-sm text-destructive">Selecciona un destino para continuar.</p>}{attempted && !account && <p role="alert" className="-mt-3 text-sm text-destructive">Selecciona una cuenta de origen.</p>}
        {failure && <div role="alert" className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-200">{failure}</div>}
        {intent && !intent.transferId ? <div className="flex flex-wrap gap-3"><Button onClick={() => void submit(intent)} disabled={busy}>{busy ? "Consultando resultado…" : "Reintentar con la misma clave"}</Button><span className="self-center text-xs text-muted-foreground">La clave de esta intención se conserva.</span></div> : <Button onClick={startReview} disabled={busy}>{busy ? "Enviando…" : "Revisar transferencia"}<ArrowRight className="size-4" /></Button>}
        <Link href="/accounts" className="inline-flex w-fit items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Volver al resumen</Link>
      </div>
    </CardContent></Card>
    <div className="flex items-start gap-3 rounded-xl border bg-muted/40 p-4 text-sm"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" /><p className="text-muted-foreground">Confirmamos cada transferencia con el servicio bancario. Si el resultado tarda, podrás consultar el estado sin volver a generar la operación.</p></div>
    <Dialog.Root open={review} onOpenChange={setReview}><Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-sm" /><Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border bg-card shadow-xl focus:outline-none"><Card className="border-0 shadow-none"><CardHeader><Dialog.Title className="text-lg font-semibold">Confirma los datos</Dialog.Title><Dialog.Description className="text-sm text-muted-foreground">Verifica el destino y el monto antes de enviar.</Dialog.Description></CardHeader><CardContent><dl className="grid gap-4 text-sm"><div><dt className="text-muted-foreground">Desde</dt><dd className="mt-1 font-medium">{account?.code}</dd></div><div><dt className="text-muted-foreground">Hacia</dt><dd className="mt-1 font-medium">{destination?.label} · {destination?.code}</dd></div><div><dt className="text-muted-foreground">Monto</dt><dd className="mt-1 text-xl font-semibold">{canonicalAmount ? formatCop(canonicalAmount) : "—"}</dd></div></dl><div className="mt-6 flex justify-end gap-3"><Button variant="outline" onClick={() => setReview(false)}>Editar</Button><Button onClick={confirm} disabled={busy}>Confirmar y enviar</Button></div></CardContent></Card></Dialog.Content></Dialog.Portal></Dialog.Root>
  </>;
}
