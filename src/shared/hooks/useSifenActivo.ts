"use client";

import useSWR from "swr";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

/** Si la empresa emite factura electrónica (SIFEN). Mientras carga, `false`. */
export function useSifenActivo(): boolean {
  const { data } = useSWR<boolean>(
    "ventas:sifen-activo",
    async () => {
      const res = await fetchWithSupabaseSession("/api/ventas/sifen-activo", { cache: "no-store" });
      const j = (await res.json().catch(() => ({}))) as { data?: { activo?: boolean } };
      return j.data?.activo === true;
    },
    { revalidateOnFocus: false, dedupingInterval: 10 * 60_000 }
  );
  return data === true;
}
