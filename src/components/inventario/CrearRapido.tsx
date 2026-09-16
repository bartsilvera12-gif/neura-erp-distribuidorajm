"use client";

import { useState } from "react";

/**
 * "+ Crear" sin salir del formulario.
 *
 * Antes cada uno de estos botones era un enlace a otra pantalla: al volver, lo
 * que estabas cargando del producto ya no estaba. Cargar un producto nuevo y
 * darse cuenta en la mitad de que falta la categoría es lo normal, no la
 * excepción.
 *
 * El modal pide lo mínimo —el nombre— porque el resto se completa después
 * desde la pantalla del catálogo. Al guardar, el nuevo queda elegido.
 */

export type TipoCrearRapido = "categoria" | "proveedor" | "ubicacion";

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
  { titulo: string; etiqueta: string; placeholder: string; url: string; clave: string }
> = {
  categoria: {
    titulo: "Nueva categoría",
    etiqueta: "Nombre de la categoría",
    placeholder: "Ej: POLLO",
    url: "/api/inventario/categorias",
    clave: "categoria",
  },
  proveedor: {
    titulo: "Nuevo proveedor",
    etiqueta: "Razón social o nombre",
    placeholder: "Ej: FRIGORÍFICO SAN MIGUEL",
    url: "/api/proveedores",
    clave: "proveedor",
  },
  ubicacion: {
    titulo: "Nueva ubicación",
    etiqueta: "Nombre de la ubicación",
    placeholder: "Ej: DEPÓSITO CENTRAL",
    url: "/api/inventario/ubicaciones",
    clave: "ubicacion",
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
  const [nombre, setNombre] = useState("");
  const [tipoUbicacion, setTipoUbicacion] = useState("deposito");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    const limpio = nombre.trim();
    if (!limpio) {
      setError("Poné un nombre.");
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { nombre: limpio };
      if (tipo === "ubicacion") body.tipo = tipoUbicacion;
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
      // Un clic afuera cierra: es un formulario de un campo, no hay nada que perder.
      onClick={onCerrar}
    >
      <div
        className="w-full max-w-sm rounded-t-2xl bg-white p-5 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-bold text-slate-900">{cfg.titulo}</h2>

        <label className="mt-4 block">
          <span className="mb-1 block text-xs font-medium text-slate-600">{cfg.etiqueta}</span>
          <input
            value={nombre}
            onChange={(e) => {
              setError(null);
              setNombre(e.target.value.toUpperCase());
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void guardar();
              }
            }}
            placeholder={cfg.placeholder}
            className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm uppercase outline-none focus:ring-2 focus:ring-[#4FAEB2]"
            autoFocus
          />
        </label>

        {tipo === "ubicacion" ? (
          <label className="mt-3 block">
            <span className="mb-1 block text-xs font-medium text-slate-600">Tipo</span>
            <select
              value={tipoUbicacion}
              onChange={(e) => setTipoUbicacion(e.target.value)}
              className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-[#4FAEB2]"
            >
              {TIPOS_UBICACION.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {error ? (
          <p role="alert" className="mt-3 rounded-lg bg-red-50 p-2.5 text-xs text-red-700">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onCerrar}
            disabled={guardando}
            className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-600 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={guardar}
            disabled={guardando}
            className="flex-1 rounded-xl py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: "#4FAEB2" }}
          >
            {guardando ? "Guardando…" : "Crear"}
          </button>
        </div>
      </div>
    </div>
  );
}
