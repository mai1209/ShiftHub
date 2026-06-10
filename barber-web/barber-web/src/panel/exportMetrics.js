// Exportación de métricas a Excel / PDF desde el panel web.
// Usa import dinámico para no cargar las libs hasta que se exporta.

import {
  fetchMetrics,
  fetchMonthOverview,
  fetchCashSummary,
} from "../services/panelApi";

// Zona horaria del local (igual que la app / backend).
const SHOP_TZ = "America/Argentina/Cordoba";

// Verde de marca de ShiftHub (#2FAA1F) para los encabezados del PDF.
const BRAND_RGB = [47, 170, 31];

function fmt(v) {
  return Number(v || 0).toLocaleString("es-AR");
}

// Fecha corta dd/mm hh:mm en la zona horaria del local.
function fmtDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  try {
    return new Intl.DateTimeFormat("es-AR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: SHOP_TZ,
    })
      .format(d)
      .replace(/,\s*/, " ");
  } catch {
    return "—";
  }
}

function methodLabel(m) {
  if (m === "cash") return "Efectivo";
  if (m === "transfer") return "Transferencia";
  if (m === "mixed") return "Mixto";
  if (m === "card") return "Tarjeta";
  return "—";
}

// Ticket promedio = ingresos ÷ turnos (0 si no hay turnos).
function ticketPromedio(t) {
  const count = Number(t?.appointmentsCount || 0);
  if (!count) return 0;
  return Number(t?.totalRevenue || 0) / count;
}

export async function exportMetricsExcel({ metrics, overview, cash }) {
  const XLSX = await import("xlsx");
  const t = metrics?.totals || {};
  const label = metrics?.period?.label || "periodo";

  const resumen = [
    ["Métricas", label],
    [],
    ["Turnos", Number(t.appointmentsCount || 0)],
    ["Ingresos", Number(t.totalRevenue || 0)],
    ["Ticket promedio", Number(ticketPromedio(t).toFixed(2))],
    ["Comisiones", Number(t.commission || 0)],
    ["Queda al local", Number(t.localRevenue || 0)],
    ["Efectivo", Number(t.cashRevenue || 0)],
    ["Transferencia", Number(t.transferRevenue || 0)],
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumen), "Resumen");

  // Caja del período (si vino el resumen de caja).
  if (cash) {
    const caja = [
      ["Caja del período", label],
      [],
      ["Ingresos por servicios", Number(cash.serviceIncome || 0)],
      ["Ventas de productos / otros", Number(cash.manualIncome || 0)],
      ["Comisiones (−)", -Number(cash.commissions || 0)],
      ["Egresos (−)", -Number(cash.expenses || 0)],
      ["Ingreso total", Number(cash.totalIncome || 0)],
      ["Ganancia neta", Number(cash.profit || 0)],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(caja), "Caja");
  }

  // Liquidación por profesional.
  if (overview?.byBarber?.length) {
    const rows = [["Profesional", "Turnos", "Ingresos", "Comisión", "Queda al local"]];
    overview.byBarber.forEach((b) =>
      rows.push([
        b.barberName,
        Number(b.appointmentsCount || 0),
        Number(b.totalRevenue || 0),
        Number(b.commission || 0),
        Number(b.localRevenue || 0),
      ]),
    );
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Por profesional");
  }

  // Detalle de turnos cobrados (depende de services[] del backend).
  if (cash?.services?.length) {
    const rows = [["Fecha", "Cliente", "Servicio", "Monto", "Método"]];
    cash.services.forEach((s) =>
      rows.push([
        fmtDateTime(s.startTime),
        s.customerName || "Cliente",
        s.service || "Servicio",
        Number(s.amount || 0),
        methodLabel(s.method),
      ]),
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet(rows),
      "Detalle de turnos",
    );
  }

  XLSX.writeFile(wb, `metricas-${label}.xlsx`);
}

export async function exportMetricsPDF({ metrics, overview, cash }) {
  const { default: jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const t = metrics?.totals || {};
  const label = metrics?.period?.label || "periodo";

  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text("Métricas", 14, 18);
  doc.setFontSize(11);
  doc.setTextColor(120);
  doc.text(String(label), 14, 26);

  const nextY = () => (doc.lastAutoTable?.finalY || 32) + 8;

  // Resumen (con ticket promedio).
  autoTable(doc, {
    startY: 32,
    head: [["Concepto", "Valor"]],
    body: [
      ["Turnos", String(t.appointmentsCount || 0)],
      ["Ingresos", `$${fmt(t.totalRevenue)}`],
      ["Ticket promedio", `$${fmt(ticketPromedio(t))}`],
      ["Comisiones", `$${fmt(t.commission)}`],
      ["Queda al local", `$${fmt(t.localRevenue)}`],
      ["Efectivo", `$${fmt(t.cashRevenue)}`],
      ["Transferencia", `$${fmt(t.transferRevenue)}`],
    ],
    headStyles: { fillColor: BRAND_RGB },
  });

  // Caja del período.
  if (cash) {
    autoTable(doc, {
      startY: nextY(),
      head: [["Caja del período", "Monto"]],
      body: [
        ["Ingresos por servicios", `$${fmt(cash.serviceIncome)}`],
        ["Ventas de productos / otros", `$${fmt(cash.manualIncome)}`],
        ["Comisiones", `- $${fmt(cash.commissions)}`],
        ["Egresos", `- $${fmt(cash.expenses)}`],
        ["Ingreso total", `$${fmt(cash.totalIncome)}`],
        ["Ganancia neta", `$${fmt(cash.profit)}`],
      ],
      headStyles: { fillColor: BRAND_RGB },
    });
  }

  // Liquidación por profesional.
  if (overview?.byBarber?.length) {
    autoTable(doc, {
      startY: nextY(),
      head: [["Profesional", "Turnos", "Ingresos", "Comisión", "Queda al local"]],
      body: overview.byBarber.map((b) => [
        b.barberName,
        String(b.appointmentsCount || 0),
        `$${fmt(b.totalRevenue)}`,
        `$${fmt(b.commission)}`,
        `$${fmt(b.localRevenue)}`,
      ]),
      headStyles: { fillColor: BRAND_RGB },
    });
  }

  // Detalle de turnos cobrados (fuente chica para que entre).
  if (cash?.services?.length) {
    autoTable(doc, {
      startY: nextY(),
      head: [["Fecha", "Cliente", "Servicio", "Monto", "Método"]],
      body: cash.services.map((s) => [
        fmtDateTime(s.startTime),
        s.customerName || "Cliente",
        s.service || "Servicio",
        `$${fmt(s.amount)}`,
        methodLabel(s.method),
      ]),
      headStyles: { fillColor: BRAND_RGB },
      styles: { fontSize: 8 },
    });
  }

  doc.save(`metricas-${label}.pdf`);
}

// Reúne métricas + desglose por profesional + caja del período y exporta.
// Lo usan Resumen y Caja para no duplicar el armado del reporte.
export async function runMetricsExport(kind, { params, isOwner }) {
  const reqs = [fetchMetrics(params)];
  if (isOwner) {
    reqs.push(fetchMonthOverview(params));
    reqs.push(fetchCashSummary(params));
  }
  const results = await Promise.all(reqs);
  const payload = {
    metrics: results[0],
    overview: isOwner ? results[1] || null : null,
    cash: isOwner ? results[2] || null : null,
  };
  if (kind === "excel") await exportMetricsExcel(payload);
  else await exportMetricsPDF(payload);
}
