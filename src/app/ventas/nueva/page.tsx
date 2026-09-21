import DeviceRouter from "@/shared/device/DeviceRouter";
import CajaDesktop from "@/desktop/pages/CajaDesktop";
import CajaMobile from "@/mobile/pages/CajaMobile";

/**
 * Caja: cobro de una venta. DeviceRouter elige desktop vs mobile.
 *
 * Mobile = asistente por pasos (cliente → productos → resumen → pago), pensado
 * para el pulgar. Desktop = catálogo y carrito lado a lado, todo a la vista.
 * Las dos comparten las reglas en `@/shared/caja/useCajaVenta`.
 */
export default function Page() {
  return <DeviceRouter desktop={<CajaDesktop />} mobile={<CajaMobile />} />;
}
