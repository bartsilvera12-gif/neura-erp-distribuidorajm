/**
 * Columnas que un schema no tiene.
 *
 * El ERP se despliega sobre schemas que no son iguales: se clonó para una
 * distribuidora de alimentos un sistema escrito para una agencia de servicios,
 * y la tabla `clientes` de allá tiene columnas que acá no existen. Cuando el
 * código pide una de esas, Postgres o PostgREST cortan la operación entera: un
 * alta de cliente que falla por `razon_social` no guarda nada, y un selector de
 * vendedores que pide `es_qa` se queda vacío con un error en crudo debajo.
 *
 * La salida no es escribir columnas fijas —eso rompe el otro schema— sino
 * saltear la que falta y seguir. La columna ausente simplemente no se usa.
 */

/**
 * Nombre de la columna que el error dice que no existe, o `null`.
 *
 * Los dos motores avisan distinto y hay que entender a los dos: Postgres tira
 * `column clientes_1.razon_social does not exist` y PostgREST, que valida
 * contra su caché de schema, `Could not find the 'razon_social' column of
 * 'clientes' in the schema cache`.
 */
export function columnaInexistente(mensaje: string | null | undefined): string | null {
  if (!mensaje) return null;
  const pg = /column\s+(?:[\w."]+\.)?"?([\w]+)"?\s+does not exist/i.exec(mensaje);
  if (pg) return pg[1];
  const postgrest = /Could not find the '([\w]+)' column/i.exec(mensaje);
  if (postgrest) return postgrest[1];
  return null;
}

/** `true` si el error es "esa columna no existe acá" y no otra cosa. */
export function esErrorDeColumnaFaltante(mensaje: string | null | undefined): boolean {
  return columnaInexistente(mensaje) !== null;
}

/**
 * Corre `intentar` y, si falla por una columna que no existe, la saca y
 * reintenta. Devuelve el primer resultado bueno, o el último error.
 *
 * `obligatorias` son las columnas sin las que la operación no tiene sentido: si
 * falta una de esas el error sube, porque guardar un cliente sin nombre o
 * listar sin id sería peor que fallar.
 */
export async function reintentarSinColumnasFaltantes<T, E extends { message: string }>(
  columnas: string[],
  intentar: (columnas: string[]) => Promise<{ data: T | null; error: E | null }>,
  obligatorias: string[] = []
): Promise<{ data: T | null; error: E | null; omitidas: string[] }> {
  const obligatoria = new Set(obligatorias);
  let actuales = [...columnas];
  const omitidas: string[] = [];

  // Como mucho una vuelta por columna: cada intento saca una y nunca la repone.
  for (let i = 0; i <= columnas.length; i++) {
    const res = await intentar(actuales);
    if (!res.error) return { ...res, omitidas };

    const falta = columnaInexistente(res.error.message);
    if (!falta || obligatoria.has(falta) || !actuales.includes(falta)) {
      return { ...res, omitidas };
    }
    actuales = actuales.filter((c) => c !== falta);
    omitidas.push(falta);
  }

  return { data: null, error: { message: "Demasiadas columnas faltantes." } as E, omitidas };
}
