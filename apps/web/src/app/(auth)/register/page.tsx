"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, UserRoundPlus } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError, type User } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/alert-dialog";
const schema = z.object({ email: z.email("Escribe un correo válido."), password: z.string().min(12, "Usa al menos 12 caracteres.").max(128, "La contraseña admite máximo 128 caracteres.") });
type Form = z.infer<typeof schema>;
export default function RegisterPage() {
  const router = useRouter(); const [busy, setBusy] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm<Form>({ resolver: zodResolver(schema) });
  const submit = handleSubmit(async (values) => {
    setBusy(true);
    try { await api<User>("/auth/register", { method: "POST", body: JSON.stringify(values) }); toast.success("Cuenta creada", { description: "Ahora inicia sesión para continuar." }); router.replace("/login"); }
    catch (error) {
      const limited = error instanceof ApiError && error.status === 429;
      const duplicate = error instanceof ApiError && error.status === 409;
      toast.error(limited ? "Demasiados intentos" : "No pudimos crear tu cuenta", { description: limited ? "Espera " + (error.retryAfter ?? "unos segundos") + " antes de volver a intentarlo." : duplicate ? "Este correo ya está registrado. Prueba iniciar sesión." : "Verifica tus datos e inténtalo nuevamente." });
    }
    finally { setBusy(false); }
  });
  return <Card><CardHeader className="pb-3"><div className="mb-3 grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary"><UserRoundPlus className="size-5" /></div><CardTitle className="text-2xl">Crea tu cuenta</CardTitle><p className="text-sm text-muted-foreground">Empieza a gestionar tus pagos en un solo lugar.</p></CardHeader><CardContent><form onSubmit={submit} className="grid gap-5">
    <Field label="Correo electrónico" error={errors.email?.message}><Input id="email" type="email" autoComplete="email" placeholder="tu@correo.com" aria-invalid={!!errors.email} aria-describedby={errors.email ? "correo-electrónico-error" : undefined} {...register("email")} /></Field>
    <Field label="Contraseña" hint="Mínimo 12 caracteres." error={errors.password?.message}><Input id="password" type="password" autoComplete="new-password" aria-invalid={!!errors.password} aria-describedby={errors.password ? "contraseña-error" : undefined} {...register("password")} /></Field>
    <Button type="submit" size="lg" disabled={busy}>{busy ? "Creando cuenta…" : "Crear cuenta"}<ArrowRight className="size-4" /></Button>
    <p className="text-center text-sm text-muted-foreground">¿Ya tienes cuenta? <Link href="/login" className="font-semibold text-primary underline-offset-4 hover:underline">Inicia sesión</Link></p>
  </form></CardContent></Card>;
}
