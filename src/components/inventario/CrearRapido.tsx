"use client";

import { useState } from "react";
import { X } from "lucide-react";

/**
 * "+ Crear" sin salir del formulario.
 *
 * Antes cada uno de estos botones era un enlace a otra pantalla: al volver, lo
 * que estabas cargando del producto ya no estaba. Darse cuenta en la mitad de
 * que falta la categoría es lo normal, no la excepción.
 *
 * El modal pide lo mínimo para que el registro sirva y quede identificable —el
 * nombre, y el RUC y el teléfono del proveedor, que es lo que se busca cuando
 * hay que llamarlo—. El resto de la ficha se completa después, en su pantalla:
 * un alta rápida con quince campos deja de ser rápida y nadie la usa.
 */

export type TipoCrearRapido = "categoria" | "proveedor" | "ubicacion";

type Campo = {
  name: string;
  label: string;
  placeholder: string;
  /** `true` ocupa la fila entera; si no, va a media fila. */
  ancho?: boolean;
  requerido?: boolean;
  tipo?: "texto" | "select";
  opciones?: { value: string; label: string }[];
  /** Los nombres se guardan en mayúsculas, como el resto del catálogo. */
  mayusculas?: boolean;
};

const TIPOS_UBICACION = [
  { value: "deposito", label: "Depósito" },
  { value: "salon", label: "Salón" },
  { value: "camion", label: "Camión" },
  { value: "zona", label: "Zona" },
  { value: "estante", label: "Estante" },
  { value: "otro", label: "Otro" },
];

const CONFIG: Record<
  TipoCrearRapido,
  {
    titulo: string;
    accion: string;
    url: string;
    clave: string;
    nota: string;
    campos: Campo[];
  }
> = {
  categoria: {
    titulo: "Nueva categoría",
    accion: "Crear categoría",
    url: "/api/inventario/categorias",
    clave: "categoria",
    nota: "Las subcategorías y la descripción se agregan después desde Inventario → Categorías.",
    campos: [
      {
        name: "nombre",
        label: "Nombre de la categoría",
        placeholder: "EJ: POLLO",
        ancho: true,
        requerido: true,
        mayusculas: true,
      },
      { name: "codigo", label: "Código", placeholder: "EJ: POL", mayusculas: true },
    ],
  },
  proveedor: {
    titulo: "Nuevo proveedor",
    accion: "Crear proveedor",
    url: "/api/proveedores",
    clave: "proveedor",
    nota: "El resto de la ficha (dirección, condición de pago, moneda) se completa después desde Compras → Proveedores.",
    campos: [
      {
        name: "nombre",
        label: "Razón social / nombre",
        placeholder: "EJ: DISTRIBUIDORA SAN JOSÉ S.A.",
        ancho: true,
        requerido: true,
        mayusculas: true,
      },
      { name: "ruc", label: "RUC", placeholder: "EJ: 80012345-6", mayusculas: true },
      { name: "telefono", label: "Teléfono", placeholder: "Ej: 0981 123 456" },
    ],
  },
  ubicacion: {
    titulo: "Nueva ubicación",
    accion: "Crear ubicación",
    url: "/api/inventario/ubicaciones",
    clave: "ubicacion",
    nota: "El tipo decide cómo se usa: a un camión no se le transfiere mercadería como a un depósito.",
    campos: [
      {
        name: "nombre",
        label: "Nombre de la ubicación",
        placeholder: "EJ: DEPÓSITO CENTRAL",
        ancho: true,
        requerido: true,
        mayusculas: true,
      },
      { name: "tipo", label: "Tipo", tipo: "select", opciones: TIPOS_UBICACION, placeholder: "" },
      { name: "codigo", label: "Código", placeholder: "EJ: DEP-01", mayusculas: true },
    ],
  },
};

export default function CrearRapido({
  tipo,
  onCreado,
}: {
  tipo: TipoCrearRapido;
  /** Se llama con el id del creado, para elegirlo y recargar la lista. */
  onCreado: (id: string) => void | Promise<void>;
}) {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="shrink-0 inline-flex items-center gap-1 rounded-md border border-sky-200 px-2.5 py-1 text-xs font-medium text-sky-700 transition-colors hover:bg-sky-50 hover:text-sky-900"
      >
        + Crear
      </button>

      {abierto ? (
        <ModalCrear
          tipo={tipo}
          onCerrar={() => setAbierto(false)}
          onCreado={async (id) => {
            setAbierto(false);
            await onCreado(id);
          }}
        />
      ) : null}
    </>
  );
}

function ModalCrear({
  tipo,
  onCerrar,
  onCreado,
}: {
  tipo: TipoCrearRapido;
  onCerrar: () => void;
  onCreado: (id: string) => void | Promise<void>;
}) {
  const cfg = CONFIG[tipo];
  const [valores, setValores] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      cfg.campos.map((c) => [c.name, c.tipo === "select" ? (c.opciones?.[0]?.value ?? "") : ""])
    )
  );
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const faltaRequerido = cfg.campos.some((c) => c.requerido && !valores[c.name]?.trim());

  function set(name: string, valor: string) {
    setError(null);
    setValores((prev) => ({ ...prev, [name]: valor }));
  }

  async function guardar() {
    if (guardando || faltaRequerido) return;
    setGuardando(true);
    setError(null);
    try {
      // Los vacíos no se mandan: un RUC en blanco no es un RUC, y guardarlo
      // como cadena vacía después rompe las búsquedas por RUC.
      const body: Record<string, unknown> = {};
      for (const c of cfg.campos) {
        const v = (valores[c.name] ?? "").trim();
        if (v) body[c.name] = v;
      }

      const res = await fetch(cfg.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        data?: Record<string, { id?: string }>;
        error?: string;
      };
      if (!res.ok || !json.success) {
        setError(json.error ?? "No se pudo crear.");
        return;
      }
      const id = json.data?.[cfg.clave]?.id;
      if (!id) {
        setError("Se creó, pero no vino el identificador. Recargá la página.");
        return;
      }
      await onCreado(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4"
      onClick={onCerrar}
    >
      <div
        className="w-full max-w-lg rounded-t-2xl bg-white p-5 sm:rounded-2xl sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{cfg.titulo}</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Se crea sin salir del formulario y queda seleccionado.
            </p>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="-mr-1 -mt-1 rounded-lg p-1.5 text-slate-400 hover:bg-slate-50 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {cfg.campos.map((c) => (
            <label key={c.name} className={c.ancho ? "sm:col-span-2" : ""}>
              <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                {c.label}
                {c.requerido ? <span className="ml-0.5 text-red-500">*</span> : null}
              </span>

              {c.tipo === "select" ? (
                <select
                  value={valores[c.name] ?? ""}
                  onChange={(e) => set(c.name, e.target.value)}
                  className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[#4FAEB2] focus:ring-2 focus:ring-[#4FAEB2]/30"
                >
                  {(c.opciones ?? []).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={valores[c.name] ?? ""}
                  onChange={(e) =>
                    set(c.name, c.mayusculas ? e.target.value.toUpperCase() : e.target.value)
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void guardar();
                    }
                  }}
                  placeholder={c.placeholder}
                  autoFocus={c.requerido}
                  className={`h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#4FAEB2] focus:ring-2 focus:ring-[#4FAEB2]/30 ${
                    c.mayusculas ? "uppercase placeholder:normal-case" : ""
                  }`}
                />
              )}
            </label>
          ))}
        </div>

        <p className="mt-4 text-xs leading-relaxed text-slate-400">{cfg.nota}</p>

        {error ? (
          <p role="alert" className="mt-3 rounded-lg bg-red-50 p-2.5 text-xs text-red-700">
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCerrar}
            disabled={guardando}
            className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-500 hover:text-slate-700 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={guardar}
            disabled={guardando || faltaRequerido}
            className="rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-40"
            style={{ backgroundColor: "#4FAEB2" }}
          >
            {guardando ? "Guardando…" : cfg.accion}
          </button>
        </div>
      </div>
    </div>
  );
}
