import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Qué commit y cuándo se construyó esto. Se resuelve en build porque en
   * runtime no queda rastro, y sin esto "¿está deployado?" solo se puede
   * discutir: ahora se mira en /api/deploy-info y se compara con el commit.
   */
  env: {
    NEXT_PUBLIC_BUILD_SHA:
      process.env.SOURCE_COMMIT ||
      process.env.COOLIFY_GIT_COMMIT_SHA ||
      process.env.GIT_COMMIT_SHA ||
      process.env.VERCEL_GIT_COMMIT_SHA ||
      "",
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
  },

  /**
   * Salida standalone: genera .next/standalone con server.js y solo el subconjunto
   * de node_modules que el trazado de Next detecta como necesario. La imagen final
   * deja de arrastrar todo el proyecto → "exporting layers" mucho más corta.
   * Arranca con `node server.js` (no `next start`).
   */
  output: "standalone",
  /**
   * El host de build self-hosted (Coolify/nixpacks) tiene RAM acotada y el
   * OOM-killer mata la fase "Running TypeScript"/ESLint de `next build`
   * (SIGKILL, exit 255) en builds fríos con dependencias pesadas (recharts).
   * La validez de tipos y lint se garantiza fuera del build de producción
   * con `npm run build` / `tsc --noEmit` / `npm run lint` en local/CI (corren
   * en verde sobre este commit). Por eso se omite esa fase en el build del
   * servidor para que el deploy no caiga por memoria. Revisar si se agrega
   * swap/upgrade de RAM al host de build → reactivar.
   */
  typescript: { ignoreBuildErrors: true },
  /**
   * Ayuda en línea, apagada para Distribuidora JM.
   *
   * El módulo existe en el código pero sus cinco tablas (`ayuda_articulos`,
   * `ayuda_categorias`, `ayuda_articulo_versiones`, `ayuda_articulo_adjuntos`,
   * `ayuda_articulo_feedback`) no están en este schema, así que entrar solo
   * puede terminar en un error. Se saca la tarjeta de Configuración y se
   * cierran también las URLs, porque ocultar el botón no alcanza: la dirección
   * escrita a mano seguiría llegando.
   *
   * Para reactivarlo: crear esas tablas, borrar este bloque y devolver la
   * tarjeta "Ayuda en línea" en ConfiguracionDesktop.
   */
  async redirects() {
    return [
      { source: "/configuracion/ayuda", destination: "/configuracion", permanent: false },
      { source: "/configuracion/ayuda/:path*", destination: "/configuracion", permanent: false },
      { source: "/ayuda", destination: "/dashboard", permanent: false },
      { source: "/ayuda/:path*", destination: "/dashboard", permanent: false },
      // Campañas Meta: mide avisos de Facebook/Instagram contra conversaciones
      // de WhatsApp. Es del ERP de la agencia y no aplica a una distribuidora.
      // Ocultar la tarjeta no alcanza: la URL escrita a mano seguiría llegando.
      // Esta pantalla era un cartel de "en preparación" y duplicaba el nombre
      // de la Conciliación bancaria de Cobranzas, que sí funciona. Se manda a
      // la de verdad en vez de dejar a alguien mirando un cartel.
      { source: "/reportes/conciliacion", destination: "/cobranzas/conciliacion", permanent: false },
      { source: "/reportes/campanas-meta", destination: "/reportes", permanent: false },
      { source: "/reportes/campanas-meta/:path*", destination: "/reportes", permanent: false },
    ];
  },
};

export default nextConfig;
