"use client";

import { useCallback, useMemo, useState } from "react";
import { useRepartos } from "@/shared/hooks/useRepartos";
import { saveVenta } from "@/lib/ventas/storage";
import { clienteNombre } from "@/lib/clientes/storage";
import type { Cliente } from "@/lib/clientes/types";
import type { Producto } from "@/lib/inventario/types";
import type {
  FormaPagoVenta,
  LineaVenta,
  MonedaVenta,
  TipoIvaVenta,
  Venta,
} from "@/lib/ventas/types";

/**
 * Estado y reglas del flujo de caja, compartidos por la versión mobile y la
 * desktop. Las dos pantallas son presentación: acá vive todo lo que decide.
 *
 * Pasos: cliente → productos → resumen → pago → comprobante.
 */
export type PasoCaja = "cliente" | "productos" | "resumen" | "pago" | "listo";

export const PASOS_CAJA: { id: PasoCaja; label: string }[] = [
  { id: "cliente", label: "Cliente" },
  { id: "productos", label: "Productos" },
  { id: "resumen", label: "Resumen" },
  { id: "pago", label: "Pago" },
];

/** Un renglón del carrito antes de convertirse en `LineaVenta`. */
export type ItemCarrito = {
  producto: Producto;
  cantidad: number;
  tipoIva: TipoIvaVenta;
};

export function calcIva(tipo: TipoIvaVenta, base: number): number {
  if (tipo === "EXENTA") return 0;
  if (tipo === "5%") return base * 0.05;
  return base * 0.1;
}

export function formatGs(valor: number): string {
  return `Gs. ${Math.round(valor).toLocaleString("es-PY")}`;
}

export function useCajaVenta() {
  const [paso, setPaso] = useState<PasoCaja>("cliente");

  // ── Cliente ────────────────────────────────────────────────────────────────
  // `null` con sinNombre=true es una venta sin cliente identificado; `null` con
  // sinNombre=false es "todavía no eligió" y no deja avanzar.
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [sinNombre, setSinNombre] = useState(false);

  // ── Carrito ────────────────────────────────────────────────────────────────
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);

  // ── Condiciones ────────────────────────────────────────────────────────────
  const [moneda, setMoneda] = useState<MonedaVenta>("GS");
  const [tipoCambio, setTipoCambio] = useState("");
  const [formaPago, setFormaPago] = useState<FormaPagoVenta | null>(null);
  const [plazoDias, setPlazoDias] = useState("");

  // ── Reparto ────────────────────────────────────────────────────────────────
  // Si hay repartos abiertos, la venta tiene que salir de uno: es lo que después
  // permite el control de mercadería. Con un solo camión se elige solo; con
  // varios lo decide el cajero, porque adivinar descuadraría al otro camión.
  const { repartos: repartosAbiertos, disponible: repartosDisponibles } = useRepartos({
    abiertos: true,
  });
  const [repartoElegido, setRepartoId] = useState<string | null>(null);

  // Derivado y no estado sincronizado: si el reparto elegido se cierra desde
  // otro lado, la venta no queda apuntando a un camión que ya volvió.
  const repartoId = useMemo(() => {
    if (repartoElegido && repartosAbiertos.some((r) => r.id === repartoElegido)) {
      return repartoElegido;
    }
    if (repartosAbiertos.length === 1) return repartosAbiertos[0].id;
    return null;
  }, [repartoElegido, repartosAbiertos]);

  /** Hay varios camiones en la calle y todavía no se eligió de cuál sale. */
  const faltaElegirReparto = repartosAbiertos.length > 1 && repartoId === null;

  // ── Envío ──────────────────────────────────────────────────────────────────
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ventaCreada, setVentaCreada] = useState<Venta | null>(null);

  const tipoCambioNum = moneda === "USD" ? parseFloat(tipoCambio) || 0 : 1;

  // ── Acciones de carrito ────────────────────────────────────────────────────

  const cantidadDe = useCallback(
    (productoId: string) => carrito.find((i) => i.producto.id === productoId)?.cantidad ?? 0,
    [carrito]
  );

  /** Suma (o resta, con delta negativo) respetando el stock disponible. */
  const cambiarCantidad = useCallback((producto: Producto, delta: number) => {
    setError(null);
    setCarrito((prev) => {
      const idx = prev.findIndex((i) => i.producto.id === producto.id);
      const actual = idx === -1 ? 0 : prev[idx].cantidad;
      const propuesta = actual + delta;

      // El tope es el stock: la venta la rechazaría el servidor igual, y es mejor
      // que el cajero lo vea al tocar el botón y no al confirmar.
      const siguiente = Math.max(0, Math.min(propuesta, producto.stock_actual));

      if (siguiente === 0) return prev.filter((i) => i.producto.id !== producto.id);
      if (idx === -1) return [...prev, { producto, cantidad: siguiente, tipoIva: "10%" }];
      const copia = [...prev];
      copia[idx] = { ...copia[idx], cantidad: siguiente };
      return copia;
    });
  }, []);

  const fijarCantidad = useCallback((producto: Producto, cantidad: number) => {
    setError(null);
    const limpia = Math.max(0, Math.min(Math.floor(cantidad) || 0, producto.stock_actual));
    setCarrito((prev) => {
      if (limpia === 0) return prev.filter((i) => i.producto.id !== producto.id);
      const idx = prev.findIndex((i) => i.producto.id === producto.id);
      if (idx === -1) return [...prev, { producto, cantidad: limpia, tipoIva: "10%" }];
      const copia = [...prev];
      copia[idx] = { ...copia[idx], cantidad: limpia };
      return copia;
    });
  }, []);

  const quitarItem = useCallback((productoId: string) => {
    setCarrito((prev) => prev.filter((i) => i.producto.id !== productoId));
  }, []);

  const cambiarIva = useCallback((productoId: string, tipoIva: TipoIvaVenta) => {
    setCarrito((prev) =>
      prev.map((i) => (i.producto.id === productoId ? { ...i, tipoIva } : i))
    );
  }, []);

  // ── Totales ────────────────────────────────────────────────────────────────

  const lineas: LineaVenta[] = useMemo(() => {
    return carrito.map((item) => {
      // El catálogo guarda el precio en guaraníes. Con moneda USD, el original es
      // el equivalente en dólares y el importe en GS se mantiene exacto.
      const precioGs = item.producto.precio_venta;
      const precioOriginal =
        moneda === "USD" && tipoCambioNum > 0 ? precioGs / tipoCambioNum : precioGs;

      const subtotal = precioGs * item.cantidad;
      const montoIva = calcIva(item.tipoIva, subtotal);

      return {
        producto_id: item.producto.id,
        producto_nombre: item.producto.nombre,
        sku: item.producto.sku,
        cantidad: item.cantidad,
        precio_venta_original: precioOriginal,
        precio_venta: precioGs,
        tipo_iva: item.tipoIva,
        subtotal,
        monto_iva: montoIva,
        total_linea: subtotal + montoIva,
      };
    });
  }, [carrito, moneda, tipoCambioNum]);

  const totales = useMemo(() => {
    const subtotal = lineas.reduce((acc, l) => acc + l.subtotal, 0);
    const montoIva = lineas.reduce((acc, l) => acc + l.monto_iva, 0);
    return {
      subtotal,
      montoIva,
      total: subtotal + montoIva,
      unidades: carrito.reduce((acc, i) => acc + i.cantidad, 0),
      renglones: carrito.length,
    };
  }, [lineas, carrito]);

  // ── Reglas de avance ───────────────────────────────────────────────────────

  const clienteElegido = cliente !== null || sinNombre;
  const esCredito = formaPago === "credito";

  /** El crédito necesita a quién cobrarle: sin cliente identificado no se ofrece. */
  const creditoDisponible = cliente !== null;

  const puedeAvanzar = useMemo(() => {
    if (paso === "cliente") return clienteElegido;
    if (paso === "productos") return carrito.length > 0;
    if (paso === "resumen") return carrito.length > 0 && (moneda === "GS" || tipoCambioNum > 0);
    if (paso === "pago") {
      if (formaPago === null) return false;
      if (esCredito && !creditoDisponible) return false;
      if (faltaElegirReparto) return false;
      return true;
    }
    return false;
  }, [
    paso,
    clienteElegido,
    carrito.length,
    moneda,
    tipoCambioNum,
    formaPago,
    esCredito,
    creditoDisponible,
    faltaElegirReparto,
  ]);

  /**
   * Regla única de "la venta se puede cobrar". La mobile llega acá paso a paso;
   * la desktop tiene todo a la vista y la evalúa de una. Si viviera duplicada en
   * cada pantalla, una de las dos se iba a quedar atrás.
   */
  const puedeConfirmar = useMemo(() => {
    if (!clienteElegido) return false;
    if (carrito.length === 0) return false;
    if (moneda === "USD" && tipoCambioNum <= 0) return false;
    if (formaPago === null) return false;
    if (formaPago === "credito" && !creditoDisponible) return false;
    if (faltaElegirReparto) return false;
    return true;
  }, [
    clienteElegido,
    carrito.length,
    moneda,
    tipoCambioNum,
    formaPago,
    creditoDisponible,
    faltaElegirReparto,
  ]);

  const elegirCliente = useCallback((c: Cliente) => {
    setCliente(c);
    setSinNombre(false);
  }, []);

  const elegirSinNombre = useCallback(() => {
    setCliente(null);
    setSinNombre(true);
    // Sin cliente identificado no hay a quién darle crédito.
    setFormaPago((actual) => (actual === "credito" ? null : actual));
  }, []);

  const irA = useCallback((destino: PasoCaja) => {
    setError(null);
    setPaso(destino);
  }, []);

  const siguiente = useCallback(() => {
    setError(null);
    setPaso((p) =>
      p === "cliente" ? "productos" : p === "productos" ? "resumen" : p === "resumen" ? "pago" : p
    );
  }, []);

  const volver = useCallback(() => {
    setError(null);
    setPaso((p) =>
      p === "pago" ? "resumen" : p === "resumen" ? "productos" : p === "productos" ? "cliente" : p
    );
  }, []);

  // ── Confirmación ───────────────────────────────────────────────────────────

  const confirmar = useCallback(async () => {
    if (guardando) return;
    if (carrito.length === 0) {
      setError("Agregá al menos un producto.");
      return;
    }
    if (formaPago === null) {
      setError("Elegí una forma de pago.");
      return;
    }
    if (formaPago === "credito" && !creditoDisponible) {
      setError("El crédito requiere un cliente identificado.");
      return;
    }
    if (moneda === "USD" && tipoCambioNum <= 0) {
      setError("Ingresá el tipo de cambio.");
      return;
    }
    if (faltaElegirReparto) {
      setError("Elegí de qué camión sale la mercadería.");
      return;
    }

    setGuardando(true);
    setError(null);

    const plazo = formaPago === "credito" ? parseInt(plazoDias, 10) : NaN;

    const res = await saveVenta({
      items: lineas,
      moneda,
      tipo_cambio: tipoCambioNum,
      subtotal: totales.subtotal,
      monto_iva: totales.montoIva,
      total: totales.total,
      tipo_venta: formaPago === "credito" ? "CREDITO" : "CONTADO",
      plazo_dias: Number.isFinite(plazo) && plazo > 0 ? plazo : undefined,
      forma_pago: formaPago,
      reparto_id: repartoId,
      cliente_id: cliente?.id ?? null,
    });

    setGuardando(false);

    if (!res.success) {
      setError(res.error);
      return;
    }

    setVentaCreada(res.venta);
    setPaso("listo");
  }, [
    guardando,
    carrito.length,
    formaPago,
    creditoDisponible,
    moneda,
    tipoCambioNum,
    plazoDias,
    lineas,
    totales,
    cliente,
    repartoId,
    faltaElegirReparto,
  ]);

  const reiniciar = useCallback(() => {
    setPaso("cliente");
    setCliente(null);
    setSinNombre(false);
    setCarrito([]);
    setMoneda("GS");
    setTipoCambio("");
    setFormaPago(null);
    setPlazoDias("");
    setError(null);
    setVentaCreada(null);
    // El reparto no se limpia: sigue siendo el mismo camión en la calle.
  }, []);

  const nombreCliente = cliente ? clienteNombre(cliente) : "Sin nombre";

  return {
    // estado
    paso,
    cliente,
    sinNombre,
    nombreCliente,
    carrito,
    lineas,
    totales,
    moneda,
    tipoCambio,
    tipoCambioNum,
    formaPago,
    plazoDias,
    guardando,
    error,
    ventaCreada,
    repartosAbiertos,
    repartosDisponibles,
    repartoId,
    faltaElegirReparto,
    // reglas
    puedeAvanzar,
    puedeConfirmar,
    creditoDisponible,
    // acciones
    elegirCliente,
    elegirSinNombre,
    cantidadDe,
    cambiarCantidad,
    fijarCantidad,
    quitarItem,
    cambiarIva,
    setMoneda,
    setTipoCambio,
    setFormaPago,
    setPlazoDias,
    setRepartoId,
    setError,
    irA,
    siguiente,
    volver,
    confirmar,
    reiniciar,
  };
}

export type CajaVenta = ReturnType<typeof useCajaVenta>;
