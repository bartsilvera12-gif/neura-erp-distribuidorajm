/**
 * SKU sugerido a partir del nombre del producto.
 *
 * Nadie quiere inventar un código en el mostrador, y los que se inventan a mano
 * terminan repetidos o sin criterio. La sugerencia se arma con las primeras
 * letras del nombre y un correlativo, y sigue siendo editable: si la casa ya
 * tiene una codificación propia, se escribe encima.
 *
 * El correlativo se calcula contra los SKU que ya existen, así que dos productos
 * que empiezan igual no chocan. El alta igual vuelve a chequear duplicados antes
 * de guardar, que es lo que cubre el caso de dos personas cargando a la vez.
 */

/** "Muslo de Pollo" → "MUS"; "Aceite" → "ACE"; "Té" → "TE". */
function prefijoDe(nombre: string): string {
  const limpio = nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .trim();
  if (!limpio) return "PRD";

  const palabras = limpio.split(/\s+/).filter((p) => p.length > 0);
  // Dos palabras o más: una letra de cada una de las tres primeras (MUSLO DE
  // POLLO → MDP se lee peor que MUS, así que se prioriza la primera palabra).
  const base = palabras[0].slice(0, 3);
  return (base.length >= 3 ? base : (base + (palabras[1] ?? "")).slice(0, 3)).padEnd(3, "X");
}

/**
 * Devuelve un SKU libre con el formato `PRE-0001`.
 *
 * @param nombre  nombre del producto tal como lo escribió el usuario
 * @param usados  SKU que ya existen en la empresa
 */
export function sugerirSku(nombre: string, usados: Iterable<string>): string {
  const prefijo = prefijoDe(nombre);
  const tomados = new Set<string>();
  for (const s of usados) tomados.add(s.trim().toUpperCase());

  for (let n = 1; n <= 9999; n++) {
    const candidato = `${prefijo}-${String(n).padStart(4, "0")}`;
    if (!tomados.has(candidato)) return candidato;
  }
  // 9999 productos con el mismo prefijo: cae a algo único igual.
  return `${prefijo}-${Date.now().toString().slice(-6)}`;
}
