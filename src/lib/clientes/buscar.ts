import type { Cliente } from "./types";
import { clienteNombre } from "./storage";

/**
 * Búsqueda de clientes, la misma en todas las pantallas (caja, celular,
 * lista de clientes).
 *
 * - Sin tildes ni mayúsculas: "doldan" encuentra "DOLDÁN".
 * - Por palabras sueltas, en cualquier orden: "alan doldan" encuentra
 *   "ALAN DAVID DOLDAN". Antes se buscaba la frase exacta y no aparecía.
 * - Por nombre, razón social, contacto, RUC, cédula, código, teléfono o email.
 *   El RUC y la cédula se comparan también sin puntos ni guiones.
 * - Nunca rompe por un campo vacío (antes un cliente sin código tiraba error
 *   y el buscador de la caja dejaba de andar).
 */
export function normalizarBusqueda(s: string | null | undefined): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const soloDigitos = (s: string) => s.replace(/\D/g, "");

/** Texto donde se busca, armado una vez por cliente. */
function textoDe(c: Cliente): string {
  const campos = [
    clienteNombre(c),
    c.razon_social,
    c.nombre_contacto,
    c.empresa,
    c.codigo_cliente,
    c.ruc,
    c.documento,
    c.email,
    c.telefono,
    c.ciudad,
  ];
  const base = normalizarBusqueda(campos.filter(Boolean).join(" "));
  const numeros = [c.ruc, c.documento, c.telefono].map((x) => soloDigitos(String(x ?? ""))).filter(Boolean).join(" ");
  return numeros ? `${base} ${numeros}` : base;
}

const cache = new WeakMap<Cliente, string>();

/** `true` si el cliente coincide con lo escrito (todas las palabras, sin importar el orden). */
export function coincideCliente(c: Cliente, query: string): boolean {
  const q = normalizarBusqueda(query);
  if (!q) return true;
  let texto = cache.get(c);
  if (texto === undefined) {
    texto = textoDe(c);
    cache.set(c, texto);
  }
  const t = texto;
  return q.split(" ").every((palabra) => {
    if (t.includes(palabra)) return true;
    // "4.567.890" o "80012345-6": se compara solo con los números.
    const digitos = soloDigitos(palabra);
    return /^[\d.\-]+$/.test(palabra) && digitos.length >= 3 && t.includes(digitos);
  });
}

/**
 * Filtra y ordena: primero los que empiezan con lo escrito (en el nombre),
 * después el resto, alfabético. Así "doldan" muestra arriba a los DOLDAN.
 */
export function buscarClientes(clientes: Cliente[], query: string, limite?: number): Cliente[] {
  const q = normalizarBusqueda(query);
  if (!q) return limite ? clientes.slice(0, limite) : clientes;
  const out = clientes.filter((c) => coincideCliente(c, q));
  const empieza = (c: Cliente) => (normalizarBusqueda(clienteNombre(c)).startsWith(q) ? 0 : 1);
  out.sort((a, b) => empieza(a) - empieza(b) || clienteNombre(a).localeCompare(clienteNombre(b)));
  return limite ? out.slice(0, limite) : out;
}
