import { NextResponse } from "next/server";
import { getChatServiceClientForEmpresa } from "@/app/api/chat/_chat-service-client";
import { errorResponse, successResponse } from "@/lib/api/response";
import { requireNotificacionesAccess } from "@/lib/notificaciones/notificaciones-auth";

/**
 * GET /api/notificaciones?limit=20&solo_no_leidas=1
 *
 * Panel de la campanita. Devuelve siempre el contador de no leídas junto al
 * listado, para que el header no tenga que hacer dos requests.
 *
 * El destinatario sale de la sesión (`auth.usuarioId`), nunca de la
 * query: si viniera del cliente, cualquiera podría leer las de un compañero
 * pasando otro id.
 *
 * Solo notificaciones guardadas. Antes se sumaban avisos calculados en vivo
 * —recordatorios de reunión, QA por vencer, esqueleto de proyecto web— contra
 * una ventana de tiempo. Como no eran filas no se podían marcar como leídas y
 * se iban solos al cerrarse la ventana: el contador subía, la campanita sonaba
 * y minutos después el panel decía "estás al día" sin que nadie hubiera tocado
 * nada. Un aviso que suena y después no está no es un aviso, es ruido.
 */
const LIMIT_DEFAULT = 20;
const LIMIT_MAX = 50;

export async function GET(request: Request) {
  const auth = await requireNotificacionesAccess(request);
  if (!auth.ok) {
    return NextResponse.json(errorResponse(auth.message), { status: auth.status });
  }

  try {
    const sp = new URL(request.url).searchParams;
    const limitRaw = Number(sp.get("limit"));
    const limit = Number.isFinite(limitRaw)
      ? Math.min(Math.max(Math.trunc(limitRaw), 1), LIMIT_MAX)
      : LIMIT_DEFAULT;
    const soloNoLeidas = sp.get("solo_no_leidas") === "1";

    const sb = await getChatServiceClientForEmpresa(auth.empresaId);

    let listado = sb
      .from("usuario_notificaciones")
      .select("id, tipo, titulo, cuerpo, proyecto_id, observacion_id, agrupadas, leida_at, created_at, metadata")
      .eq("empresa_id", auth.empresaId)
      .eq("usuario_id", auth.usuarioId);
    if (soloNoLeidas) listado = listado.is("leida_at", null);

    const [itemsRes, countRes] = await Promise.all([
      listado.order("created_at", { ascending: false }).limit(limit),
      sb
        .from("usuario_notificaciones")
        .select("id", { count: "exact", head: true })
        .eq("empresa_id", auth.empresaId)
        .eq("usuario_id", auth.usuarioId)
        .is("leida_at", null),
    ]);

    if (itemsRes.error) {
      return NextResponse.json(errorResponse(itemsRes.error.message), { status: 400 });
    }

    // El contador y el listado salen de la misma tabla, así que no pueden
    // discrepar: si el panel está vacío, la campanita está apagada.
    return NextResponse.json(
      successResponse({
        notificaciones: itemsRes.data ?? [],
        no_leidas: countRes.count ?? 0,
      })
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
