import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";
const states: Record<string, string> = {
  COMPLETED: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  FAILED: "border-destructive/30 bg-destructive/10 text-destructive",
  REVERSED: "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  PENDING: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  PROCESSING: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  UNKNOWN: "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300",
};
export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) { return <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold", className)} {...props} />; }
export function StatusBadge({ status }: { status: string }) { return <Badge className={states[status] ?? "border-border bg-muted text-muted-foreground"}>{statusLabel(status)}</Badge>; }
export function statusLabel(status: string) { return ({ COMPLETED: "Completada", FAILED: "Fallida", REVERSED: "Reversada", PENDING: "Pendiente", PROCESSING: "En proceso", UNKNOWN: "Por confirmar" } as Record<string,string>)[status] ?? status; }
