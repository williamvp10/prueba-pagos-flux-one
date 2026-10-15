"use client";
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import type { ReactNode } from "react";
export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, onConfirm, busy }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; description: string; confirmLabel: string; onConfirm: () => void; busy?: boolean }) {
  return <AlertDialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
    <AlertDialogPrimitive.Portal>
      <AlertDialogPrimitive.Overlay className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-sm" />
      <AlertDialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border bg-card p-6 shadow-xl focus:outline-none">
        <AlertDialogPrimitive.Title className="text-lg font-semibold">{title}</AlertDialogPrimitive.Title>
        <AlertDialogPrimitive.Description className="mt-2 text-sm leading-6 text-muted-foreground">{description}</AlertDialogPrimitive.Description>
        <div className="mt-6 flex justify-end gap-3">
          <AlertDialogPrimitive.Cancel disabled={busy} className="min-h-11 rounded-lg border px-4 text-sm font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">Cancelar</AlertDialogPrimitive.Cancel>
          <AlertDialogPrimitive.Action disabled={busy} className="min-h-11 rounded-lg bg-destructive px-4 text-sm font-semibold text-white hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50" onClick={(event) => { event.preventDefault(); onConfirm(); }}>{busy ? "Procesando…" : confirmLabel}</AlertDialogPrimitive.Action>
        </div>
      </AlertDialogPrimitive.Content>
    </AlertDialogPrimitive.Portal>
  </AlertDialogPrimitive.Root>;
}
export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  const id = label.toLowerCase().replaceAll(" ", "-");
  return <div className="grid gap-2"><label className="grid gap-2 text-sm font-medium">{label}{children}</label>{error ? <p id={id + "-error"} role="alert" className="text-sm text-destructive">{error}</p> : hint ? <p id={id + "-hint"} className="text-xs text-muted-foreground">{hint}</p> : null}</div>;
}
