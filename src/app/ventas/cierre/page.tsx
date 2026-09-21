import DeviceRouter from "@/shared/device/DeviceRouter";
import CierreRepartoDesktop from "@/desktop/pages/CierreRepartoDesktop";
import CierreRepartoMobile from "@/mobile/pages/CierreRepartoMobile";

/** Cierre de reparto: lo vendido y lo cobrado en el día. */
export default function Page() {
  return <DeviceRouter desktop={<CierreRepartoDesktop />} mobile={<CierreRepartoMobile />} />;
}
