import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { permisosDeUsuario } from "@/lib/usuarios/server/permisos-pg";

/**
 * GET /api/empresas/mis-permisos — permisos efectivos del usuario logueado.
 *
 * Los usa la UI para no ofrecer acciones que el servidor va a rechazar igual
 * (p. ej. esconder "Editar" en Inventario a quien no puede editarlo). La
 * decisión real sigue siendo del endpoint de cada acción; esto es solo para
 * que la pantalla no muestre botones que no funcionan.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json([], { status: 401 });
    const schema = await fetchDataSchemaForEmpresaId(ctx.auth.empresa_id);
    const { permisos } = await permisosDeUsuario({
      schema,
      empresaId: ctx.auth.empresa_id,
      email: ctx.auth.user?.email,
    });
    return NextResponse.json([...permisos]);
  } catch (err) {
    console.error("[/api/empresas/mis-permisos]", err instanceof Error ? err.message : err);
    return NextResponse.json([], { status: 500 });
  }
}
