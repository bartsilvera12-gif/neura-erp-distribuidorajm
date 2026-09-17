"use client";

import { usePathname } from "next/navigation";
import BottomNav from "./BottomNav";
import MobileHeader from "./MobileHeader";
import { useTecladoVirtual } from "@/shared/hooks/useTecladoVirtual";
import CapacitorPushRegister from "@/components/CapacitorPushRegister";

const STANDALONE_ROUTES = ["/login"];

/**
 * Shell mobile del ERP. Liviano — sin framer-motion.
 *
 *  ┌──────────────────────────────┐
 *  │  MobileHeader (sticky top)   │
 *  ├──────────────────────────────┤
 *  │      Contenido (main)        │
 *  ├──────────────────────────────┤
 *  │  BottomNav (fixed bottom)    │
 *  └──────────────────────────────┘
 *
 *  Sin menú lateral: la navegación mobile es el menú de tiles de Inicio más la
 *  barra inferior, como el ERP de reparto del cliente. El sheet lateral quedó
 *  sin forma de abrirse y se eliminó; está en el historial si hace falta.
 */
export default function MobileAppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const teclado = useTecladoVirtual();
  // /m/* = app móvil del asesor (Capacitor/APK): pantalla completa, sin header/bottom-nav del ERP.
  const isStandalone =
    !!pathname && (STANDALONE_ROUTES.includes(pathname) || pathname.startsWith("/m/"));
  if (isStandalone) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-svh min-h-0 flex-col overflow-hidden bg-[#F8FAFC]">
      {/*
        Registro de push dentro de la APK. Vive acá y no en una pantalla puntual
        porque el shell persiste entre navegaciones: si se monta en una page, al
        salir de ella el cleanup remueve el listener `registration` y el token
        nunca llega. No entra en /login ni /m/* (esas rutas salen por isStandalone).
        En navegador es no-op: el componente chequea Capacitor.isNativePlatform().
      */}
      <CapacitorPushRegister />

      {/* Con el teclado abierto, cada barra fija se come lo poco que queda:
          la de la app se va igual que la de abajo y vuelve al cerrarlo. */}
      {teclado ? null : <MobileHeader />}

      <main
        className={`min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain ${
          teclado ? "pb-2" : "pb-16"
        }`}
      >
        {children}
      </main>

      <BottomNav />
    </div>
  );
}
