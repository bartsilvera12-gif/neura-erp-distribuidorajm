import "server-only";
import * as XLSX from "xlsx";

/**
 * Conciliación bancaria.
 *
 * 1) `extraerTransacciones`: lee el extracto y devuelve las transacciones.
 *    · Excel/CSV → se reconocen las columnas (Debe/Haber o Monto + Fecha + Comprobante).
 *    · PDF       → se extrae el texto y se interpreta cada renglón.
 *    Todo local: sin clave de API, sin costo por uso, y el extracto bancario no
 *    sale del servidor. Un PDF escaneado no tiene texto y no se puede leer; en
 *    ese caso el mensaje pide el Excel o CSV, que los bancos también ofrecen.
 * 2) `conciliar`: cruza los créditos (ingresos) del extracto contra las transferencias APROBADAS
 *    del mes, y clasifica cada caso (conciliado / aprobado-sin-respaldo / ingreso-no-registrado /
 *    monto-difiere). No modifica nada: solo informa.
 */


export type ExtractoTx = {
  fecha: string | null; // YYYY-MM-DD
  monto: number;
  tipo: "credito" | "debito";
  referencia: string | null; // nº de operación / comprobante si el extracto lo trae
  descripcion: string | null;
};

export type AprobadoLite = {
  id: string;
  monto: number;
  fecha: string; // YYYY-MM-DD
  numero_operacion: string | null;
  banco_origen: string | null;
  titular: string | null;
  cliente_nombre: string | null;
  numero_factura: string | null;
  /** Si >1, esta fila representa VARIOS cobros del ERP agrupados por el mismo N° de operación. */
  agrupadas?: number;
};

export type ParMatch = { aprobado: AprobadoLite; credito: ExtractoTx };
export type ParDifiere = ParMatch & { diff: number };

export type ConciliacionResult = {
  moneda: string | null;
  banco_detectado: string | null;
  conciliados: ParMatch[];
  montos_difieren: ParDifiere[];
  aprobados_sin_extracto: AprobadoLite[];
  extracto_sin_registrar: ExtractoTx[];
  resumen: {
    aprobados: number;
    creditos_extracto: number;
    conciliados: number;
    difieren: number;
    sin_extracto: number;
    sin_registrar: number;
    monto_conciliado: number;
    monto_sin_extracto: number;
    monto_sin_registrar: number;
  };
};

function toNum(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
  let s = String(v ?? "").trim();
  if (!s) return NaN;
  s = s.replace(/[^\d.,-]/g, "");
  if (!s) return NaN;
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    // el separador más a la derecha es el decimal; el otro es de miles
    const dec = lastDot > lastComma ? "." : ",";
    const mil = dec === "." ? "," : ".";
    s = s.split(mil).join("").replace(dec, ".");
  } else if (lastComma >= 0) {
    // solo comas: miles si hay grupos de 3 sin cola decimal de 1-2; si no, decimal
    if (/,\d{3}(?:\D|$)/.test(s) && !/,\d{1,2}$/.test(s)) s = s.split(",").join("");
    else s = s.replace(",", ".");
  } else if (lastDot >= 0) {
    if (/\.\d{3}(?:\D|$)/.test(s) && !/\.\d{1,2}$/.test(s)) s = s.split(".").join("");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

/** Reintenta ante errores transitorios de la API (529 overloaded, 429, 503) con backoff. */
function normHead(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase()
    .trim();
}

const ALIAS = {
  credito: ["haber", "credito", "credit", "abono", "ingreso", "creditos", "montocredito"],
  debito: ["debe", "debito", "debit", "cargo", "egreso", "debitos", "montodebito"],
  monto: ["monto", "importe", "valor", "amount", "montogs"],
  fecha: ["fechamovi", "fechacont", "fechamovimiento", "fechacontable", "fechaoperacion", "fecha", "date", "dia"],
  ref: ["comprobante", "operacion", "nrooperacion", "numerooperacion", "referencia", "orden", "documento", "comprob", "nrodoc"],
  desc: ["descripcion", "descrip", "concepto", "movimiento", "detalle", "description"],
};

function pickCol(headers: string[], aliases: string[]): number {
  for (const a of aliases) {
    const i = headers.findIndex((h) => h === a);
    if (i >= 0) return i;
  }
  // match parcial (contiene)
  for (const a of aliases) {
    const i = headers.findIndex((h) => h.includes(a));
    if (i >= 0) return i;
  }
  return -1;
}

/** Convierte un serial de fecha de Excel (días desde 1899-12-30) a YYYY-MM-DD, en UTC. */
function serialExcelAYmd(n: number): string | null {
  if (!Number.isFinite(n) || n <= 20000 || n >= 90000) return null; // rango ~1954..2146
  const d = new Date(Math.round((n - 25569) * 86400000)); // 25569 = 1899-12-30 → 1970-01-01
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function fechaDeCelda(v: unknown): string | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
  }
  // Serial numérico de Excel (ej. FECHAMOVI = 46266 → 2026-09-01).
  if (typeof v === "number") return serialExcelAYmd(v);
  const s = String(v ?? "").trim();
  let m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  // String que en realidad es un serial ("46266").
  if (/^\d{5}$/.test(s)) return serialExcelAYmd(Number(s));
  return null;
}

/** Lee las filas del Excel/CSV como matriz (primera hoja). `raw:true` → números y fechas reales. */
function leerFilas(bytes: Buffer): unknown[][] {
  const wb = XLSX.read(bytes, { type: "buffer", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true }) as unknown[][];
}

/**
 * Parseo directo de un extracto Excel/CSV con columnas reconocibles (Debe/Haber o Monto +
 * Fecha + Comprobante). Devuelve null si no reconoce el formato (para caer al fallback IA).
 */
export function parseExtractoExcel(bytes: Buffer): { moneda: string | null; banco: string | null; transacciones: ExtractoTx[] } | null {
  const aoa = leerFilas(bytes);
  if (aoa.length < 2) return null;

  // Buscar la fila de encabezados en las primeras 15 filas.
  let headerRow = -1;
  let cols: Record<string, number> = {};
  for (let r = 0; r < Math.min(15, aoa.length); r++) {
    const headers = (aoa[r] ?? []).map(normHead);
    const c = {
      credito: pickCol(headers, ALIAS.credito),
      debito: pickCol(headers, ALIAS.debito),
      monto: pickCol(headers, ALIAS.monto),
      fecha: pickCol(headers, ALIAS.fecha),
      ref: pickCol(headers, ALIAS.ref),
      desc: pickCol(headers, ALIAS.desc),
    };
    const tieneImporte = c.credito >= 0 || c.debito >= 0 || c.monto >= 0;
    if (tieneImporte && (c.fecha >= 0 || c.desc >= 0)) {
      headerRow = r;
      cols = c;
      break;
    }
  }
  if (headerRow < 0) return null;

  const transacciones: ExtractoTx[] = [];
  for (let r = headerRow + 1; r < aoa.length; r++) {
    const row = aoa[r] ?? [];
    const cell = (i: number) => (i >= 0 ? row[i] : undefined);
    const haber = cols.credito >= 0 ? toNum(cell(cols.credito)) : NaN;
    const debe = cols.debito >= 0 ? toNum(cell(cols.debito)) : NaN;
    let monto = NaN;
    let tipo: "credito" | "debito" = "credito";
    if (Number.isFinite(haber) && haber > 0) {
      monto = haber;
      tipo = "credito";
    } else if (Number.isFinite(debe) && debe > 0) {
      monto = debe;
      tipo = "debito";
    } else if (cols.monto >= 0) {
      monto = toNum(cell(cols.monto));
      tipo = "credito"; // sin columnas Debe/Haber no podemos distinguir; asumimos crédito
    }
    if (!Number.isFinite(monto) || monto <= 0) continue;
    transacciones.push({
      fecha: cols.fecha >= 0 ? fechaDeCelda(cell(cols.fecha)) : null,
      monto,
      tipo,
      referencia: cols.ref >= 0 && cell(cols.ref) != null ? String(cell(cols.ref)).trim() || null : null,
      descripcion: cols.desc >= 0 && cell(cols.desc) != null ? String(cell(cols.desc)).trim().slice(0, 200) || null : null,
    });
  }
  if (transacciones.length === 0) return null;
  return { moneda: null, banco: null, transacciones };
}

/**
 * Punto de entrada: dispatch por tipo de archivo. Todo se resuelve en el
 * servidor, sin servicios externos.
 */
export async function extraerTransacciones(
  bytes: Buffer,
  filename: string
): Promise<{ moneda: string | null; banco: string | null; transacciones: ExtractoTx[]; via: "pdf-texto" | "excel-directo" }> {
  const lower = (filename || "").toLowerCase();
  if (lower.endsWith(".pdf")) {
    return { ...(await extraerTransaccionesDePdf(bytes)), via: "pdf-texto" };
  }
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls") || lower.endsWith(".csv")) {
    const directo = parseExtractoExcel(bytes);
    if (directo) return { ...directo, via: "excel-directo" };
    throw new Error(
      "No se reconocieron las columnas del archivo. El extracto necesita una columna de fecha, " +
      "una de importe (Monto, o Debe y Haber) y preferentemente el nº de comprobante."
    );
  }
  throw new Error("Formato no soportado (subí un PDF o un Excel)");
}

// ---- Matcheo / conciliación ----

function normRef(s: string | null | undefined): string {
  return String(s ?? "").replace(/[\s.\-/]/g, "").toLowerCase();
}
function diasEntre(a: string | null, b: string | null): number {
  if (!a || !b) return 0;
  const da = Date.parse(a);
  const db = Date.parse(b);
  if (Number.isNaN(da) || Number.isNaN(db)) return 0;
  return Math.abs(da - db) / 86400000;
}

const TOL_MONTO = 1; // GS: match exacto (tolerancia mínima por redondeo)
const TOL_DIAS = 3;

/**
 * Agrupa cobros del ERP que comparten el MISMO N° de operación (≥5 dígitos) en una sola fila
 * con el monto sumado. Ej: UMA 250k + STRATUM 250k con op 76382451 → un crédito de 500k en el
 * banco. Evita falsas alarmas de "monto difiere" / "sin respaldo" en pagos agrupados.
 */
function agruparPorOperacion(aprobados: AprobadoLite[]): AprobadoLite[] {
  const porOp = new Map<string, AprobadoLite[]>();
  const solos: AprobadoLite[] = [];
  for (const a of aprobados) {
    const op = normRef(a.numero_operacion);
    // Agrupar SOLO por operaciones reales: ≥5 y no un placeholder (000000, 00000, todos iguales).
    // Antes, varios cobros distintos con op "000000" se sumaban como una sola transferencia
    // fantasma (ej. RUTH + O&M + FLORENCIA = 1.540.000 que no existía en el banco).
    const agrupable = op.length >= 5 && !/^(.)\1*$/.test(op);
    if (agrupable) {
      const arr = porOp.get(op) ?? [];
      arr.push(a);
      porOp.set(op, arr);
    } else {
      solos.push(a);
    }
  }
  const out: AprobadoLite[] = [...solos];
  for (const arr of porOp.values()) {
    if (arr.length === 1) {
      out.push(arr[0]);
      continue;
    }
    const nombres = [...new Set(arr.map((x) => (x.cliente_nombre ?? x.titular ?? "").trim()).filter(Boolean))].join(" + ");
    out.push({
      ...arr[0],
      monto: arr.reduce((s, x) => s + x.monto, 0),
      cliente_nombre: nombres || arr[0].cliente_nombre,
      numero_factura: [...new Set(arr.map((x) => x.numero_factura).filter(Boolean))].join(", ") || null,
      agrupadas: arr.length,
    });
  }
  return out;
}

export function conciliar(
  aprobadosRaw: AprobadoLite[],
  extracto: { moneda: string | null; banco: string | null; transacciones: ExtractoTx[] }
): ConciliacionResult {
  const aprobados = agruparPorOperacion(aprobadosRaw);
  const creditos = extracto.transacciones.filter((t) => t.tipo === "credito");
  const usados = new Set<number>();
  const conciliados: ParMatch[] = [];
  const difieren: ParDifiere[] = [];
  const sinExtracto: AprobadoLite[] = [];

  for (const a of aprobados) {
    const aRef = normRef(a.numero_operacion);
    let idx = -1;

    // 1) Match fuerte por número de operación / referencia.
    if (aRef.length >= 3) {
      idx = creditos.findIndex((c, i) => {
        if (usados.has(i)) return false;
        const cRef = normRef(c.referencia);
        return cRef.length >= 3 && (cRef === aRef || cRef.includes(aRef) || aRef.includes(cRef));
      });
    }
    // 2) Match por monto exacto + fecha cercana.
    if (idx < 0) {
      idx = creditos.findIndex(
        (c, i) => !usados.has(i) && Math.abs(c.monto - a.monto) <= TOL_MONTO && diasEntre(c.fecha, a.fecha) <= TOL_DIAS
      );
    }

    if (idx >= 0) {
      usados.add(idx);
      const c = creditos[idx];
      const diff = Math.round(c.monto - a.monto);
      if (Math.abs(diff) > TOL_MONTO) difieren.push({ aprobado: a, credito: c, diff });
      else conciliados.push({ aprobado: a, credito: c });
    } else {
      sinExtracto.push(a);
    }
  }

  const sinRegistrar = creditos.filter((_, i) => !usados.has(i));
  const sum = (xs: number[]) => Math.round(xs.reduce((s, x) => s + x, 0));

  return {
    moneda: extracto.moneda,
    banco_detectado: extracto.banco,
    conciliados,
    montos_difieren: difieren,
    aprobados_sin_extracto: sinExtracto,
    extracto_sin_registrar: sinRegistrar,
    resumen: {
      aprobados: aprobados.length,
      creditos_extracto: creditos.length,
      conciliados: conciliados.length,
      difieren: difieren.length,
      sin_extracto: sinExtracto.length,
      sin_registrar: sinRegistrar.length,
      monto_conciliado: sum(conciliados.map((p) => p.aprobado.monto)),
      monto_sin_extracto: sum(sinExtracto.map((a) => a.monto)),
      monto_sin_registrar: sum(sinRegistrar.map((c) => c.monto)),
    },
  };
}

// ── Extracto en PDF, sin IA ────────────────────────────────────────────────

/**
 * Saca las transacciones de un extracto en PDF leyendo su texto.
 *
 * Antes esto se le mandaba a Claude. Ahora se hace acá: se extrae el texto del
 * PDF y se interpreta cada renglón. Sin clave de API, sin costo por uso y sin
 * que el extracto bancario salga del servidor.
 *
 * El límite es real y hay que decirlo: un PDF ESCANEADO (una foto del papel)
 * no tiene texto, así que de ahí no se puede sacar nada. En ese caso el
 * endpoint pide el Excel o el CSV que los bancos también ofrecen.
 *
 * Formato de un renglón típico de extracto paraguayo:
 *   01/09/2026  TRANSF. RECIBIDA JAZMIN Q  16788999   1.500.000        2.300.000
 *   fecha       descripción                referencia  importe          saldo
 */
export async function extraerTransaccionesDePdf(
  pdfBytes: Buffer
): Promise<{ moneda: string | null; banco: string | null; transacciones: ExtractoTx[] }> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const doc = await getDocumentProxy(new Uint8Array(pdfBytes));
  const { text } = await extractText(doc, { mergePages: true });
  const plano = Array.isArray(text) ? text.join("\n") : String(text ?? "");

  if (plano.replace(/\s/g, "").length < 40) {
    throw new Error(
      "El PDF no tiene texto: parece escaneado o es una foto. Descargá el extracto en Excel o CSV desde el home banking y subí ese archivo."
    );
  }

  const transacciones = parseRenglonesDeExtracto(plano);
  if (transacciones.length === 0) {
    throw new Error(
      "No se reconoció ningún movimiento en el PDF. Si el banco ofrece el extracto en Excel o CSV, ese formato es más confiable."
    );
  }
  return { moneda: detectarMoneda(plano), banco: detectarBanco(plano), transacciones };
}

/** PYG no usa decimales; USD sí. Se detecta para interpretar bien los importes. */
function detectarMoneda(texto: string): string | null {
  if (/\b(USD|DOLAR|DÓLAR|U\$S)\b/i.test(texto)) return "USD";
  if (/\b(PYG|GUARAN|GS\.?)\b/i.test(texto)) return "PYG";
  return null;
}

function detectarBanco(texto: string): string | null {
  const bancos = ["ITAU", "ITAÚ", "CONTINENTAL", "UENO", "BASA", "GNB", "SUDAMERIS", "FAMILIAR", "ATLAS", "RIO", "REGIONAL"];
  const arriba = texto.slice(0, 2000).toUpperCase();
  return bancos.find((b) => arriba.includes(b)) ?? null;
}

/** Renglones que traen un importe pero no son un movimiento de la cuenta. */
const NO_ES_MOVIMIENTO =
  /\b(SALDO (ANTERIOR|INICIAL|FINAL|ACTUAL|DISPONIBLE|AL)|TOTALES?|SUBTOTAL|ARRASTRE|TRANSPORTE)\b/i;

/** Un importe paraguayo: 1.500.000 o 1.500.000,50 o 1500000. */
const IMPORTE = /-?\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|-?\d+,\d{1,2}|-?\d{4,}/g;

/**
 * Interpreta los renglones del texto del extracto.
 *
 * La heurística es a propósito conservadora: solo toma el renglón como
 * movimiento si empieza con una fecha y tiene al menos un importe. Es
 * preferible no reconocer un renglón raro a inventar un movimiento que no
 * existe, porque después se cruza contra cobros reales.
 */
export function parseRenglonesDeExtracto(texto: string): ExtractoTx[] {
  const out: ExtractoTx[] = [];
  for (const crudo of texto.split(/\r?\n/)) {
    const linea = crudo.replace(/\s+/g, " ").trim();
    if (!linea) continue;

    const mFecha = linea.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/);
    if (!mFecha) continue;
    const anio = mFecha[3].length === 2 ? `20${mFecha[3]}` : mFecha[3];
    const fecha = `${anio}-${mFecha[2].padStart(2, "0")}-${mFecha[1].padStart(2, "0")}`;

    const resto = linea.slice(mFecha[0].length);

    // Los renglones de saldo y totales NO son movimientos. Sin esto, un
    // "SALDO ANTERIOR 800.000" entra como un ingreso que nadie hizo y después
    // aparece en la conciliación como cobro sin registrar.
    if (NO_ES_MOVIMIENTO.test(resto)) continue;

    const importes = resto.match(IMPORTE) ?? [];
    if (importes.length === 0) continue;

    // El último número suele ser el saldo acumulado; el movimiento es el anterior.
    // Con un solo número, ese es el movimiento.
    const montoTxt = (importes.length >= 2 ? importes[importes.length - 2] : importes[0]) ?? "";
    const monto = Math.abs(toNum(montoTxt));
    if (!Number.isFinite(monto) || monto <= 0) continue;

    // Débito vs crédito: por el signo, o por las palabras del renglón.
    const negativo = montoTxt.trim().startsWith("-");
    const esDebito =
      negativo ||
      /\b(DEBITO|DÉBITO|PAGO|EXTRACCION|EXTRACCIÓN|RETIRO|COMISION|COMISIÓN|IVA|TRANSF\.? ENVIADA|DEBITADO)\b/i.test(resto);

    // La referencia: el número largo suelto más probable (nº de operación).
    const ref = (resto.match(/\b\d{6,}\b/g) ?? []).find((n) => !montoTxt.includes(n)) ?? null;

    const descripcion = resto
      .replace(IMPORTE, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 200);

    out.push({
      fecha,
      monto,
      tipo: esDebito ? "debito" : "credito",
      referencia: ref,
      descripcion: descripcion || null,
    });
  }
  return out;
}
