import "server-only";
import type { RucSeparado } from "@/lib/set/ruc";

/**
 * Servicio web "Consulta RUC" de la DNIT (Consulta Pública, doc. enero/2024).
 *
 *   GET https://servicios.set.gov.py/EsetApiWS/ApiWS/consultaRuc?apiKey=…&ruc=…&dv=…
 *
 * Devuelve razón social, nombre comercial, tipo de persona, estado, categoría.
 * NO devuelve dirección ni teléfono: eso se sigue cargando a mano.
 *
 * La apiKey es del contribuyente (Distribuidora JM) y vive en la variable de
 * entorno `SET_APIKEY`. Nunca viaja al navegador: por eso la consulta la hace
 * el servidor.
 */

const URL_BASE = "https://servicios.set.gov.py/EsetApiWS/ApiWS/consultaRuc";

export type DatosRucSet = {
  ruc: string;
  dv: string;
  razon_social: string;
  nombre_comercial: string | null;
  /** "FISICO" | "JURIDICO" tal como lo manda la DNIT. */
  tipo_persona: string | null;
  /** "ACTIVO", "SUSPENSION TEMPORAL", "CANCELADO", … */
  estado: string | null;
  categoria: string | null;
  /** Lo que el formulario de clientes usa: jurídico → empresa, físico → persona. */
  tipo_cliente: "empresa" | "persona";
};

export type ResultadoConsultaRuc =
  | { ok: true; datos: DatosRucSet }
  | { ok: false; motivo: string; codigo?: string };

/** Lo que la DNIT devuelve. Los campos del contribuyente pueden faltar. */
type RespuestaSet = {
  estado?: string;
  codigo?: string;
  mensaje?: string;
  contribuyente?: {
    razonSocial?: string;
    estado?: string;
    categoria?: string;
    mesCierre?: string;
    tipoPersona?: string;
    rucAnterior?: string;
    tipoSociedad?: string;
    nombreComercial?: string;
  };
};

/** Los códigos de la tabla de errores del documento, dichos para quien carga el cliente. */
function motivoDeCodigo(codigo: string | undefined, mensaje: string | undefined): string {
  const m = (mensaje ?? "").trim();
  switch ((codigo ?? "").trim().toLowerCase()) {
    case "ap001":
      return m
        ? `La SET rechazó la clave de consulta: ${m}.`
        : "La SET rechazó la clave de consulta (APIKEY inactiva, vencida o sin cupo).";
    case "ap010":
      return "Falta la clave de consulta de la SET en la configuración del sistema.";
    case "ap011":
      return "Falta el número de RUC.";
    case "ap012":
      return "Falta el dígito verificador del RUC.";
    case "db001":
    case "sv001":
    case "in001":
      return "El servicio de la SET tuvo un error interno. Probá de nuevo en unos minutos.";
    default:
      return m || "La SET no reconoce ese RUC.";
  }
}

/** Interpreta la respuesta de la DNIT. Separado del fetch para poder probarlo. */
export function interpretarRespuestaSet(r: RespuestaSet, rucDv: RucSeparado): ResultadoConsultaRuc {
  const valido = (r.estado ?? "").toUpperCase() === "VALIDO";
  if (!valido || !r.contribuyente) {
    return { ok: false, motivo: motivoDeCodigo(r.codigo, r.mensaje), codigo: r.codigo };
  }
  const c = r.contribuyente;
  const razon = (c.razonSocial ?? "").trim();
  const comercial = (c.nombreComercial ?? "").trim();
  const tipo = (c.tipoPersona ?? "").trim().toUpperCase();
  return {
    ok: true,
    datos: {
      ruc: rucDv.ruc,
      dv: rucDv.dv,
      razon_social: razon,
      // La DNIT a veces repite la razón social o manda un marcador vacío.
      nombre_comercial: comercial && comercial !== razon ? comercial : null,
      tipo_persona: tipo || null,
      estado: (c.estado ?? "").trim() || null,
      categoria: (c.categoria ?? "").trim() || null,
      tipo_cliente: tipo === "FISICO" ? "persona" : "empresa",
    },
  };
}

export async function consultarRucSet(rucDv: RucSeparado): Promise<ResultadoConsultaRuc> {
  const apiKey = process.env.SET_APIKEY?.trim();
  if (!apiKey) {
    return {
      ok: false,
      motivo:
        "La consulta a la SET no está configurada: falta la variable SET_APIKEY en el servidor.",
    };
  }

  const url = `${URL_BASE}?${new URLSearchParams({ apiKey, ruc: rucDv.ruc, dv: rucDv.dv })}`;
  const ctrl = new AbortController();
  const corte = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetch(url, { cache: "no-store", signal: ctrl.signal });
    const texto = await res.text();
    let json: RespuestaSet;
    try {
      json = JSON.parse(texto) as RespuestaSet;
    } catch {
      return {
        ok: false,
        motivo: `La SET respondió algo que no se pudo leer (HTTP ${res.status}).`,
      };
    }
    return interpretarRespuestaSet(json, rucDv);
  } catch (e) {
    const abortado = e instanceof Error && e.name === "AbortError";
    return {
      ok: false,
      motivo: abortado
        ? "La SET no respondió a tiempo. Probá de nuevo en unos minutos."
        : "No se pudo conectar con la SET.",
    };
  } finally {
    clearTimeout(corte);
  }
}
