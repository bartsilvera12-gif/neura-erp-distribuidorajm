import DeviceRouter from "@/shared/device/DeviceRouter";
import ArqueoDesktop from "@/desktop/pages/ArqueoDesktop";
import ArqueoMobile from "@/mobile/pages/ArqueoMobile";

/** Arqueo de caja: cierre del día por medio de cobro. */
export default function Page() {
  return <DeviceRouter desktop={<ArqueoDesktop />} mobile={<ArqueoMobile />} />;
}
