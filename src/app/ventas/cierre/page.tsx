import { redirect } from "next/navigation";

/** Sin repartos no hay cierre de reparto: el conteo del camión está en Camiones. */
export default function Page() {
  redirect("/camiones");
}
