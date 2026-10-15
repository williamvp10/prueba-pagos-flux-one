"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError, type Account, type User } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/alert-dialog";
const schema = z.object({ email: z.email("Escribe un correo válido."), password: z.string().min(1, "Ingresa tu contraseña.") });
type Form = z.infer<typeof schema>;
export default function LoginPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm<Form>({ resolver: zodResolver(schema) });
  const submit = handleSubmit(async (values) => {
    setBusy(true);
    try {
      await api<{ user: User; expiresIn: number }>("/auth/login", { method: "POST", body: JSON.stringify(values) });
      try { await api<Account>("/accounts/bootstrap", { method: "POST" }); }
      catch { toast.message("Sesión iniciada", { description: "No pudimos preparar tu cuenta. Podrás reintentarlo desde el resumen." }); }
      router.replace("/accounts"); router.refresh();
    } catch (error) {
      const limited = error instanceof ApiError && error.status === 429;
      toast.error(limited ? "Demasiados intentos" : "No pudimos iniciar sesión", { description: limited ? "Espera " + (error.retryAfter ?? "unos segundos") + " antes de volver a intentarlo." : "Revisa tu correo y contraseña e inténtalo de nuevo." });
    }
    finally { setBusy(false); }
  });
  return <Card><CardHeader className="pb-3"><div className="mb-3 grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary"><LockKeyhole className="size-5" /></div><CardTitle className="text-2xl">Bienvenido de nuevo</CardTitle><p className="text-sm text-muted-foreground">Ingresa a tu portal de pagos.</p></CardHeader><CardContent><form onSubmit={submit} className="grid gap-5">
    <Field label="Correo electrónico" error={errors.email?.message}><Input id="email" type="email" autoComplete="email" placeholder="tu@correo.com" aria-invalid={!!errors.email} aria-describedby={errors.email ? "correo-electrónico-error" : undefined} {...register("email")} /></Field>
    <Field label="Contraseña" error={errors.password?.message}><Input id="password" type="password" autoComplete="current-password" aria-invalid={!!errors.password} aria-describedby={errors.password ? "contraseña-error" : undefined} {...register("password")} /></Field>
    <Button type="submit" size="lg" disabled={busy}>{busy ? "Ingresando…" : "Iniciar sesión"}<ArrowRight className="size-4" /></Button>
    <p className="text-center text-sm text-muted-foreground">¿No tienes una cuenta? <Link href="/register" className="font-semibold text-primary underline-offset-4 hover:underline">Regístrate</Link></p>
  </form></CardContent></Card>;
}
