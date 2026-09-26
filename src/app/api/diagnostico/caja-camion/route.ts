import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { queryWithRetry } from "@/lib/supabase/pg-retry";
import { resolverUsuarioTenant } from "@/lib/usuarios/server/usuario-tenant";
import { alcanceRepartos } from "@/lib/usuarios/erp-rol-normalize";
import { esRolAdminEmpresa } from "@/lib/modulos/resolve-effective-modules";
import { motivoDelError } from "@/lib/api/motivo-error";

export const runtime = "nodejs";

/**
 * GET /api/diagnostico/caja-camion
 *
 * Corre, para el usuario logueado, cada paso de "¿de qué stock vende esta
 * persona?" y devuelve lo que vio en cada uno. Existe porque ese problema se
 * persiguió a ciegas varias vueltas: cada arreglo "debería" haber andado y la
 * caja seguía mostrando el salón. Con esto se abre una URL desde el celular del
 * vendedor y se ve en qué paso se corta, en vez de suponerlo.
 *
 * Solo lectura, y solo sobre la empresa y el usuario de la sesión.
 */
export async function GET(request: NextRequest) {
  const pasos: Record<string, unknown> = {};
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const empresaId = ctx.auth.empresa_id;
    const schema = await fetchDataSchemaForEmpresaId(empresaId);
    const email = ctx.auth.user?.email ?? null;
    const catalogId = ctx.auth.usuarioCatalogId ?? null;

    pasos["1_sesion"] = { email, catalogId, empresaId, schema };

    const pool = getChatPostgresPool();
    if (!pool) {
      pasos["error"] = "Sin conexión directa a la base (pool).";
      return NextResponse.json({ pasos });
    }

    // Paso 2: ¿quién soy en el schema del tenant?
    const yo = await resolverUsuarioTenant({ schema, empresaId, email, catalogId });
    pasos["2_usuario_tenant"] = yo
      ? {
          encontrado: true,
          id: yo.id,
          rol: yo.rol,
          vende_de_su_camion_segun_rol: alcanceRepartos(yo.rol) === "propios",
          es_admin: esRolAdminEmpresa(yo.rol),
        }
      : { encontrado: false, motivo: "no hay fila en usuarios con ese correo ni con ese id" };

    // Paso 3: todos los repartos abiertos de la empresa y a quién pertenecen.
    const tR = quoteSchemaTable(schema, "repartos");
    const tC = quoteSchemaTable(schema, "camiones");
    const tU = quoteSchemaTable(schema, "usuarios");
    const abiertos = await queryWithRetry<{
      reparto_id: string;
      camion: string | null;
      ubicacion_id: string | null;
      repartidor_id: string;
      repartidor_email: string | null;
      fecha: string;
    }>(
      pool,
      `SELECT r.id AS reparto_id, c.nombre AS camion, c.ubicacion_id,
              r.repartidor_id, u.email AS repartidor_email, r.fecha::text AS fecha
         FROM ${tR} r
         LEFT JOIN ${tC} c ON c.id = r.camion_id
         LEFT JOIN ${tU} u ON u.id = r.repartidor_id
        WHERE r.empresa_id = $1::uuid AND r.estado = 'abierto'
        ORDER BY r.fecha DESC`,
      [empresaId]
    );
    pasos["3_repartos_abiertos_de_la_empresa"] = abiertos.rows.map((r) => ({
      ...r,
      es_mio: yo ? r.repartidor_id === yo.id : false,
    }));

    // Paso 4: los míos.
    const mios = yo ? abiertos.rows.filter((r) => r.repartidor_id === yo.id) : [];
    pasos["4_mis_repartos_abiertos"] = mios.length;

    // Paso 5: la decisión, igual que en /api/productos.
    let decision: string;
    if (!yo) decision = "SALÓN — no se encontró tu usuario";
    else if (esRolAdminEmpresa(yo.rol)) decision = "SALÓN — tu rol es administrador";
    else if (mios.length === 1) {
      decision = mios[0].ubicacion_id
        ? `CAMIÓN «${mios[0].camion}»`
        : `CAMIÓN «${mios[0].camion}» pero SIN ubicación de inventario — no se puede vender`;
    } else if (mios.length === 0) decision = "SALÓN — no tenés ningún reparto abierto a tu nombre";
    else decision = `SALÓN — tenés ${mios.length} repartos abiertos, hay que elegir`;
    pasos["5_decision"] = decision;

    // Paso 6: qué hay arriba del camión, si es que se resolvió uno.
    if (mios.length === 1 && mios[0].ubicacion_id) {
      const stock = await queryWithRetry<{ producto: string; stock: string }>(
        pool,
        `SELECT p.nombre AS producto, s.stock_actual::text AS stock
           FROM ${quoteSchemaTable(schema, "inventario_stock_ubicacion")} s
           JOIN ${quoteSchemaTable(schema, "productos")} p ON p.id = s.producto_id
          WHERE s.ubicacion_id = $1::uuid AND s.stock_actual > 0
          ORDER BY p.nombre`,
        [mios[0].ubicacion_id]
      ).catch((e) => ({ rows: [{ producto: `(error: ${motivoDelError(e)})`, stock: "" }] }));
      pasos["6_stock_del_camion"] = stock.rows;
    }

    return NextResponse.json({ pasos });
  } catch (e) {
    pasos["error"] = motivoDelError(e) || String(e);
    return NextResponse.json({ pasos }, { status: 500 });
  }
}
