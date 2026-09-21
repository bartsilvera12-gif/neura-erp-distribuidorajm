"use client";

import { useState } from "react";
import { apiCreateCliente } from "@/lib/api/client";
import { clienteDesdeFila } from "@/lib/clientes/storage";
import type { Cliente } from "@/lib/clientes/types";

/**
 * Alta de cliente desde la caja, con lo mínimo para facturarle y volver a
 * encontrarlo: nombre y un contacto.
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
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");
  const [documento, setDocumento] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const puedeGuardar = nombre.trim().length >= 2 && !guardando;

  async function guardar() {
    setError(null);
    const correo = email.trim();
    if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
      setError("El correo no parece válido. Revisalo o dejalo vacío.");
      return;
    }

    setGuardando(true);
    // `persona` es lo que corresponde a un cliente de mostrador: así el nombre
    // que se carga acá es el que se muestra y el que sale en la factura.
    const res = await apiCreateCliente({
      tipo_cliente: "persona",
      nombre_contacto: nombre.trim(),
      telefono: telefono.trim() || undefined,
      email: correo || undefined,
      documento: documento.trim() || undefined,
    });
    setGuardando(false);

    if (!res.ok) {
      setError(res.error);
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
        <Campo label="Nombre y apellido" obligatorio>
          <input
            autoFocus
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej.: María González"
            className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#4FAEB2]"
          />
        </Campo>

        <Campo label="Teléfono">
          <input
            inputMode="tel"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            placeholder="0981 123 456"
            className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#4FAEB2]"
          />
        </Campo>

        <Campo label="Correo electrónico">
          <input
            inputMode="email"
            autoCapitalize="none"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="maria@correo.com"
            className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#4FAEB2]"
          />
        </Campo>

        <Campo label="RUC o cédula">
          <input
            inputMode="text"
            value={documento}
            onChange={(e) => setDocumento(e.target.value)}
            placeholder="Para que salga en la factura"
            className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#4FAEB2]"
          />
        </Campo>
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
        El teléfono sirve para mandarle la factura por WhatsApp. Lo demás se completa después
        desde Clientes.
      </p>

      {error ? (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 p-2.5 text-xs text-red-700">
          {error}
        </p>
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
