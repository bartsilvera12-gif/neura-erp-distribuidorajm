import { getDeviceTypeFromRequest } from "@/shared/device/server";
import DashboardDesktop from "@/desktop/pages/DashboardDesktop";
import MenuOperativoMobile from "@/mobile/pages/MenuOperativoMobile";

/**
 * Home.
 *
 * En el celular la home no es el dashboard de KPIs sino el menú operativo: el
 * ERP móvil lo usa el repartidor en la calle, donde lo que hace falta es
 * facturar, cobrar y ver el camión, no leer indicadores. Los números están en
 * Reportes, a un toque de la barra inferior.
 *
 * Desktop sigue con el dashboard de siempre.
 */
export default async function Page() {
  const device = await getDeviceTypeFromRequest();
  if (device === "mobile") {
    return <MenuOperativoMobile />;
  }
  return <DashboardDesktop />;
}
