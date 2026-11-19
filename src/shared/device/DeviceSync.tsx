"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { DESKTOP_MIN_WIDTH_PX, DEVICE_COOKIE_NAME } from "./detect";

/**
 * Corrige la cookie `neura-device` en pantallas táctiles (tablets).
 *
 * El iPad se presenta como Mac y el servidor lo tomaba como computadora aunque su
 * pantalla sea de tablet. Acá se mide el ancho real: táctil y < 1024px → mobile.
 * Solo actúa en dispositivos táctiles, así una computadora con la ventana chica no
 * cambia de pantalla. Todo va protegido: si el navegador no soporta algo, no hace nada
 * (nunca debe tirar la pantalla).
 */
export default function DeviceSync() {
  const router = useRouter();

  useEffect(() => {
    try {
      if (typeof window.matchMedia !== "function") return;
      if (!window.matchMedia("(pointer: coarse)").matches) return;
      const quiere = window.innerWidth < DESKTOP_MIN_WIDTH_PX ? "mobile" : "desktop";
      const actual = document.cookie
        .split("; ")
        .find((c) => c.startsWith(`${DEVICE_COOKIE_NAME}=`))
        ?.split("=")[1];
      if (actual === quiere) return;
      document.cookie = `${DEVICE_COOKIE_NAME}=${quiere}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
      router.refresh();
    } catch {
      /* sin soporte: se queda como está */
    }
  }, [router]);

  return null;
}
