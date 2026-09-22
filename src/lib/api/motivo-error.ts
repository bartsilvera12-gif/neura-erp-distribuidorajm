/**
 * El motivo real de un error, para no devolver mensajes mudos.
 *
 * Un "No se pudieron cargar las órdenes de compra." no le dice nada a nadie:
 * ni al usuario, ni a quien tiene que arreglarlo. Esto arma el mensaje de
 * Postgres con su detalle, su sugerencia y su código, y aguanta que lo que se
 * haya lanzado no sea un Error.
 */
export function motivoDelError(e: unknown): string {
  const o = (e ?? {}) as { message?: unknown; detail?: unknown; hint?: unknown; code?: unknown };
  const partes = [o.message, o.detail, o.hint].filter((x) => typeof x === "string" && x) as string[];
  const codigo = typeof o.code === "string" && o.code ? ` [${o.code}]` : "";
  const texto = partes.join(" · ");
  if (texto) return texto + codigo;
  const crudo = typeof e === "string" ? e : String(e ?? "");
  return crudo && crudo !== "[object Object]" ? crudo + codigo : "";
}

/** `base` con el motivo real pegado, o `base` sola si no hubo motivo legible. */
export function conMotivo(base: string, e: unknown): string {
  const motivo = motivoDelError(e);
  return motivo ? `${base.replace(/\.$/, "")}: ${motivo}` : base;
}
