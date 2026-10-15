"use client";
import Link from "next/link";
import { use, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import QRCode from "qrcode";
import { ArrowLeft, Check, Copy, Download, Link2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError, type PaymentLink } from "@/lib/api";
import { paymentLinkErrorMessage, paymentLinkUrl, type LinkIntent, parseStoredIntent } from "@/lib/payment-links";
import { formatCop } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/alert-dialog";

const tones: Record<string, string> = { ACTIVE: "border-primary/30 bg-primary/10 text-primary", PAID: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300", CANCELLED: "border-muted-foreground/30 bg-muted text-muted-foreground", EXPIRED: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300" };
type CancelPayload = { paymentLinkId: string };
const intentKey = (id: string) => `fluxone:payment-link-cancel:v1:${id}`;

export default function PaymentLinkDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const queryClient = useQueryClient();
  const linkQuery = useQuery({ queryKey: ["payment-link", id], queryFn: () => api<PaymentLink>(`/payment-links/${id}`) });
  const [token, setToken] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelIntent, setCancelIntent] = useState<LinkIntent<CancelPayload> | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const cancelRef = useRef(false);

  useEffect(() => {
    if (linkQuery.data?.status !== "ACTIVE") { setToken(null); setQr(null); return; }
    let cancelled = false;
    setToken(null); setQr(null);
    void api<{ token: string }>(`/payment-links/${id}/share-token`).then(async ({ token: next }) => {
      if (cancelled) return;
      const url = paymentLinkUrl(window.location.origin, next);
      const image = await QRCode.toDataURL(url, { width: 320, margin: 4, errorCorrectionLevel: "M", color: { dark: "#111827", light: "#ffffff" } });
      if (!cancelled) { setFailure(""); setToken(next); setQr(image); }
    }).catch(() => { if (!cancelled) setFailure("No pudimos preparar el link para compartir. Actualiza el estado e inténtalo nuevamente."); });
    return () => { cancelled = true; };
  }, [id, linkQuery.data?.status]);

  useEffect(() => {
    const restored = parseStoredIntent(sessionStorage.getItem(intentKey(id)), (value): value is CancelPayload => !!value && typeof value === "object" && (value as CancelPayload).paymentLinkId === id);
    if (restored) { setCancelIntent(restored); setFailure("Hay una cancelación cuyo resultado aún no confirmamos. Reintenta con la misma clave."); }
  }, [id]);

  const cancel = async () => {
    if (cancelRef.current || !cancelIntent) return;
    cancelRef.current = true; setBusy(true); setFailure("");
    try {
      await api<PaymentLink>(`/payment-links/${id}/cancel`, { method: "POST", headers: { "Idempotency-Key": cancelIntent.key } });
      sessionStorage.removeItem(intentKey(id)); setCancelIntent(null); setCancelOpen(false); setToken(null); setQr(null);
      await queryClient.invalidateQueries({ queryKey: ["payment-link", id] });
      await queryClient.invalidateQueries({ queryKey: ["payment-links"] });
    } catch (error) {
      if (error instanceof ApiError && [400, 404, 409, 422].includes(error.status)) {
        sessionStorage.removeItem(intentKey(id)); setCancelIntent(null); setFailure(paymentLinkErrorMessage(error.code));
        await queryClient.invalidateQueries({ queryKey: ["payment-link", id] });
      } else setFailure("No confirmamos la cancelación. Puedes reintentar usando la misma clave.");
    } finally { cancelRef.current = false; setBusy(false); }
  };
  const beginCancel = () => {
    const restored = parseStoredIntent(sessionStorage.getItem(intentKey(id)), (value): value is CancelPayload => !!value && typeof value === "object" && (value as CancelPayload).paymentLinkId === id);
    const current = restored ?? { key: crypto.randomUUID(), payload: { paymentLinkId: id } };
    setCancelIntent(current); sessionStorage.setItem(intentKey(id), JSON.stringify(current)); setCancelOpen(true);
  };
  const linkUrl = token ? paymentLinkUrl(typeof window === "undefined" ? "" : window.location.origin, token) : "";
  const copyLink = async () => { try { await navigator.clipboard.writeText(linkUrl); toast.success("Link copiado"); } catch { setFailure("No fue posible copiar automáticamente. Selecciona y copia el link manualmente."); } };
  const downloadQr = () => { if (!qr) return; const anchor = document.createElement("a"); anchor.href = qr; anchor.download = `flux-one-cobro-${id}.png`; anchor.click(); };

  if (linkQuery.isPending) return <div aria-live="polite" className="grid gap-5"><div className="h-8 w-56 animate-pulse rounded bg-muted" /><div className="h-[420px] rounded-2xl bg-muted" /></div>;
  if (linkQuery.isError) return <Card><CardContent className="grid justify-items-center gap-3 p-10 text-center"><p role="alert" className="font-semibold">No pudimos consultar este cobro</p><p className="text-sm text-muted-foreground">El link puede no estar disponible o no pertenecer a tu sesión.</p><Button variant="outline" onClick={() => void linkQuery.refetch()}>Reintentar lectura</Button><Link className="text-sm font-semibold text-primary underline" href="/payment-links">Volver a cobros</Link></CardContent></Card>;
  const link = linkQuery.data;
  return <div className="grid gap-6">
    <Link href="/payment-links" className="inline-flex min-h-11 w-fit items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Volver a cobros</Link>
    <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm font-medium text-primary">Detalle del cobro</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">{formatCop(link.amount)}</h1><p className="mt-2 text-sm text-muted-foreground">{link.destination.code} · {link.destination.label}</p></div><Badge className={tones[link.status]}>{({ ACTIVE: "Activo", PAID: "Pagado", CANCELLED: "Cancelado", EXPIRED: "Vencido" } as Record<string,string>)[link.status]}</Badge></div>
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,420px)]">
      <Card><CardHeader><CardTitle>Información</CardTitle></CardHeader><CardContent><dl className="grid gap-4 text-sm sm:grid-cols-2"><div><dt className="text-muted-foreground">Monto en COP</dt><dd className="mt-1 text-xl font-semibold">{formatCop(link.amount)}</dd></div><div><dt className="text-muted-foreground">Cuenta receptora</dt><dd className="mt-1 font-medium">{link.destination.code} · {link.destination.label}</dd></div><div><dt className="text-muted-foreground">Creado</dt><dd className="mt-1 font-medium">{new Date(link.createdAt).toLocaleString("es-CO", { timeZone: "America/Bogota" })}</dd></div><div><dt className="text-muted-foreground">Vence</dt><dd className="mt-1 font-medium">{new Date(link.expiresAt).toLocaleString("es-CO", { timeZone: "America/Bogota" })}</dd></div></dl>
        {failure && <p role="alert" className="mt-5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">{failure}</p>}
        {link.status === "ACTIVE" && <div className="mt-6 flex flex-wrap gap-3">{cancelIntent ? <Button variant="destructive" onClick={() => setCancelOpen(true)} disabled={busy}><RefreshCw className="size-4" />{busy ? "Consultando…" : "Reintentar cancelación"}</Button> : <Button variant="destructive" onClick={beginCancel}>Cancelar link</Button>}</div>}
      </CardContent></Card>
      {link.status === "ACTIVE" ? <Card><CardHeader><CardTitle>Comparte el QR o link</CardTitle><p className="text-sm text-muted-foreground">Quien tenga esta invitación podrá ver el monto y pagar mientras esté activa.</p></CardHeader><CardContent><div className="grid justify-items-center gap-4">
        <div className="grid aspect-square w-full max-w-[320px] place-items-center rounded-xl border bg-white p-4" aria-live="polite">{qr ? <img src={qr} alt="Código QR que abre este link de pago" className="size-full object-contain" /> : <div className="grid size-full place-items-center rounded-lg bg-slate-50 text-center text-sm text-slate-500">Preparando código QR…</div>}</div>
        <div className="grid w-full gap-3 sm:grid-cols-2"><Button variant="outline" onClick={() => void copyLink()} disabled={!token}><Copy className="size-4" />Copiar link</Button><Button variant="outline" onClick={downloadQr} disabled={!qr}><Download className="size-4" />Descargar PNG</Button></div>
        <label className="grid w-full gap-2 text-xs font-medium text-muted-foreground">Link compartible<input readOnly value={linkUrl} className="h-11 min-w-0 rounded-lg border bg-muted px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onFocus={(event) => event.currentTarget.select()} /></label>
      </div></CardContent></Card> : <Card><CardContent className="grid min-h-[300px] content-center justify-items-center gap-3 p-8 text-center"><div className="grid size-12 place-items-center rounded-full bg-muted"><Check className="size-5 text-muted-foreground" /></div><p className="font-semibold">Este link ya no está disponible para compartir</p><p className="text-sm text-muted-foreground">El estado y la transferencia se actualizan desde el servicio.</p>{link.paidTransferId && <Link href={`/transfers/${link.paidTransferId}`} className="inline-flex min-h-11 items-center gap-2 font-semibold text-primary underline"><Link2 className="size-4" />Ver transferencia</Link>}</CardContent></Card>}
    </div>
    <ConfirmDialog open={cancelOpen} onOpenChange={setCancelOpen} title="¿Cancelar este link?" description="Las personas que tengan el QR ya no podrán usarlo para pagar." confirmLabel="Cancelar link" onConfirm={() => void cancel()} busy={busy} />
  </div>;
}
