"use client";

import useSWR from "swr";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

export type Funcionario = {
  id: string;
  nombre: string;
  apellido: string | null;
  ci: string | null;
  cargo: string | null;
  telefono: string | null;
  fecha_ingreso: string | null;
  salario_base: number;
  aporta_ips: boolean;
  estado: "activo" | "inactivo";
  observaciones: string | null;
};

export type TipoPago = "salario" | "ips";

export type Pago = {
  id: string;
  funcionario_id: string;
  funcionario_nombre: string;
  periodo: string;
  monto: number;
  fecha_pago: string | null;
  estado: "pendiente" | "pagado";
  observaciones: string | null;
  salario_imponible?: number;
  aporte_obrero?: number;
  aporte_patronal?: number;
  fecha_vencimiento?: string | null;
};

/** Llama a la API de RRHH y devuelve `data`, o tira el mensaje de error del servidor. */
export async function rrhhApi<T>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetchWithSupabaseSession(url, {
    method: init?.method ?? "GET",
    headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const j = (await res.json().catch(() => ({}))) as { data?: T; error?: string };
  if (!res.ok) throw new Error(j.error ?? `Error ${res.status}`);
  return j.data as T;
}

export function useFuncionarios() {
  const swr = useSWR<Funcionario[]>("rrhh:funcionarios", () => rrhhApi<Funcionario[]>("/api/rrhh/funcionarios"), {
    revalidateOnFocus: false,
    keepPreviousData: true,
  });
  return { funcionarios: swr.data ?? [], isLoading: swr.isLoading, error: swr.error as Error | undefined, mutate: swr.mutate };
}

export function usePagos(tipo: TipoPago, periodo: string, estado: string) {
  const qs = new URLSearchParams();
  if (periodo) qs.set("periodo", periodo);
  if (estado) qs.set("estado", estado);
  const url = `/api/rrhh/pagos/${tipo}?${qs}`;
  const swr = useSWR<Pago[]>(`rrhh:${url}`, () => rrhhApi<Pago[]>(url), { revalidateOnFocus: false, keepPreviousData: true });
  return { pagos: swr.data ?? [], isLoading: swr.isLoading, error: swr.error as Error | undefined, mutate: swr.mutate };
}

export const gs = (n: number) => `Gs. ${Math.round(n || 0).toLocaleString("es-PY")}`;

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

/** "2026-10" → "Octubre 2026". */
export function nombrePeriodo(p: string): string {
  const [a, m] = p.split("-").map(Number);
  return MESES[m - 1] ? `${MESES[m - 1]} ${a}` : p;
}

/** "2026-10-31" → "31/10/2026". */
export function fechaCorta(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

/** Mes actual en Asunción, "AAAA-MM". */
export function periodoActual(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Asuncion", year: "numeric", month: "2-digit" })
    .format(new Date())
    .slice(0, 7);
}

export function hoyIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Asuncion" }).format(new Date());
}

export const inputCls =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20";
