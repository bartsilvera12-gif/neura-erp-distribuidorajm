import CobranzasCredito from "@/shared/caja/CobranzasCredito";

/**
 * Cobranzas: lo que falta cobrar de las ventas a crédito.
 *
 * La pantalla anterior (`CobranzasClient`) cobra facturas de suscripción, que
 * es el negocio de una agencia de servicios y no el de una distribuidora: acá
 * lo que se fía es la venta del día y se cobra en la próxima vuelta.
 */
export default function Page() {
  return <CobranzasCredito />;
}
