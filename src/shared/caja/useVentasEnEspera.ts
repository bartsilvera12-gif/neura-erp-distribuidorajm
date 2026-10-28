"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Ventas en espera: ventas que el cajero deja guardadas para atender a otro
 * cliente y retomar después. Viven en ESTE equipo (localStorage), no en el
 * servidor: son de esta caja y de este momento, así funcionan sin depender de
 * la conexión y siguen ahí aunque se cierre el navegador. `S` es la foto de la
 * venta (el estado de la caja), que el que llama arma y vuelve a aplicar.
 */
export interface VentaEnEspera<S> {
  id: string;
  /** Nombre del cliente (o "Sin nombre") para reconocerla en la lista. */
  etiqueta: string;
  /** Total de la venta al suspenderla, para mostrarlo en la lista. */
  total: number;
  /** Cuándo se suspendió (epoch ms). */
  hora: number;
  /** La venta entera, para volver a cargarla tal cual. */
  snapshot: S;
}

const KEY = "caja:ventas-en-espera:v1";

/*
 * Store externo (al estilo de `useSyncExternalStore`): la lista vive una sola
 * vez en memoria, respaldada en localStorage, y todas las cajas de esta pantalla
 * la comparten. Se lee en el cliente la primera vez que se la pide; en el
 * servidor es siempre vacía, que es lo que ve el primer render.
 */
const VACIO: VentaEnEspera<unknown>[] = [];
let lista: VentaEnEspera<unknown>[] = VACIO;
let cargado = false;
const escuchas = new Set<() => void>();

function nuevoId(): string {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    // Sin crypto: un id casero alcanza, solo tiene que ser único en la lista.
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Carga desde localStorage una sola vez (en el cliente). */
function asegurarCargado(): void {
  if (cargado) return;
  cargado = true;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) lista = arr as VentaEnEspera<unknown>[];
  } catch {
    // Sin almacenamiento o dato corrupto: queda la lista vacía.
  }
}

function escribir(next: VentaEnEspera<unknown>[]): void {
  lista = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Sin almacenamiento la lista vale para esta sesión nomás.
  }
  for (const cb of escuchas) cb();
}

function subscribe(cb: () => void): () => void {
  escuchas.add(cb);
  return () => escuchas.delete(cb);
}

function getSnapshot(): VentaEnEspera<unknown>[] {
  asegurarCargado();
  return lista;
}

function getServerSnapshot(): VentaEnEspera<unknown>[] {
  return VACIO;
}

export function useVentasEnEspera<S>() {
  const ventas = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot
  ) as VentaEnEspera<S>[];

  const suspender = useCallback((v: Omit<VentaEnEspera<S>, "id" | "hora">): void => {
    asegurarCargado();
    escribir([
      ...lista,
      { ...(v as Omit<VentaEnEspera<unknown>, "id" | "hora">), id: nuevoId(), hora: Date.now() },
    ]);
  }, []);

  const quitar = useCallback((id: string): void => {
    asegurarCargado();
    escribir(lista.filter((x) => x.id !== id));
  }, []);

  return { ventas, suspender, quitar };
}
