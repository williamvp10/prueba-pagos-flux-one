"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, LockKeyhole, RefreshCw, ShieldCheck } from "lucide-react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { api, ApiError, type Account, type PaymentLinkCheckout, type PaymentLinkPayment, type User } from "@/lib/api";
import { cleanPaymentFragment, paymentLinkErrorMessage, paymentLinkPayIntentStorageKey, parseStoredIntent, tokenFromFragment, type LinkIntent } from "@/lib/payment-links";
import { formatCop } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, ConfirmDialog } from "@/components/ui/alert-dialog";

const loginSchema = z.object({ email: z.email("Escribe un correo válido."), password: z.string().min(1, "Ingresa tu contraseña.") });
type LoginForm = z.infer<typeof loginSchema>;
type PayPayload = { linkId: string; sourceAccountId: string };
function isPayPayload(value: unknown): value is PayPayload { return !!value && typeof value === "object" && typeof (value as PayPayload).linkId === "string" && typeof (value as PayPayload).sourceAccountId === "string"; }

export default function PayPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [token, setToken] = useState<string | null>(null);
  const [fragmentRead, setFragmentRead] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [source, setSource] = useState("");
  const [review, setReview] = useState(false);
  const [intent, setIntent] = useState<LinkIntent<PayPayload> | null>(null);
  const [failure, setFailure] = useState("");
  const [bootstrapFailed, setBootstrapFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState("");
  const intentRef = useRef<LinkIntent<PayPayload> | null>(null);
  const sendingRef = useRef(false);
  const storageKey = paymentLinkPayIntentStorageKey;
  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });

  useEffect(() => {
    const nextToken = tokenFromFragment(window.location.hash);
    window.history.replaceState(window.history.state, "", cleanPaymentFragment(window.location.pathname, window.location.search));
    setToken(nextToken);
    setFragmentRead(true);
    void api<User>("/auth/me", undefined, { redirectOnUnauthorized: false }).then(() => setAuthenticated(true)).catch(() => setAuthenticated(false)).finally(() => setSessionChecked(true));
  }, []);

  const resolveQuery = useQuery({ queryKey: ["payment-link-checkout", token], queryFn: () => api<PaymentLinkCheckout>("/payment-links/resolve", { method: "POST", body: JSON.stringify({ token }) }, { redirectOnUnauthorized: false }), enabled: Boolean(token && authenticated), retry: false });
  const accountsQuery = useQuery({ queryKey: ["accounts"], queryFn: () => api<Account[]>("/accounts", undefined, { redirectOnUnauthorized: false }), enabled: Boolean(authenticated), retry: false });
  const account = accountsQuery.data?.find((item) => item.id === source);

  useEffect(() => {
    if (!authenticated || accountsQuery.isPending) return;
    const restored = parseStoredIntent(sessionStorage.getItem(storageKey), isPayPayload);
    if (restored && token && resolveQuery.data?.linkId === restored.payload.linkId) {
      intentRef.current = restored; setIntent(restored); setSource(restored.payload.sourceAccountId);
      setFailure("Hay un pago cuyo resultado aún no confirmamos. Reintenta con la misma clave.");
    } else if (restored && resolveQuery.data) sessionStorage.removeItem(storageKey);
  }, [authenticated, accountsQuery.isPending, storageKey, token, resolveQuery.data?.linkId]);

  const bootstrap = async () => {
    setBootstrapFailed(false);
    try { await api<Account>("/accounts/bootstrap", { method: "POST" }, { redirectOnUnauthorized: false }); await queryClient.invalidateQueries({ queryKey: ["accounts"] }); await accountsQuery.refetch(); }
    catch { setBootstrapFailed(true); }
  };
  const submitLogin = handleSubmit(async (values) => {
    setLoginBusy(true); setLoginError("");
    try {
      await api<{ user: User; expiresIn: number }>("/auth/login", { method: "POST", body: JSON.stringify(values) }, { redirectOnUnauthorized: false });
      setAuthenticated(true); await bootstrap();
    } catch { setLoginError("No pudimos iniciar sesión. Revisa tus datos e inténtalo de nuevo."); }
    finally { setLoginBusy(false); }
  });

  const pay = async (current: LinkIntent<PayPayload>) => {
    if (sendingRef.current || !token) return;
    sendingRef.current = true; setBusy(true); setFailure("");
    try {
      const result = await api<PaymentLinkPayment>("/payment-links/pay", { method: "POST", headers: { "Idempotency-Key": current.key }, body: JSON.stringify({ token, sourceAccountId: current.payload.sourceAccountId }) }, { redirectOnUnauthorized: false });
      sessionStorage.removeItem(storageKey); intentRef.current = null; setIntent(null);
      await queryClient.invalidateQueries({ queryKey: ["accounts"] });
      await queryClient.invalidateQueries({ queryKey: ["payment-links"] });
      router.push(`/transfers/${result.transfer.id}`);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) { setAuthenticated(false); setFailure("Tu sesión venció. Inicia sesión para continuar; conservamos esta intención en esta pestaña."); }
      else if (error instanceof ApiError && error.status === 404) { sessionStorage.removeItem(storageKey); intentRef.current = null; setIntent(null); setFailure("Este link no está disponible. Verifica la invitación o pide un link nuevo."); }
      else if (error instanceof ApiError && [400, 409, 422].includes(error.status)) { sessionStorage.removeItem(storageKey); intentRef.current = null; setIntent(null); setFailure(paymentLinkErrorMessage(error.code)); }
      else { intentRef.current = current; setIntent(current); sessionStorage.setItem(storageKey, JSON.stringify(current)); setFailure("El servicio no confirmó el pago. Puedes reintentar con la misma clave; aún no se confirmó ningún éxito."); }
    } finally { sendingRef.current = false; setBusy(false); }
  };
  const confirmPay = () => {
    if (!source || !resolveQuery.data) return;
    const payload = { linkId: resolveQuery.data.linkId, sourceAccountId: source };
    const current = intentRef.current?.payload.linkId === payload.linkId && intentRef.current?.payload.sourceAccountId === payload.sourceAccountId ? intentRef.current : { key: crypto.randomUUID(), payload };
    intentRef.current = current; setIntent(current); sessionStorage.setItem(storageKey, JSON.stringify(current)); setReview(false); void pay(current);
  };
  const definitiveFailure = failure && !intent;

  return <main id="main-content" className="mx-auto grid min-h-screen w-full max-w-2xl content-center gap-5 px-4 py-8 sm:px-8">
    <Link href="/" className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground"><ShieldCheck className="size-5" /></span><span className="font-semibold tracking-tight">Flux One</span></Link>
    {!fragmentRead || !sessionChecked ? <Card><CardContent aria-live="polite" className="grid min-h-64 place-items-center text-sm text-muted-foreground">Preparando link de pago…</CardContent></Card>
      : !token ? <Card><CardContent className="grid min-h-64 content-center justify-items-center gap-3 p-8 text-center"><div className="grid size-12 place-items-center rounded-full bg-muted"><LockKeyhole className="size-5 text-muted-foreground" /></div><h1 className="text-xl font-semibold">Vuelve a abrir o escanear el QR</h1><p className="max-w-sm text-sm text-muted-foreground">Por seguridad, el link no se guarda al recargar esta página. Usa de nuevo la invitación que recibiste.</p></CardContent></Card>
      : !authenticated ? <Card><CardHeader><CardTitle className="text-xl">Inicia sesión para continuar</CardTitle><p className="text-sm text-muted-foreground">Conservamos la invitación solo en esta página.</p></CardHeader><CardContent><form onSubmit={submitLogin} className="grid gap-5"><Field label="Correo electrónico" error={errors.email?.message}><Input type="email" autoComplete="email" aria-invalid={!!errors.email} {...register("email")} /></Field><Field label="Contraseña" error={errors.password?.message}><Input type="password" autoComplete="current-password" aria-invalid={!!errors.password} {...register("password")} /></Field>{loginError && <p role="alert" className="text-sm text-destructive">{loginError}</p>}<Button type="submit" size="lg" disabled={loginBusy}>{loginBusy ? "Ingresando…" : "Iniciar sesión"}<ArrowRight className="size-4" /></Button><p className="text-center text-sm text-muted-foreground">¿No tienes cuenta? <Link className="font-semibold text-primary underline" href="/register" target="_blank" rel="noreferrer">Regístrate en otra pestaña</Link></p></form></CardContent></Card>
      : resolveQuery.isPending ? <Card><CardContent aria-live="polite" className="grid min-h-64 place-items-center text-sm text-muted-foreground">Consultando el link de pago…</CardContent></Card>
      : resolveQuery.isError ? <Card><CardContent className="grid min-h-64 content-center justify-items-center gap-3 p-8 text-center"><h1 className="text-xl font-semibold">Este link no está disponible</h1><p role="alert" className="max-w-sm text-sm text-muted-foreground">No pudimos validar la invitación. Verifica el QR o solicita un link nuevo.</p><Button variant="outline" onClick={() => void resolveQuery.refetch()}><RefreshCw className="size-4" />Reintentar</Button></CardContent></Card>
      : resolveQuery.data && <>
        <Card><CardHeader><CardTitle className="text-xl">Confirma el pago</CardTitle><p className="text-sm text-muted-foreground">Revisa el monto y la cuenta receptora antes de continuar.</p></CardHeader><CardContent><dl className="grid gap-4 sm:grid-cols-2"><div><dt className="text-sm text-muted-foreground">Monto en COP</dt><dd className="mt-1 text-2xl font-semibold">{formatCop(resolveQuery.data.amount)}</dd></div><div><dt className="text-sm text-muted-foreground">Recibe</dt><dd className="mt-1 font-medium">{resolveQuery.data.destination.code} · {resolveQuery.data.destination.label}</dd></div><div className="sm:col-span-2"><dt className="text-sm text-muted-foreground">Vence</dt><dd className="mt-1 font-medium">{new Date(resolveQuery.data.expiresAt).toLocaleString("es-CO", { timeZone: "America/Bogota" })}</dd></div></dl>
          {bootstrapFailed && <div className="mt-5 grid gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm" role="alert"><p>No pudimos preparar tus cuentas. Tu sesión sigue activa; puedes reintentar.</p><Button variant="outline" onClick={() => void bootstrap()}>Reintentar preparación</Button></div>}
          {failure && <p role="alert" className="mt-5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">{failure}</p>}
          {accountsQuery.isError ? <div role="alert" className="mt-5 grid gap-2 text-sm"><p>No pudimos cargar tus cuentas.</p><Button variant="outline" onClick={() => void accountsQuery.refetch()}>Reintentar lectura</Button></div> : <div className="mt-6 grid gap-5"><Field label="Pagar desde"><select className="h-11 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60" value={source} disabled={Boolean(intent)} onChange={(event) => setSource(event.target.value)}><option value="">Selecciona tu cuenta</option>{(accountsQuery.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.code} · disponible {formatCop(item.available)}</option>)}</select></Field>{!accountsQuery.isPending && !accountsQuery.data?.length && <p role="status" className="text-sm text-muted-foreground">No encontramos una cuenta propia. Reintenta preparar tu cuenta o vuelve al portal.</p>}{intent ? <Button size="lg" disabled={busy} onClick={() => void pay(intent)}><RefreshCw className="size-4" />{busy ? "Consultando resultado…" : "Reintentar con la misma clave"}</Button> : <Button size="lg" disabled={!source || accountsQuery.isPending || bootstrapFailed} onClick={() => setReview(true)}>Revisar pago<ArrowRight className="size-4" /></Button>}</div>}
        </CardContent></Card>
        <p className="flex items-start gap-2 text-xs text-muted-foreground"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />Flux One confirma el resultado con el servicio. No cierres esta página si la conexión se interrumpe.</p>
        <ConfirmDialog open={review} onOpenChange={setReview} title="Confirma el pago" description={`Pagarás ${formatCop(resolveQuery.data.amount)} desde ${account?.code ?? "tu cuenta"} a ${resolveQuery.data.destination.code} · ${resolveQuery.data.destination.label}.`} confirmLabel="Pagar ahora" onConfirm={confirmPay} busy={busy} />
        {definitiveFailure && <div aria-live="polite" className="sr-only">{failure}</div>}
      </>}
  </main>;
}
