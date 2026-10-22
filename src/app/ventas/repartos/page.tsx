import { redirect } from "next/navigation";

/** Los repartos ya no existen: los camiones se manejan en su propio módulo. */
export default function Page() {
  redirect("/camiones");
}
