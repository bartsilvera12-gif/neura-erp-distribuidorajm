"use client";

import { AlertTriangle, Info } from "lucide-react";
import type { OrigenCatalogo } from "@/lib/inventario/storage";

/**
 * De dónde sale la lista de productos de la caja.
 *
 * El origen lo decide el servidor y viaja en la respuesta. Antes cada pantalla
 * lo deducía por su cuenta —"si hay reparto elegido, es el camión"— y podía
 * mentir en los dos sentidos: decir "camión X" mostrando el depósito entero
 * porque ese camión no tenía ubicación de inventario, o decir "salón" mostrando
 * el camión del repartidor logueado.
 */
export default function AvisoCatalogoCaja({
  origen,
  ocultos,
}: {
  origen: OrigenCatalogo | null;
  /** Productos que existen pero no se ofrecen por no tener stock. */
  ocultos: number;
}) {
  // El camión sin ubicación de inventario no es un detalle de la lista: es un
  // camión que no puede vender nada hasta que alguien lo arregle.
  if (origen?.tipo === "camion_sin_ubicacion") {
    return (
      <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-50 p-2.5 text-[11px] leading-relaxed text-amber-900">
        <AlertTriangle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          El camión <span className="font-semibold">{origen.camion ?? "asignado"}</span> no tiene
          ubicación de inventario, así que no se sabe qué lleva arriba. No se puede vender desde
          este camión hasta darle una: Repartos → Camiones.
        </span>
      </p>
    );
  }

  if (!origen) return null;
  // `empresa` es el maestro de Inventario, que no pasa por acá.
  if (origen.tipo === "empresa") return null;
  if (origen.tipo === "salon" && ocultos === 0) return null;

  const sinStock =
    ocultos === 0
      ? ""
      : ` ${ocultos} ${ocultos === 1 ? "producto sin stock no se lista" : "productos sin stock no se listan"}.`;

  return (
    <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-slate-500">
      <Info aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
      <span>
        {origen.tipo === "camion" ? (
          <>
            Solo lo que hay arriba del camión{" "}
            <span className="font-semibold text-slate-700">{origen.camion ?? "—"}</span>.
          </>
        ) : (
          "Lo que hay en el salón: el stock de la empresa menos lo que está arriba de los camiones."
        )}
        {sinStock}
      </span>
    </p>
  );
}

/** El motivo del servidor, dicho para quien está parado frente a la caja. */
export function textoMotivoSalon(
  origen?: { motivo_salon?: string; error_camion?: string | null } | null
): string | null {
  if (origen?.error_camion) {
    return `No se pudo resolver tu camión (${origen.error_camion}), así que la lista es la del salón.`;
  }
  switch (origen?.motivo_salon) {
    case "rol_no_es_vendedor_movil":
      return "Tu usuario no figura como Vendedor Móvil, así que la caja te muestra el salón y no un camión. Se cambia en Usuarios, en el nivel de acceso.";
    case "sin_reparto_abierto":
      return "No tenés ningún reparto abierto. Abrí uno en Repartos para vender del camión.";
    case "usuario_no_encontrado":
      return "El usuario con el que entraste no figura en la lista de usuarios de la empresa (se busca por correo). Revisá que el correo de la ficha sea el mismo con el que iniciás sesión.";
    case "varios_repartos_abiertos":
      return "Tenés más de un reparto abierto y no se puede saber de cuál vendés. Cerrá el que no corresponda en Repartos.";
    default:
      return null;
  }
}
