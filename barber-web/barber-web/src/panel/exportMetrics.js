// Exportación de métricas a Excel / PDF desde el panel web.
// Usa import dinámico para no cargar las libs hasta que se exporta.

function fmt(v) {
  return Number(v || 0).toLocaleString("es-AR");
}

// Verde de marca de ShiftHub (#2FAA1F) para los encabezados del PDF.
const BRAND_RGB = [47, 170, 31];

export async function exportMetricsExcel({ metrics, overview }) {
  const XLSX = await import("xlsx");
  const t = metrics?.totals || {};
  const label = metrics?.period?.label || "periodo";

  const resumen = [
    ["Métricas", label],
    [],
    ["Turnos", Number(t.appointmentsCount || 0)],
    ["Ingresos", Number(t.totalRevenue || 0)],
    ["Comisiones", Number(t.commission || 0)],
    ["Queda al local", Number(t.localRevenue || 0)],
    ["Efectivo", Number(t.cashRevenue || 0)],
    ["Transferencia", Number(t.transferRevenue || 0)],
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumen), "Resumen");

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

  XLSX.writeFile(wb, `metricas-${label}.xlsx`);
}

export async function exportMetricsPDF({ metrics, overview }) {
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

  autoTable(doc, {
    startY: 32,
    head: [["Concepto", "Valor"]],
    body: [
      ["Turnos", String(t.appointmentsCount || 0)],
      ["Ingresos", `$${fmt(t.totalRevenue)}`],
      ["Comisiones", `$${fmt(t.commission)}`],
      ["Queda al local", `$${fmt(t.localRevenue)}`],
      ["Efectivo", `$${fmt(t.cashRevenue)}`],
      ["Transferencia", `$${fmt(t.transferRevenue)}`],
    ],
    headStyles: { fillColor: BRAND_RGB },
  });

  if (overview?.byBarber?.length) {
    autoTable(doc, {
      startY: (doc.lastAutoTable?.finalY || 40) + 8,
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

  doc.save(`metricas-${label}.pdf`);
}
