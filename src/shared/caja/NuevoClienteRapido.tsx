"use client";

import { useState } from "react";
import { apiCreateCliente, type DuplicadoMatchClient } from "@/lib/api/client";
import { clienteDesdeFila, getCliente } from "@/lib/clientes/storage";
import type { Cliente } from "@/lib/clientes/types";
import ConsultarSetButton, { type DatosSet } from "@/components/clientes/ConsultarSetButton";

/**
 * Alta de cliente desde la caja: RUC y nombre, nada más.
 *
 * El RUC va primero porque con él se consulta la SET, que completa el nombre y
 * la razón social para la factura. Teléfono y correo no se piden acá: se
 * cargan después desde Clientes si hacen falta.
 *
 * Es a propósito más corta que la ficha de Clientes. El vendedor está con el
 * cliente enfrente esperando; pedirle acá los veinte campos de la ficha
 * terminaría en que nadie registra a nadie y todo se factura sin nombre. El
 * resto de los datos se completa después desde Clientes.
 */

const TEAL = "#4FAEB2";

export default function NuevoClienteRapido({
  onCreado,
  onCancelar,
  /** En escritorio el panel ya se titula "Cliente": repetirlo sobra. */
  mostrarTitulo = true,
}: {
  onCreado: (cliente: Cliente) => void;
  onCancelar: () => void;
  mostrarTitulo?: boolean;
}) {
  const [nombre, setNombre] = useState("");
  const [documento, setDocumento] = useState("");
  /**
   * Lo que trajo la SET, si se consultó. Decide cómo se guarda: una empresa
   * (persona jurídica) se registra como empresa, con su razón social y RUC para
   * la factura; si no, queda como persona, igual que antes.
   */
  const [datosSet, setDatosSet] = useState<DatosSet | null>(null);

  function aplicarDatosSet(d: DatosSet) {
    setDatosSet(d);
    const nombrePersona = d.razon_social.includes(",")
      ? d.razon_social.split(",").map((x) => x.trim()).reverse().join(" ")
      : d.razon_social;
    setNombre(
      (d.tipo_cliente === "empresa" ? d.nombre_comercial ?? d.razon_social : nombrePersona).toUpperCase()
    );
    setDocumento(`${d.ruc}-${d.dv}`);
  }
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * El cliente ya estaba cargado (en el salón, en un camión o en Clientes):
   * en vez de crear otro, se usa ese, con su RUC y sus datos.
   */
  const [existentes, setExistentes] = useState<DuplicadoMatchClient[]>([]);

  async function usarExistente(id: string) {
    setGuardando(true);
    const c = await getCliente(id).catch(() => null);
    setGuardando(false);
    if (!c) {
      setError("No se pudo abrir ese cliente. Buscalo por nombre o RUC.");
      return;
    }
    onCreado(c);
  }

  const puedeGuardar = nombre.trim().length >= 2 && !guardando;

  async function guardar() {
    setError(null);
    setExistentes([]);

    setGuardando(true);
    // `persona` es lo que corresponde a un cliente de mostrador: así el nombre
    // que se carga acá es el que se muestra y el que sale en la factura.
    // Solo se usa lo de la SET si el documento sigue siendo el consultado: si
    // después lo cambiaron a mano, manda lo que está escrito.
    const set =
      datosSet && documento.trim() === `${datosSet.ruc}-${datosSet.dv}` ? datosSet : null;
    const rucSet = set ? `${set.ruc}-${set.dv}` : undefined;
    const res = await apiCreateCliente(
      set?.tipo_cliente === "empresa"
        ? {
            tipo_cliente: "empresa",
            empresa: nombre.trim().toUpperCase(),
            nombre_contacto: nombre.trim(),
            razon_social: set.razon_social.toUpperCase(),
            ruc: rucSet,
            ruc_factura: rucSet,
          }
        : {
            tipo_cliente: "persona",
            nombre_contacto: nombre.trim(),
            documento: set ? set.ruc : documento.trim() || undefined,
            razon_social: set ? set.razon_social.toUpperCase() : undefined,
            ruc_factura: rucSet,
          }
    );
    setGuardando(false);

    if (!res.ok) {
      const activos = res.code === "DUPLICATE" ? (res.matches ?? []).filter((m) => m.activo) : [];
      if (activos.length > 0) {
        setExistentes(activos);
        setError("Este cliente ya está cargado. Usalo así no queda duplicado:");
      } else {
        setError(res.error);
      }
      return;
    }
    onCreado(clienteDesdeFila(res.data));
  }

  return (
    <div className={mostrarTitulo ? "pt-4" : ""}>
      {mostrarTitulo ? (
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">
          Registrar nuevo cliente
        </p>
      ) : null}

      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        {/* El RUC primero: con él se consulta la SET y el nombre se completa solo. */}
        <div>
          <span className="mb-1 block text-xs font-medium text-slate-600">RUC o cédula</span>
          <input
            autoFocus
            inputMode="text"
            value={documento}
            onChange={(e) => setDocumento(e.target.value)}
            placeholder="80012345-6"
            className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#4FAEB2]"
          />
          <ConsultarSetButton valor={documento} onDatos={aplicarDatosSet} />
        </div>

        <Campo label="Nombre" obligatorio>
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Se completa con la SET, o escribilo"
            className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#4FAEB2]"
          />
        </Campo>
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
        Teléfono y demás datos se completan después desde Clientes.
      </p>

      {error ? (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 p-2.5 text-xs text-red-700">
          {error}
        </p>
      ) : null}
      {existentes.length > 0 ? (
        <div className="mt-2 space-y-1.5">
          {existentes.map((m) => (
            <button
              key={m.cliente_id}
              type="button"
              onClick={() => void usarExistente(m.cliente_id)}
              disabled={guardando}
              className="flex w-full items-center justify-between gap-2 rounded-lg border border-[#4FAEB2] bg-[#4FAEB2]/5 px-3 py-2.5 text-left text-sm hover:bg-[#4FAEB2]/10 disabled:opacity-40"
            >
              <span className="min-w-0">
                <span className="block truncate font-semibold text-slate-900">{m.nombre}</span>
                {m.documento ? <span className="block text-xs text-slate-500">RUC/CI {m.documento}</span> : null}
              </span>
              <span className="shrink-0 text-xs font-semibold text-[#3F8E91]">Usar este cliente</span>
            </button>
          ))}
        </div>
      ) : null}

      <button
        type="button"
        onClick={guardar}
        disabled={!puedeGuardar}
        className="mt-4 w-full rounded-xl py-3.5 text-sm font-semibold text-white transition-colors disabled:opacity-40"
        style={{ backgroundColor: TEAL }}
      >
        {guardando ? "Guardando…" : "Guardar y continuar"}
      </button>

      <button
        type="button"
        onClick={onCancelar}
        className="mt-2 w-full rounded-xl border border-slate-200 bg-white py-3 text-sm font-medium text-slate-600"
      >
        Cancelar
      </button>
    </div>
  );
}

function Campo({
  label,
  obligatorio,
  children,
}: {
  label: string;
  obligatorio?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">
        {label}
        {obligatorio ? <span className="text-red-500"> *</span> : null}
      </span>
      {children}
    </label>
  );
}
