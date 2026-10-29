import { NextRequest } from "next/server";
import { getTenantSupabaseFromAuthWithRol } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { esRolAdminEmpresa } from "@/lib/modulos/resolve-effective-modules";
import { buildXlsxBuffer, xlsxResponseHeaders, nowStamp } from "@/lib/excel/export";
import { filtrosCierres, listarCierresCaja } from "@/lib/reportes/cierres-caja-pg";
import type { CierreCaja } from "@/lib/reportes/cierres-caja";

export const runtime = "nodejs";

/** GET /api/reportes/cierres-caja/export — el reporte de cierres en Excel. */
export async function GET(request: NextRequest) {
  const ctx = await getTenantSupabaseFromAuthWithRol(request);
  if (!ctx) return new Response("No autorizado", { status: 401 });
  if (!esRolAdminEmpresa(ctx.auth.rol)) return new Response("Solo un administrador.", { status: 403 });
  try {
    const schema = await fetchDataSchemaForEmpresaId(ctx.auth.empresa_id);
    const rows = await listarCierresCaja(schema, ctx.auth.empresa_id, filtrosCierres(request));
    const fecha = (s: string | null) => (s ? new Date(s) : "");
    const buf = buildXlsxBuffer(
      rows,
      [
        { header: "APERTURA", value: (r: CierreCaja) => fecha(r.fecha_apertura), width: 18 },
        { header: "CIERRE", value: (r: CierreCaja) => fecha(r.fecha_cierre), width: 18 },
        { header: "CAJA", value: (r: CierreCaja) => r.numero_caja, width: 8 },
        { header: "RESPONSABLE", value: (r: CierreCaja) => r.responsable ?? "", width: 26 },
        { header: "ESTADO", value: (r: CierreCaja) => r.estado.toUpperCase(), width: 10 },
        { header: "APERTURA_GS", value: (r: CierreCaja) => r.apertura, width: 14 },
        { header: "EFECTIVO", value: (r: CierreCaja) => r.efectivo, width: 14 },
        { header: "TRANSFERENCIA", value: (r: CierreCaja) => r.transferencia, width: 14 },
        { header: "CHEQUE", value: (r: CierreCaja) => r.cheque, width: 12 },
        { header: "CONTADO", value: (r: CierreCaja) => r.contado, width: 14 },
        { header: "CREDITO", value: (r: CierreCaja) => r.credito, width: 14 },
        { header: "TOTAL_VENTAS", value: (r: CierreCaja) => r.total_ventas, width: 14 },
        { header: "COBRANZAS", value: (r: CierreCaja) => r.cobranzas, width: 14 },
        { header: "OTROS_INGRESOS", value: (r: CierreCaja) => r.otros_ingresos, width: 14 },
        { header: "EGRESOS", value: (r: CierreCaja) => r.egresos, width: 14 },
        { header: "EFECTIVO_ESPERADO", value: (r: CierreCaja) => r.esperado, width: 16 },
        { header: "CONTADO_AL_CERRAR", value: (r: CierreCaja) => (r.contado_cierre === null ? "" : r.contado_cierre), width: 16 },
        { header: "DIFERENCIA", value: (r: CierreCaja) => (r.diferencia === null ? "" : r.diferencia), width: 14 },
        { header: "PLANILLA", value: (r: CierreCaja) => r.planilla_estado ?? "sin planilla", width: 12 },
        { header: "DIF_PLANILLA", value: (r: CierreCaja) => (r.planilla_diferencia === null ? "" : r.planilla_diferencia), width: 14 },
      ],
      { sheetName: "Cierres de caja" }
    );
    return new Response(new Uint8Array(buf), { status: 200, headers: xlsxResponseHeaders(`cierres-caja-${nowStamp()}`) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[/api/reportes/cierres-caja/export]", msg);
    return new Response(msg || "No se pudo generar el Excel", { status: 500 });
  }
}
