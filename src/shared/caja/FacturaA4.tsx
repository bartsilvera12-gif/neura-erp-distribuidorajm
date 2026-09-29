import { formatCantidad } from "@/lib/inventario/unidades";
import {
  LOGO_FACTURA,
  columnasIva,
  esFacturaLegal,
  fechaCorta,
  fechaHoraEmision,
  miles,
  numeroFactura,
  ubicacionEmisor,
  vencimiento,
  type DatosComprobante,
} from "@/lib/ventas/comprobante";

/**
 * La factura en hoja A4, con el formato que usan los proveedores (el KuDE de
 * la SET): recuadro del emisor con logo, RUC y timbrado; recuadro del cliente
 * con la condición de venta; detalle con las columnas Exentas / 5% / 10% a lo
 * alto de la hoja, y abajo los totales y la liquidación del IVA.
 *
 * Es lo que sale por la impresora (en pantalla se sigue viendo la tarjeta, que
 * en un celular se lee mejor). No lleva CDC ni QR: son de la factura
 * electrónica, y esta no pasa por SIFEN.
 */

/** Ancho de cada columna del detalle, en %. Los totales usan los mismos. */
const COLS = [
  { key: "cod", titulo: "Cod.", ancho: 5.5 },
  { key: "cant", titulo: "Cantidad", ancho: 8.5 },
  { key: "desc", titulo: "Descripción", ancho: 32 },
  { key: "precio", titulo: "Precio unitario", ancho: 13 },
  { key: "dto", titulo: "Descuento", ancho: 9.5 },
  { key: "exentas", titulo: "Exentas", ancho: 9 },
  { key: "cinco", titulo: "5%", ancho: 11.25 },
  { key: "diez", titulo: "10%", ancho: 11.25 },
] as const;

type Col = (typeof COLS)[number]["key"];
const DERECHA = new Set<Col>([
  "cant",
  "precio",
  "dto",
  "exentas",
  "cinco",
  "diez",
]);

export default function FacturaA4({ datos }: { datos: DatosComprobante }) {
  const { venta, emisor } = datos;
  const legal = esFacturaLegal(emisor);
  const emision = fechaHoraEmision(venta.fecha);
  const col = columnasIva(venta);
  const credito = venta.tipo_venta === "CREDITO";
  const vence = vencimiento(venta);
  const ubicacion = ubicacionEmisor(emisor);
  const titulo = legal ? "Factura" : "Comprobante de venta";

  // Borde izquierdo de cada columna, para las líneas verticales a lo alto.
  const bordes: number[] = [];
  COLS.slice(0, -1).reduce((x, c) => {
    bordes.push(x + c.ancho);
    return x + c.ancho;
  }, 0);

  return (
    <>
      {/* A4 solo mientras hay una factura en pantalla: un @page global
          cambiaría el papel de todo lo demás que se imprime. */}
      <style>{`@media print { @page { size: A4; margin: 10mm; } }`}</style>
      <article className="factura-a4 flex min-h-[277mm] flex-col font-[Arial,Helvetica,sans-serif] text-[9pt] leading-snug text-black">
        {/* ── Emisor ─────────────────────────────────────────────────────── */}
        <section className="flex items-start gap-3 border-2 border-black px-3 py-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO_FACTURA} alt="" className="h-[22mm] w-auto shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-bold">{titulo}</p>
            <p className="mt-2 uppercase">
              {emisor?.razon_social ??
                emisor?.nombre_fantasia ??
                "Distribuidora JM"}
            </p>
            {emisor?.actividad_economica ? (
              <p>{emisor.actividad_economica}</p>
            ) : null}
            {ubicacion ? <p>{ubicacion}</p> : null}
            {emisor?.telefono ? <p>Tel: {emisor.telefono}</p> : null}
            {emisor?.email ? <p>{emisor.email}</p> : null}
          </div>
          <div className="w-[58mm] shrink-0">
            {emisor?.ruc ? (
              <p>
                <b>RUC:</b> {emisor.ruc}
              </p>
            ) : null}
            {legal ? (
              <p>
                <b>Timbrado N°:</b> {emisor!.timbrado_numero}
              </p>
            ) : null}
            {legal && emisor?.timbrado_inicio_vigencia ? (
              <p>
                <b>Inicio de vigencia:</b>{" "}
                {fechaCorta(emisor.timbrado_inicio_vigencia)}
              </p>
            ) : null}
            <p className="font-bold">{titulo}</p>
            <p>
              <b>N°:</b> {numeroFactura(datos)}
            </p>
          </div>
        </section>

        {/* ── Cliente y condición ───────────────────────────────────────── */}
        <section className="mt-1.5 flex gap-3 border-2 border-black px-3 py-2">
          <div className="min-w-0 flex-1 space-y-0.5">
            <p>
              <b>Fecha y hora de emisión:</b> {emision}
            </p>
            <p>
              <b>RUC/documento de identidad:</b> {datos.clienteRuc ?? ""}
            </p>
            <p>
              <b>Nombre o razón social:</b> {datos.cliente}
            </p>
            <p>
              <b>Dirección:</b> {datos.clienteDireccion ?? ""}
              {vence ? ` - Vencimiento: ${vence}` : ""}
            </p>
          </div>
          <div className="w-[72mm] shrink-0 space-y-0.5">
            <p className="flex items-center gap-1.5">
              <b className="mr-3 whitespace-nowrap">Cond. de venta:</b>
              <Casilla marcada={!credito} />
              <span className="mr-4">Contado</span>
              <Casilla marcada={credito} />
              <span>Crédito</span>
            </p>
            <p>
              <b>Cuotas:</b> {credito ? "1" : ""}
            </p>
            <p>
              <b>Tipo de operación:</b> Venta de mercadería
            </p>
            <p>
              <b>Tipo de Cambio:</b>{" "}
              {venta.moneda === "USD" ? miles(venta.tipo_cambio) : ""}
            </p>
          </div>
        </section>

        {/* ── Detalle, con las columnas a lo alto de la hoja ────────────── */}
        <section className="relative mt-1.5 flex-1 border-2 border-black">
          {bordes.map((x) => (
            <span
              key={x}
              aria-hidden
              className="absolute bottom-0 top-0 border-l border-black"
              style={{ left: `${x}%` }}
            />
          ))}
          <table className="relative w-full table-fixed border-collapse">
            <colgroup>
              {COLS.map((c) => (
                <col key={c.key} style={{ width: `${c.ancho}%` }} />
              ))}
            </colgroup>
            <thead>
              <tr className="border-b border-black bg-slate-100">
                {COLS.map((c) => (
                  <th
                    key={c.key}
                    className="truncate px-1 py-1 text-left font-bold"
                  >
                    {c.titulo}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {venta.items.map((it) => {
                const u =
                  datos.unidades?.[it.producto_id] ?? it.unidad_medida ?? "";
                const fila: Record<Col, string> = {
                  cod: it.sku ?? "",
                  cant: formatCantidad(it.cantidad, u),
                  desc: (it.producto_nombre ?? "").toUpperCase(),
                  precio: miles(it.precio_venta),
                  dto: "0",
                  exentas:
                    it.tipo_iva === "EXENTA" ? miles(it.total_linea) : "0",
                  cinco: it.tipo_iva === "5%" ? miles(it.total_linea) : "0",
                  diez:
                    it.tipo_iva !== "EXENTA" && it.tipo_iva !== "5%"
                      ? miles(it.total_linea)
                      : "0",
                };
                return (
                  <tr key={it.producto_id}>
                    {COLS.map((c) => (
                      <td
                        key={c.key}
                        className={`truncate px-1 py-px tabular-nums ${DERECHA.has(c.key) ? "text-right" : ""}`}
                      >
                        {fila[c.key]}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        {/* ── Totales ───────────────────────────────────────────────────── */}
        <section className="border-x-2 border-b-2 border-black px-1 py-1 font-bold">
          <FilaTotal
            etiqueta="SUBTOTAL"
            exentas={miles(col.exentas)}
            cinco={miles(col.cinco)}
            diez={miles(col.diez)}
          />
          <FilaTotal
            etiqueta="TOTAL DE LA OPERACIÓN"
            diez={miles(venta.total)}
          />
          <FilaTotal
            etiqueta="TOTAL EN GUARANÍES"
            diez={miles(
              venta.moneda === "USD"
                ? venta.total * venta.tipo_cambio
                : venta.total,
            )}
          />
          <div className="flex tabular-nums">
            <span style={{ width: "22%" }}>LIQUIDACIÓN IVA</span>
            <span style={{ width: "8%" }}>5%</span>
            <span className="text-right" style={{ width: "15%" }}>
              {miles(col.iva5)}
            </span>
            <span className="pl-[6%]" style={{ width: "16%" }}>
              10%
            </span>
            <span style={{ width: "10%" }}>{miles(col.iva10)}</span>
            <span className="flex-1 pl-[3%]">TOTAL IVA</span>
            <span className="text-right">{miles(col.ivaTotal)}</span>
          </div>
        </section>

        {emisor?.leyenda || !legal ? (
          <footer className="mt-1.5 border-2 border-black px-3 py-2 text-[8pt]">
            {emisor?.leyenda ? <p>{emisor.leyenda}</p> : null}
            {!legal ? (
              <p>
                Documento no fiscal: falta cargar el RUC y el timbrado en
                Configuración → Facturación.
              </p>
            ) : null}
          </footer>
        ) : null}
      </article>
    </>
  );
}

/** Fila de totales alineada con las columnas Exentas / 5% / 10% del detalle. */
function FilaTotal({
  etiqueta,
  exentas,
  cinco,
  diez,
}: {
  etiqueta: string;
  exentas?: string;
  cinco?: string;
  diez?: string;
}) {
  const antes = COLS.slice(0, 5).reduce((a, c) => a + c.ancho, 0);
  return (
    <div className="flex tabular-nums">
      <span style={{ width: `${antes}%` }}>{etiqueta}</span>
      <span className="text-right" style={{ width: `${COLS[5].ancho}%` }}>
        {exentas ?? ""}
      </span>
      <span className="text-right" style={{ width: `${COLS[6].ancho}%` }}>
        {cinco ?? ""}
      </span>
      <span className="text-right" style={{ width: `${COLS[7].ancho}%` }}>
        {diez ?? ""}
      </span>
    </div>
  );
}

function Casilla({ marcada }: { marcada: boolean }) {
  return (
    <span className="inline-flex h-[3.2mm] w-[3.2mm] items-center justify-center border border-black text-[7pt] leading-none">
      {marcada ? "X" : ""}
    </span>
  );
}
