"use client";
import { useRouter } from "next/navigation";
const filters = [{ value: "ALL", label: "Todos" }, { value: "PENDING", label: "Pendientes" }, { value: "PROCESSING", label: "En proceso" }, { value: "UNKNOWN", label: "Por confirmar" }, { value: "COMPLETED", label: "Completados" }, { value: "FAILED", label: "Fallidos" }, { value: "REVERSED", label: "Reversados" }];
export function TransferFilters({ selected }: { selected: string }) {
  const router = useRouter();
  return <label className="grid gap-1 text-xs font-medium text-muted-foreground">Filtrar por estado<select className="h-10 rounded-lg border bg-card px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" value={selected} onChange={(event) => router.push(event.target.value === "ALL" ? "/transfers" : `/transfers?status=${event.target.value}`)}>{filters.map((filter) => <option key={filter.value} value={filter.value}>{filter.label}</option>)}</select></label>;
}
