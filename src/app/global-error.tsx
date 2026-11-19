"use client";

import { useEffect } from "react";

/**
 * Pantalla de error de toda la aplicación.
 *
 * Sin esto, una excepción del navegador (por ejemplo en una tablet con un navegador viejo)
 * deja la pantalla en blanco con "Application error: a client-side exception has occurred",
 * sin forma de seguir ni de saber qué pasó. Acá se puede reintentar, limpiar los datos que el
 * sistema guarda en el dispositivo (caché y tipo de pantalla) y leer el mensaje para contarlo.
 *
 * Se arma con estilos en línea y sin componentes del sistema: reemplaza al layout raíz, así que
 * no puede depender de nada que haya podido fallar.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] pantalla caída:", error);
  }, [error]);

  const limpiarYRecargar = () => {
    try {
      window.localStorage.removeItem("neura-swr-cache-v1");
    } catch {
      /* sin acceso a localStorage */
    }
    try {
      document.cookie = "neura-device=; path=/; max-age=0; SameSite=Lax";
    } catch {
      /* sin acceso a cookies */
    }
    window.location.reload();
  };

  const boton = {
    width: "100%",
    padding: "12px 0",
    borderRadius: 12,
    fontSize: 14,
    fontWeight: 600,
    border: "1px solid #e2e8f0",
    background: "#fff",
    color: "#475569",
  } as const;

  return (
    <html lang="es">
      <body style={{ margin: 0, fontFamily: "system-ui, -apple-system, sans-serif" }}>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            textAlign: "center",
          }}
        >
          <h1 style={{ fontSize: 18, fontWeight: 700, color: "#0f172a", margin: 0 }}>
            No se pudo abrir el sistema
          </h1>
          <p style={{ maxWidth: 360, fontSize: 14, color: "#64748b", marginTop: 8 }}>
            Se cortó al cargar la pantalla. Probá de nuevo; si sigue igual, tocá &quot;Limpiar y
            recargar&quot; y, si aún así falla, pasá el detalle de abajo.
          </p>
          <pre
            style={{
              maxWidth: "100%",
              overflowX: "auto",
              background: "#f1f5f9",
              color: "#475569",
              fontSize: 11,
              padding: 12,
              borderRadius: 8,
              textAlign: "left",
              whiteSpace: "pre-wrap",
            }}
          >
            {error?.message}
            {error?.digest ? `\n(${error.digest})` : ""}
          </pre>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%", maxWidth: 320, marginTop: 16 }}>
            <button
              type="button"
              onClick={reset}
              style={{ ...boton, background: "#4FAEB2", color: "#fff", border: "none" }}
            >
              Reintentar
            </button>
            <button type="button" onClick={limpiarYRecargar} style={boton}>
              Limpiar y recargar
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
