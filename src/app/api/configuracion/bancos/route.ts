import { NextResponse } from "next/server";
import { esRolAdminEmpresaOGlobal } from "@/lib/auth/rol-empresa";
import { errorResponse, successResponse } from "@/lib/api/response";
import { getChatServiceClientForEmpresa } from "@/lib/supabase/chat-service-role-empresa";
import { requireTenantUserApiAccess } from "@/lib/contabilidad/contabilidad-auth";

export const runtime = "nodejs";

/** Normaliza el nombre para el control de duplicados (mayúsculas + espacios colapsados). */
function normNombre(s: string): string {
  return String(s ?? "").toUpperCase().replace(/\s+/g, " ").trim();
}

/** Entidades que pueden ser origen de un cobro por transferencia. */
export const TIPOS = ["banco", "billetera", "financiera", "cooperativa"];

/** El 23505 puede venir del nombre o del código: hay que decir cuál. */
export function mensajeDuplicado(error: { message?: string; details?: string }): string {
  const texto = `${error.message ?? ""} ${error.details ?? ""}`;
  return texto.includes("codigo")
    ? "Ya existe una entidad con ese código"
    : "Ya existe una entidad con ese nombre";
}

/**
 * Datos de la cuenta propia (a dónde transferir). Solo se guardan si la fila
 * está marcada como cuenta de la empresa; si no, no tienen sentido.
 */
export function camposDeCuenta(body: Record<string, unknown>): Record<string, unknown> {
  const propia = body.es_cuenta_propia === true;
  const txt = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return {
    es_cuenta_propia: propia,
    numero_cuenta: propia ? txt(body.numero_cuenta) : null,
    titular_cuenta: propia ? txt(body.titular_cuenta) : null,
    documento_titular: propia ? txt(body.documento_titular) : null,
    alias_cuenta: propia ? txt(body.alias_cuenta) : null,
  };
}

function esAdmin(rol: string | null): boolean {
  const r = String(rol ?? "").trim();
  return r === "super_admin" || esRolAdminEmpresaOGlobal(r);
}

/** GET — lista de bancos de la empresa. Accesible a cualquier usuario (alimenta el dropdown de cobros). */
export async function GET(request: Request) {
  try {
    const auth = await requireTenantUserApiAccess(request);
    if (!auth.ok) return NextResponse.json(errorResponse(auth.message), { status: auth.status });

    const supabase = await getChatServiceClientForEmpresa(auth.empresaId);
    const { data, error } = await supabase
      .from("bancos")
      .select("id, codigo, nombre, tipo, activo, sort_order, es_cuenta_propia, numero_cuenta, titular_cuenta, documento_titular, alias_cuenta")
      .eq("empresa_id", auth.empresaId)
      .order("sort_order", { ascending: true })
      .order("nombre", { ascending: true });
    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });

    return NextResponse.json(
      successResponse({ bancos: data ?? [], meta: { can_edit: esAdmin(auth.rol) } })
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "No se pudieron cargar los bancos";
    return NextResponse.json(errorResponse(message), { status: 500 });
  }
}

/** POST — alta de un banco (solo admin). */
export async function POST(request: Request) {
  try {
    const auth = await requireTenantUserApiAccess(request);
    if (!auth.ok) return NextResponse.json(errorResponse(auth.message), { status: auth.status });
    if (!esAdmin(auth.rol)) {
      return NextResponse.json(errorResponse("Sin permiso para editar el catálogo de bancos"), { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      nombre?: unknown; codigo?: unknown; tipo?: unknown; sort_order?: unknown;
      es_cuenta_propia?: unknown; numero_cuenta?: unknown; titular_cuenta?: unknown;
      documento_titular?: unknown; alias_cuenta?: unknown;
    };
    const nombre = typeof body.nombre === "string" ? body.nombre.trim() : "";
    if (!nombre) return NextResponse.json(errorResponse("Indicá el nombre del banco"), { status: 400 });
    const codigo = typeof body.codigo === "string" && body.codigo.trim() ? body.codigo.trim().toUpperCase() : null;
    const tipo = TIPOS.includes(String(body.tipo)) ? String(body.tipo) : "banco";

    const supabase = await getChatServiceClientForEmpresa(auth.empresaId);
    const { data, error } = await supabase
      .from("bancos")
      .insert({
        empresa_id: auth.empresaId,
        nombre,
        nombre_norm: normNombre(nombre),
        codigo,
        tipo,
        ...camposDeCuenta(body),
        sort_order: Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0,
      })
      .select("id, codigo, nombre, tipo, activo, sort_order, es_cuenta_propia, numero_cuenta, titular_cuenta, documento_titular, alias_cuenta")
      .single();

    if (error) {
      const status = error.code === "23505" ? 409 : 400;
      const msg = error.code === "23505" ? mensajeDuplicado(error) : error.message;
      return NextResponse.json(errorResponse(msg), { status });
    }
    return NextResponse.json(successResponse({ banco: data }), { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "No se pudo crear el banco";
    return NextResponse.json(errorResponse(message), { status: 400 });
  }
}
