"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { INICIO_CAJERO, esSoloCaja, rutaPermitidaCajero } from "@/lib/usuarios/solo-caja";
import { getCurrentUser, getSession } from "@/lib/auth";
import { isBootstrapSuperAdminEmail } from "@/lib/auth/super-admin-bootstrap-email";
import {
  firstAccessibleHref,
  isModuleSlugGranted,
  pathRequiresModuleSlug,
} from "@/lib/modulos/route-slug-map";
import ZentraLoader from "@/components/ZentraLoader";
import { DESKTOP_MIN_WIDTH_PX, DEVICE_COOKIE_NAME } from "@/shared/device/detect";
import { canonicalErpRol } from "@/lib/usuarios/erp-rol-normalize";
import { BootProvider } from "@/components/BootContext";

const PUBLIC_ROUTES = ["/login"];

/**
 * En el celular la home (`/`) es el menú operativo, no el dashboard de KPIs:
 * no pide el módulo Dashboard (el menú ya muestra solo lo que el usuario
 * puede usar). Antes el repartidor, sin ese módulo, caía siempre en Reportes.
 */
function esCelular(): boolean {
  if (typeof window === "undefined") return false;
  if (document.cookie.split("; ").includes(`${DEVICE_COOKIE_NAME}=mobile`)) return true;
  return window.innerWidth < DESKTOP_MIN_WIDTH_PX;
}

/** A dónde mandar a quien no puede entrar a la ruta pedida. */
function destinoInicial(access: ModuleAccess): string {
  // El repartidor trabaja vendiendo: su inicio es Ventas, no los reportes.
  if (canonicalErpRol(access.rol) === "vendedor_movil" && isModuleSlugGranted("ventas", access.slugs)) {
    return esCelular() ? "/" : "/ventas";
  }
  return firstAccessibleHref(access.slugs, { superAdmin: access.superAdmin });
}

type ModuleAccess = { superAdmin: boolean; slugs: Set<string>; rol: string | null };

/**
 * AuthGuard NO bloqueante.
 *
 * Antes: mostraba un overlay (`ZentraLoader`) hasta completar 2-3 roundtrips
 * serializados (getSession, /api/empresas/module-access, getCurrentUser),
 * Y ADEMÁS esperaba a `sidebarReady` — el Sidebar repetía los MISMOS fetches.
 * En mobile el Sidebar no existe, así que el loader quedaba colgado para siempre.
 *
 * Ahora: renderizamos children inmediatamente. La sesión y los módulos se
 * verifican en background. Si no hay sesión → redirect a /login. Si el path
 * no está permitido para el rol → redirect al primer accesible. Hasta que se
 * resuelva, la pantalla se ve y se puede usar (las páginas tienen sus propios
 * skeletons mientras llegan los datos).
 */
function AuthGuardInner({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [access, setAccess] = useState<ModuleAccess | null>(null);
  const [sessionMissing, setSessionMissing] = useState(false);
  const checkInFlight = useRef(false);

  const isPublic = useMemo(
    () => !!(pathname && PUBLIC_ROUTES.includes(pathname)),
    [pathname]
  );

  useEffect(() => {
    if (isPublic) {
      setAccess(null);
      setSessionMissing(false);
      return;
    }
    if (checkInFlight.current) return;
    checkInFlight.current = true;

    let cancelled = false;

    async function checkAuthAndModules() {
      const session = await getSession();
      if (cancelled) return;
      if (!session) {
        setSessionMissing(true);
        router.push("/login");
        return;
      }

      const res = await fetchWithSupabaseSession("/api/empresas/module-access", {
        cache: "no-store",
      });
      if (cancelled) return;

      let superAdmin = false;
      let slugs: string[] = [];
      let rol: string | null = null;

      const bootstrapSuper = isBootstrapSuperAdminEmail(session.user.email ?? null);

      if (res.ok) {
        const data = (await res.json()) as {
          superAdmin?: boolean;
          slugs?: string[];
          rol?: string | null;
        };
        superAdmin = !!data.superAdmin || bootstrapSuper;
        slugs = Array.isArray(data.slugs) ? data.slugs : [];
        rol = data.rol ?? null;
      } else {
        superAdmin = bootstrapSuper;
      }

      if (!superAdmin) {
        try {
          const cu = await getCurrentUser();
          if ((cu?.rol ?? "").trim() === "super_admin") superAdmin = true;
        } catch {
          /* sin fila usuarios en cliente */
        }
      }

      if (!cancelled) {
        setAccess({ superAdmin, slugs: new Set(slugs), rol });
      }
    }

    void checkAuthAndModules();
    return () => {
      cancelled = true;
      checkInFlight.current = false;
    };
  }, [isPublic, router]);

  // Redirect por permisos cuando llega `access`. No bloquea render mientras tanto.
  useEffect(() => {
    if (isPublic || !access || !pathname) return;

    // Cajero: solo la caja. Cualquier otra pantalla lo devuelve ahí.
    if (!access.superAdmin && esSoloCaja(access.rol)) {
      if (!rutaPermitidaCajero(pathname)) router.replace(INICIO_CAJERO);
      return;
    }

    if (pathname.startsWith("/admin") && !access.superAdmin) {
      router.replace(destinoInicial({ ...access, superAdmin: false }));
      return;
    }

    // Home en el celular: el menú operativo, sin gate de Dashboard.
    if (pathname === "/" && esCelular()) return;

    const slug = pathRequiresModuleSlug(pathname);
    if (slug && !access.superAdmin && !isModuleSlugGranted(slug, access.slugs)) {
      const dest = destinoInicial(access);
      if (dest !== pathname.split("?")[0]) router.replace(dest);
    }
  }, [pathname, access, isPublic, router]);

  // SOLO mostramos loader si confirmamos que no hay sesión y vamos a /login.
  // Para el flujo normal: la app es visible desde el primer paint.
  if (sessionMissing && !isPublic) {
    return <ZentraLoader overlay />;
  }

  return <>{children}</>;
}

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  return (
    <BootProvider>
      <AuthGuardInner>{children}</AuthGuardInner>
    </BootProvider>
  );
}
