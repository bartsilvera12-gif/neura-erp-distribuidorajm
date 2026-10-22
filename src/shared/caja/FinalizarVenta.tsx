"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Banknote,
  CalendarClock,
  FileText,
  Landmark,
  Receipt,
  Search,
  UserPlus,
} from "lucide-react";
import ModalCaja from "@/shared/caja/ModalCaja";
import CalculadoraVuelto from "@/shared/caja/CalculadoraVuelto";
import NuevoClienteRapido from "@/shared/caja/NuevoClienteRapido";
import { useClientes } from "@/shared/hooks/useClientes";
import { clienteNombre } from "@/lib/clientes/storage";
import { formatGs, type CajaVenta } from "@/shared/caja/useCajaVenta";
import { METODOS_COBRO, type MetodoPagoVenta } from "@/lib/ventas/types";
import type { Cliente } from "@/lib/clientes/types";

/**
 * Finalizar la venta, todo en una ventana: qué comprobante sale (ticket sin
 * nombre o factura a nombre de un cliente), a quién, cómo se paga, cuánto
 * entrega y el vuelto, y si se imprime al confirmar.
 *
 * Se recorre con Enter: cada Enter confirma la sección y pasa a la siguiente
 * (las flechas cambian la opción), y el último registra la venta. Ctrl+Enter
 * o F9 la registran desde cualquier lado.
 */

type Modo = "sin-nombre" | "con-nombre";
type Pago = MetodoPagoVenta | "credito";

const ICONOS: Partial<Record<Pago, typeof Banknote>> = {
  efectivo: Banknote,
  transferencia: Landmark,
  cheque: Receipt,
  credito: CalendarClock,
};

/** Pasa el foco cuando el elemento ya está en pantalla (puede aparecer recién). */
function enfocar(fn: () => HTMLElement | null | undefined) {
  requestAnimationFrame(() => fn()?.focus());
}

export default function FinalizarVenta({
  caja,
  imprimir,
  setImprimir,
  extras,
  onCerrar,
  onConfirmada,
}: {
  caja: CajaVenta;
  imprimir: boolean;
  setImprimir: (v: boolean) => void;
  /** Moneda, camión: lo que se usa poco va al final. */
  extras?: React.ReactNode;
  onCerrar: () => void;
  onConfirmada: () => void;
}) {
  const [modo, setModo] = useState<Modo>(caja.cliente ? "con-nombre" : "sin-nombre");
  const [aviso, setAviso] = useState<string | null>(null);
  const grupoComprobante = useRef<HTMLDivElement>(null);
  const grupoPago = useRef<HTMLDivElement>(null);

  const pago: Pago | null = caja.aCredito ? "credito" : caja.metodoPago;
  const faltaCliente = modo === "con-nombre" && !caja.cliente;
  const listo = caja.puedeConfirmar && !faltaCliente && !caja.guardando;

  const foco = {
    comprobante: () =>
      enfocar(() => grupoComprobante.current?.querySelector<HTMLElement>('[aria-checked="true"]')),
    cliente: () => enfocar(() => document.getElementById("cobro-buscar-cliente")),
    pago: () => enfocar(() => grupoPago.current?.querySelector<HTMLElement>('[aria-checked="true"]')),
  };

  // Al abrir, el cursor arranca en el comprobante.
  useEffect(() => {
    foco.comprobante();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function confirmar() {
    if (!listo) {
      setAviso(faltaCliente ? "Elegí el cliente de la factura." : caja.motivoNoConfirmar);
      if (faltaCliente) foco.cliente();
      return;
    }
    setAviso(null);
    if (await caja.confirmar()) onConfirmada();
  }

  // Ctrl+Enter o F9: registrar desde donde esté el cursor.
  const confirmarRef = useRef(confirmar);
  useEffect(() => {
    confirmarRef.current = confirmar;
  });
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "F9" || (e.key === "Enter" && (e.ctrlKey || e.metaKey))) {
        e.preventDefault();
        void confirmarRef.current();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function elegirModo(m: Modo) {
    setModo(m);
    setAviso(null);
    if (m === "sin-nombre") {
      caja.elegirSinNombre();
      caja.setDocumento("ticket");
      // Sin cliente no hay crédito: vuelve a efectivo.
      if (caja.aCredito || !caja.metodoPago) caja.setMetodoPago(caja.metodoPago ?? "efectivo");
    } else {
      caja.setDocumento("factura");
    }
  }

  function elegirPago(p: Pago) {
    setAviso(null);
    if (p === "credito") {
      caja.setACredito(true);
      return;
    }
    caja.setACredito(false);
    caja.setMetodoPago(p);
  }

  /** Enter en la forma de pago: al monto, al plazo, o se registra. */
  function despuesDePago() {
    if (pago === "efectivo") enfocar(() => document.getElementById("cobro-paga-con"));
    else if (pago === "credito") enfocar(() => document.getElementById("cobro-plazo"));
    else void confirmar();
  }

  const opcionesPago = [
    ...METODOS_COBRO.map((m) => ({ valor: m.value as Pago, texto: m.label })),
    {
      valor: "credito" as Pago,
      texto: "Crédito",
      deshabilitado: !caja.cliente,
      ayuda: caja.cliente ? undefined : "El crédito es solo para clientes identificados (Factura con nombre).",
    },
  ];

  return (
    <ModalCaja
      titulo={`Finalizar venta · ${formatGs(caja.totales.total)}`}
      subtitulo={`${caja.carrito.length} ${caja.carrito.length === 1 ? "producto" : "productos"} · Enter avanza, flechas cambian la opción`}
      onCerrar={onCerrar}
      pie={
        <>
          <button
            type="button"
            onClick={onCerrar}
            className="h-11 rounded-lg px-4 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Volver <span className="ml-1 text-xs text-slate-400">Esc</span>
          </button>
          <button
            type="button"
            onClick={() => void confirmar()}
            disabled={caja.guardando}
            className={`h-11 rounded-lg px-5 text-sm font-semibold text-white transition-opacity disabled:opacity-40 ${
              listo ? "" : "opacity-60"
            }`}
            style={{ backgroundColor: "#4FAEB2" }}
          >
            {caja.guardando ? "Guardando…" : imprimir ? "Cobrar e imprimir" : "Cobrar"}
            {caja.guardando ? null : <span className="ml-2 text-xs font-medium opacity-80">F9</span>}
          </button>
        </>
      }
    >
      <Seccion numero={1} titulo="Comprobante">
        <FilaOpciones
          grupoRef={grupoComprobante}
          etiqueta="Comprobante"
          valor={modo}
          onCambiar={elegirModo}
          onEnter={() => (faltaCliente ? foco.cliente() : foco.pago())}
          opciones={[
            { valor: "sin-nombre", texto: "Ticket", detalle: "sin nombre", Icono: Receipt },
            { valor: "con-nombre", texto: "Factura", detalle: "con nombre del cliente", Icono: FileText },
          ]}
        />
        {modo === "con-nombre" ? (
          <ElegirCliente caja={caja} onElegido={foco.pago} />
        ) : null}
      </Seccion>

      <Seccion numero={2} titulo="Forma de pago">
        <FilaOpciones
          grupoRef={grupoPago}
          etiqueta="Forma de pago"
          valor={pago ?? "efectivo"}
          onCambiar={elegirPago}
          onEnter={despuesDePago}
          columnas={4}
          opciones={opcionesPago.map((o) => ({ ...o, Icono: ICONOS[o.valor] ?? Banknote }))}
        />

        {pago === "efectivo" ? (
          <div
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT" && !e.ctrlKey) {
                e.preventDefault();
                void confirmar();
              }
            }}
          >
            <CalculadoraVuelto caja={caja} inputId="cobro-paga-con" grande />
          </div>
        ) : null}

        {pago === "credito" ? (
          <label className="mt-3 block">
            <span className="mb-1 block text-xs text-slate-500">Plazo en días</span>
            <input
              id="cobro-plazo"
              inputMode="numeric"
              value={caja.plazoDias}
              onChange={(e) => caja.setPlazoDias(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.ctrlKey) {
                  e.preventDefault();
                  void confirmar();
                }
              }}
              placeholder="30"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#4FAEB2]"
            />
          </label>
        ) : null}
      </Seccion>

      <label className="mt-4 flex cursor-pointer items-center gap-2.5 rounded-xl border border-slate-200 px-3 py-2.5">
        <input
          type="checkbox"
          checked={imprimir}
          onChange={(e) => setImprimir(e.target.checked)}
          className="h-4 w-4 accent-[#4FAEB2]"
        />
        <span className="text-sm text-slate-700">
          Imprimir {modo === "con-nombre" ? "la factura" : "el ticket"} al cobrar
        </span>
      </label>

      {extras}

      {caja.error ? (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 p-2.5 text-xs text-red-700">
          {caja.error}
        </p>
      ) : aviso ? (
        <p role="status" className="mt-3 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800">
          {aviso}
        </p>
      ) : null}
    </ModalCaja>
  );
}

function Seccion({
  numero,
  titulo,
  children,
}: {
  numero: number;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <section className={numero > 1 ? "mt-5" : ""}>
      <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-slate-400">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[11px] text-slate-500">
          {numero}
        </span>
        {titulo}
      </p>
      {children}
    </section>
  );
}

type Opcion<T extends string> = {
  valor: T;
  texto: string;
  detalle?: string;
  /** Texto al pasar el mouse (p. ej. por qué está deshabilitada). */
  ayuda?: string;
  Icono: typeof Banknote;
  deshabilitado?: boolean;
};

/**
 * Botones de opción que se manejan con el teclado: flechas para cambiar,
 * Enter para seguir. Solo el elegido entra en el orden de Tab.
 */
function FilaOpciones<T extends string>({
  etiqueta,
  opciones,
  valor,
  onCambiar,
  onEnter,
  grupoRef,
  columnas = 2,
}: {
  etiqueta: string;
  opciones: Opcion<T>[];
  valor: T;
  onCambiar: (v: T) => void;
  onEnter: () => void;
  grupoRef: React.RefObject<HTMLDivElement | null>;
  columnas?: 2 | 4;
}) {
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      onEnter();
      return;
    }
    const paso =
      e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!paso) return;
    e.preventDefault();
    const habilitadas = opciones.filter((o) => !o.deshabilitado);
    const i = habilitadas.findIndex((o) => o.valor === valor);
    const sig = habilitadas[(i + paso + habilitadas.length) % habilitadas.length];
    if (!sig) return;
    onCambiar(sig.valor);
    enfocar(() => grupoRef.current?.querySelector<HTMLElement>(`[data-valor="${sig.valor}"]`));
  }

  return (
    <div
      ref={grupoRef}
      role="radiogroup"
      aria-label={etiqueta}
      onKeyDown={onKeyDown}
      className={`grid gap-2 ${columnas === 4 ? "grid-cols-4" : "grid-cols-2"}`}
    >
      {opciones.map(({ valor: v, texto, detalle, ayuda, Icono, deshabilitado }) => {
        const elegido = v === valor;
        return (
          <button
            key={v}
            type="button"
            role="radio"
            data-valor={v}
            aria-checked={elegido}
            tabIndex={elegido ? 0 : -1}
            disabled={deshabilitado}
            onClick={() => onCambiar(v)}
            title={ayuda}
            className={`flex min-w-0 flex-col items-center justify-center rounded-xl border-2 px-1.5 font-semibold outline-none ${
              columnas === 4 ? "h-16 gap-1 text-[13px]" : "gap-0.5 py-2.5 text-sm"
            } transition-colors focus-visible:ring-2 focus-visible:ring-[#4FAEB2] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40 ${
              elegido
                ? "border-[#4FAEB2] bg-[#4FAEB2]/10 text-slate-900"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {/* En la fila de 4 el ícono va arriba: "Transferencia" no entra al lado. */}
            <span className={`flex items-center ${columnas === 4 ? "flex-col gap-1" : "gap-1.5"}`}>
              <Icono className="h-4 w-4 shrink-0" />
              <span className="max-w-full truncate">{texto}</span>
            </span>
            {detalle ? <span className="text-[11px] font-normal text-slate-500">{detalle}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

/**
 * El cliente de la factura, sin salir de la ventana: buscar (Enter elige el
 * marcado, flechas para moverse) o registrarlo ahí mismo.
 */
function ElegirCliente({ caja, onElegido }: { caja: CajaVenta; onElegido: () => void }) {
  const { clientes, error, mutate } = useClientes();
  const [buscando, setBuscando] = useState(!caja.cliente);
  const [registrando, setRegistrando] = useState(false);
  const [query, setQuery] = useState("");
  const [marcado, setMarcado] = useState(0);

  const filtrados = useMemo(() => {
    const q = query.trim().toLowerCase();
    const lista = q
      ? clientes.filter(
          (c) =>
            clienteNombre(c).toLowerCase().includes(q) ||
            (c.ruc ?? "").toLowerCase().includes(q) ||
            (c.documento ?? "").toLowerCase().includes(q) ||
            c.codigo_cliente.toLowerCase().includes(q)
        )
      : clientes;
    return lista.slice(0, 6);
  }, [clientes, query]);

  function elegir(c: Cliente) {
    caja.elegirCliente(c);
    caja.setDocumento("factura");
    setBuscando(false);
    setQuery("");
    setMarcado(0);
    onElegido();
  }

  if (registrando) {
    return (
      <div className="mt-3 rounded-xl border border-slate-200 p-3">
        <NuevoClienteRapido
          onCancelar={() => setRegistrando(false)}
          onCreado={(c) => {
            void mutate();
            setRegistrando(false);
            elegir(c);
          }}
        />
      </div>
    );
  }

  if (caja.cliente && !buscando) {
    return (
      <div className="mt-3 flex items-center gap-3 rounded-xl border-2 border-[#4FAEB2] px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">{clienteNombre(caja.cliente)}</p>
          <p className="truncate text-xs text-slate-500">
            RUC/CI: {caja.cliente.ruc_factura || caja.cliente.ruc || caja.cliente.documento || "—"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setBuscando(true);
            enfocar(() => document.getElementById("cobro-buscar-cliente"));
          }}
          className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          Cambiar
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          id="cobro-buscar-cliente"
          autoComplete="off"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setMarcado(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              setMarcado((i) =>
                e.key === "ArrowDown" ? Math.min(i + 1, filtrados.length - 1) : Math.max(i - 1, 0)
              );
            } else if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) {
              e.preventDefault();
              const c = filtrados[marcado];
              if (c) elegir(c);
            }
          }}
          placeholder="Nombre, RUC o cédula del cliente…"
          className="w-full rounded-lg border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-[#4FAEB2]"
        />
      </div>

      {error ? (
        <p className="mt-2 text-xs text-rose-600">No se pudo cargar la lista de clientes.</p>
      ) : null}

      <ul className="mt-1.5 max-h-48 overflow-y-auto">
        {filtrados.map((c, i) => (
          <li key={c.id}>
            <button
              type="button"
              tabIndex={-1}
              onClick={() => elegir(c)}
              onMouseEnter={() => setMarcado(i)}
              className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left ${
                i === marcado ? "bg-[#4FAEB2]/10" : "hover:bg-slate-50"
              }`}
            >
              <span className="truncate text-sm text-slate-900">{clienteNombre(c)}</span>
              <span className="shrink-0 text-xs text-slate-500">{c.ruc || c.documento || c.codigo_cliente}</span>
            </button>
          </li>
        ))}
        {query.trim() && filtrados.length === 0 ? (
          <li className="px-3 py-2 text-xs text-slate-400">Ningún cliente coincide con “{query.trim()}”.</li>
        ) : null}
      </ul>

      <button
        type="button"
        onClick={() => setRegistrando(true)}
        className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
      >
        <UserPlus className="h-3.5 w-3.5" />
        Registrar nuevo cliente
      </button>
    </div>
  );
}
