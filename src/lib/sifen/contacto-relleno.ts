/**
 * Valores de relleno cuando la empresa todavía no cargó su teléfono o su
 * correo: el XML de la SET exige los dos. El KuDE no muestra el correo de
 * relleno ni el teléfono de relleno.
 */
export const TELEFONO_RELLENO = "021000000";
export const EMAIL_RELLENO = "facturacion@configurar-empresa.com.py";

/** El dato sirve para mostrarse en el KuDE (no está vacío ni es de relleno). */
export function emailVisible(email: string | null | undefined): string | null {
  const e = (email ?? "").trim();
  return e && e.toLowerCase() !== EMAIL_RELLENO ? e : null;
}

export function telefonoVisible(tel: string | null | undefined): string | null {
  const t = (tel ?? "").trim();
  return t && t.replace(/\D/g, "") !== TELEFONO_RELLENO ? t : null;
}
