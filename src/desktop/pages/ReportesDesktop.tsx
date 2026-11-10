"use client";

import { Wallet, ShoppingCart, Scale, Megaphone, BookText, BookOpen, Layers, HandCoins, BookMarked, Lock, Trophy, Users, Target, Package, Tags, ArrowLeftRight, CalendarDays, Sheet } from "lucide-react";
import { SettingsModuleCard } from "@/components/config/SettingsModuleCard";

type ReporteCard = {
  title: string;
  subtitle: string;
  description: string;
  icon: typeof Wallet;
  href: string;
};

const REPORTES: ReporteCard[] = [
  {
    title: "Metas de ventas",
    subtitle: "Metas del mes",
    description:
      "Cargar, cambiar y consultar la meta de ventas de cada mes (también la del mes que viene), para toda la empresa y por persona, con el avance de lo vendido, lo que falta y cuánto hay que vender por día.",
    icon: Target,
    href: "/reportes/metas-ventas",
  },
  {
    title: "Compras por semana",
    subtitle: "Como la planilla",
    description:
      "Las compras del mes como la planilla de Excel: por semana, cada día con sus facturas y el total; total semanal, acumulado del mes y gráficos. Filtro por proveedor y categoría. Imprimible y exportable a Excel.",
    icon: CalendarDays,
    href: "/reportes/compras-semanal",
  },
  {
    title: "Arqueo del mes",
    subtitle: "Como la planilla",
    description:
      "El arqueo diario de cada camionero y del salón, como la planilla: contado, cobranzas, crédito, cheques, transferencias, gastos, efectivo y diferencia por día, subtotal por semana, total del mes y total general.",
    icon: Sheet,
    href: "/reportes/arqueo-mensual",
  },
  {
    title: "Libro de Compras",
    subtitle: "Contabilidad",
    description:
      "Registro fiscal unificado de compras válidas y Gastos y Servicios confirmados: proveedor, comprobante, gravado 5%/10%, exento, IVA y totales. Exportable a Excel.",
    icon: BookText,
    href: "/reportes/libro-compras",
  },
  {
    title: "Compras",
    subtitle: "Compras",
    description:
      "Todas las compras del período (con o sin timbrado): fecha, proveedor, comprobante, condición, ítems y total, con filtro por proveedor, totales y corte por proveedor. Para el registro fiscal (IVA) está el Libro de Compras.",
    icon: Package,
    href: "/reportes/compras",
  },
  {
    title: "Libro de Ventas",
    subtitle: "Contabilidad",
    description:
      "Registro fiscal de ventas: comprobantes con DTE aprobado, gravado 5%/10%, exento, IVA débito y totales. Las notas de crédito figuran como movimientos negativos. Exportable a Excel.",
    icon: BookMarked,
    href: "/reportes/libro-ventas",
  },
  {
    title: "Libro Diario",
    subtitle: "Contabilidad",
    description:
      "Registro cronológico de los asientos contables generados por Compras y Gastos y Servicios, con cuentas, debe, haber y documento de origen.",
    icon: BookOpen,
    href: "/reportes/libro-diario",
  },
  {
    title: "Libro Mayor",
    subtitle: "Contabilidad",
    description:
      "Movimientos y saldos acumulados por cuenta contable, con saldo inicial, debe, haber y trazabilidad del documento de origen.",
    icon: Layers,
    href: "/reportes/libro-mayor",
  },
  {
    title: "Cuentas por Pagar",
    subtitle: "Finanzas",
    description:
      "Deuda con proveedores originada en compras a crédito: vencimiento, plazo, cuotas, monto por cuota y total adeudado, con vencidas y por vencer.",
    icon: HandCoins,
    href: "/reportes/cuentas-por-pagar",
  },
  {
    title: "Estado de cuenta empresa",
    subtitle: "Finanzas",
    description:
      "Resumen financiero general de la empresa: saldos, movimientos, ventas, compras, gastos, cobros y pagos del período.",
    icon: Wallet,
    href: "/reportes/estado-cuenta",
  },
  {
    title: "Ventas",
    subtitle: "Comercial",
    description:
      "Reporte visual de ventas por período, cliente, producto, método de pago, tipo de precio y evolución mensual.",
    icon: ShoppingCart,
    href: "/reportes/ventas",
  },
  {
    title: "Productos más vendidos",
    subtitle: "Comercial",
    description:
      "Ranking de productos por cantidad vendida, con filtros por rango de fechas y por ubicación (salón, camiones). Ordena de mayor a menor con los importes totales.",
    icon: Trophy,
    href: "/reportes/productos-mas-vendidos",
  },
  {
    title: "Por categoría",
    subtitle: "Comercial",
    description:
      "Ventas y compras del período agrupadas por categoría de producto, con importes totales y participación. Filtros por día, quincena, mes o rango de fechas.",
    icon: Tags,
    href: "/reportes/categorias",
  },
  {
    title: "Clientes",
    subtitle: "Comercial",
    description:
      "Mejores compradores por período, clientes con mora (filtrable por días) y clientes inactivos (sin comprar desde X días).",
    icon: Users,
    href: "/reportes/ranking-clientes",
  },
  {
    title: "Metas por producto",
    subtitle: "Comercial",
    description:
      "Objetivos de cantidad vendida por producto y por mes, con el avance real y el porcentaje de cumplimiento (vendido ÷ meta).",
    icon: Target,
    href: "/reportes/metas-comerciales",
  },
  {
    title: "Cierres de caja",
    subtitle: "Caja",
    description:
      "El arqueo de todas las cajas del período: cobrado en efectivo, transferencia y cheque, crédito, cobranzas, egresos, efectivo esperado contra contado y la diferencia. Exportable a Excel.",
    icon: Lock,
    href: "/reportes/cierres-caja",
  },
  {
    title: "Cobranzas por transferencia",
    subtitle: "Cobranzas",
    description:
      "Cobranzas recibidas por transferencia bancaria en el período (incluye la porción transferencia de pagos mixtos), con detalle por operación, total general e impresión en ticket para conciliar contra el extracto del banco.",
    icon: ArrowLeftRight,
    href: "/reportes/cobranzas-transferencias",
  },
  {
    title: "Conciliación bancaria",
    subtitle: "Cobranzas",
    description:
      "Aprobá o rechazá las transferencias pendientes de conciliación. Al aprobar, se registra el cobro y su asiento contable.",
    icon: Scale,
    href: "/cobranzas/conciliacion",
  },
  // Campañas Meta es del ERP de la agencia: mide avisos de Facebook/Instagram
  // contra conversaciones de WhatsApp. Una distribuidora no lo usa. El código
  // queda; para volver a mostrarlo, devolver esta tarjeta.
];

export default function ReportesPage() {
  return (
    <div className="w-full min-w-0 max-w-full space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block h-2 w-2 shrink-0 rounded-full bg-[#4FAEB2] shadow-[0_0_0_3px_rgba(79,174,178,0.18)]"
          />
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">
            Análisis
          </p>
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Reportes</h1>
        <p className="mt-1 text-sm text-slate-500">Panel de análisis y reportería operativa</p>
      </div>

      {/* Cards de reportes */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {REPORTES.map((r) => (
          <SettingsModuleCard
            key={r.href}
            title={r.title}
            subtitle={r.subtitle}
            description={r.description}
            icon={r.icon}
            href={r.href}
            actionLabel="Ver reporte"
          />
        ))}
      </div>
    </div>
  );
}
