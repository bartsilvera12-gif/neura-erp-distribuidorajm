import { NextResponse } from "next/server";
import { reintentarSinColumnasFaltantes } from "@/lib/supabase/columnas-faltantes";
import { getServiceAuthUsuario } from "@/lib/auth/get-service-auth-usuario";

type UsuarioActivoRow = {
  id: string;
  nombre: string | null;
  email: string | null;
  rol?: string | null;
  estado: string | null;
  /** Marca a la persona de QA: su tarjeta del tablero usa las etapas de QA. */
  es_qa?: boolean | null;
  /** Marca a la persona de Project Manager (para asignarla como PM de un cliente). */
  es_project_manager?: boolean | null;
  es_tecnico?: boolean | null;
};

/**
 * GET /api/usuarios/empresa-activos
 *
 * Catálogo acotado para selects: resuelve la empresa desde la sesión y lee
 * `usuarios` server-side con service role, sin exponer RLS ni datos de otras empresas.
 */
export async function GET(request: Request) {
  try {
    const r = await getServiceAuthUsuario(request);
    if (!r.ok) {
      return NextResponse.json({ error: "No autenticado" }, { status: r.status });
    }

    const { catalogUsuario, supabaseSr } = r;
    const empresaId = catalogUsuario?.empresa_id ?? null;
    if (!empresaId) {
      return NextResponse.json({ error: "Perfil de empresa no encontrado" }, { status: 403 });
    }

    // `es_qa`, `es_project_manager` y `es_tecnico` son de la agencia: marcan
    // roles de un equipo de proyectos. Un schema que no los tenga —una
    // distribuidora, por ejemplo— dejaba el selector de vendedores vacío con el
    // error de Postgres debajo. Ahora esas columnas se saltean y la lista sale.
    const COLUMNAS = ["id", "nombre", "email", "rol", "estado", "es_qa", "es_project_manager", "es_tecnico"];
    const { data, error } = await reintentarSinColumnasFaltantes<
      UsuarioActivoRow[],
      { message: string }
    >(
      COLUMNAS,
      async (cols) => {
        const r = await supabaseSr
          .from("usuarios")
          .select(cols.join(", "))
          .eq("empresa_id", empresaId)
          .ilike("estado", "activo")
          .order("nombre", { ascending: true })
          .order("email", { ascending: true });
        return {
          data: (r.data ?? null) as UsuarioActivoRow[] | null,
          error: r.error ? { message: r.error.message } : null,
        };
      },
      ["id", "email"]
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const usuarios = ((data ?? []) as UsuarioActivoRow[]).map((u) => ({
      id: u.id,
      nombre: u.nombre,
      email: u.email ?? "",
      rol: u.rol ?? null,
      estado: u.estado,
      es_qa: u.es_qa === true,
      es_project_manager: u.es_project_manager === true,
      es_tecnico: u.es_tecnico === true,
    }));

    return NextResponse.json({ usuarios });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al listar usuarios activos";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
