// Exportación de la caja (Excel + PDF) desde la app, con el mismo contenido que
// el panel web: resumen de caja, detalle de turnos y movimientos.
import * as XLSX from 'xlsx';
import RNFS from 'react-native-fs';
import Share from 'react-native-share';
import { generatePDF } from 'react-native-html-to-pdf';
import type { CashSummaryResponse, CashEntry } from './api';

const SHOP_TZ = 'America/Argentina/Cordoba';

const fmt = (v: number | undefined | null) => Number(v || 0).toLocaleString('es-AR');

const fmtDateTime = (iso?: string | null) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: SHOP_TZ,
    });
  } catch {
    return '—';
  }
};

const fmtDate = (iso?: string | null) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('es-AR', { timeZone: SHOP_TZ });
  } catch {
    return '—';
  }
};

const METHOD_LABELS: Record<string, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  mixed: 'Mixto',
  card: 'Tarjeta',
};
const methodLabel = (m?: string | null) =>
  m ? METHOD_LABELS[m] || String(m) : '—';

const safeName = (label: string) =>
  String(label || 'periodo')
    .replace(/[^a-z0-9-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'periodo';

const esc = (s?: string | null) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

export async function exportCajaExcel(
  summary: CashSummaryResponse | null,
  entries: CashEntry[],
  shopName?: string,
) {
  const c = summary;
  const label = c?.period?.label || 'periodo';
  const wb = XLSX.utils.book_new();

  const resumen: (string | number)[][] = [
    ['Caja del local', shopName || ''],
    ['Período', label],
    [],
    ['Ingresos por servicios', Number(c?.serviceIncome || 0)],
    ['Ventas de productos / otros', Number(c?.manualIncome || 0)],
    ['Comisiones (-)', Number(c?.commissions || 0)],
    ['Egresos (-)', Number(c?.expenses || 0)],
    ['Ingreso total', Number(c?.totalIncome || 0)],
    ['Ganancia neta', Number(c?.profit || 0)],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumen), 'Caja');

  if (c?.services?.length) {
    const rows: (string | number)[][] = [
      ['Fecha', 'Cliente', 'Servicio', 'Monto', 'Método'],
    ];
    c.services.forEach(s =>
      rows.push([
        fmtDateTime(s.startTime),
        s.customerName || '—',
        s.service || '—',
        Number(s.amount || 0),
        methodLabel(s.method),
      ]),
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet(rows),
      'Detalle de turnos',
    );
  }

  if (entries?.length) {
    const rows: (string | number)[][] = [
      ['Fecha', 'Tipo', 'Categoría', 'Descripción', 'Monto'],
    ];
    entries.forEach(e =>
      rows.push([
        fmtDate(e.date),
        e.type === 'income' ? 'Ingreso' : 'Egreso',
        e.category || '—',
        e.description || '—',
        Number(e.amount || 0),
      ]),
    );
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Movimientos');
  }

  const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
  const path = `${RNFS.CachesDirectoryPath}/caja-${safeName(label)}.xlsx`;
  await RNFS.writeFile(path, base64, 'base64');
  await Share.open({
    url: `file://${path}`,
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    filename: `caja-${safeName(label)}`,
    failOnCancel: false,
  });
}

function buildCajaHtml(
  c: CashSummaryResponse | null,
  entries: CashEntry[],
  label: string,
  shopName?: string,
): string {
  const totalRow = (k: string, v: number | undefined) =>
    `<tr><td>${k}</td><td class="num">$${fmt(v)}</td></tr>`;

  const servicesRows = (c?.services || [])
    .map(
      s =>
        `<tr><td>${fmtDateTime(s.startTime)}</td><td>${esc(
          s.customerName,
        )}</td><td>${esc(s.service)}</td><td class="num">$${fmt(
          s.amount,
        )}</td><td>${methodLabel(s.method)}</td></tr>`,
    )
    .join('');

  const movRows = (entries || [])
    .map(
      e =>
        `<tr><td>${fmtDate(e.date)}</td><td>${
          e.type === 'income' ? 'Ingreso' : 'Egreso'
        }</td><td>${esc(e.category)}</td><td>${esc(
          e.description,
        )}</td><td class="num">$${fmt(e.amount)}</td></tr>`,
    )
    .join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8" />
  <style>
    * { font-family: -apple-system, Roboto, Arial, sans-serif; }
    body { color: #111827; padding: 8px; }
    h1 { font-size: 22px; margin: 0 0 2px; }
    .shop { font-size: 15px; font-weight: 700; margin: 0 0 2px; }
    .label { color: #6b7280; font-size: 13px; margin: 0 0 2px; }
    .desc { color: #9ca3af; font-size: 12px; margin: 0 0 18px; }
    h2 { font-size: 15px; margin: 22px 0 6px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th { text-align: left; background: #16a34a; color: #fff; padding: 7px 8px; }
    td { padding: 6px 8px; border-bottom: 1px solid #e5e7eb; }
    .num { text-align: right; }
    .det th { background: #8b5cf6; }
    .mov th { background: #64748b; }
  </style></head><body>
    <h1>Caja del local</h1>
    ${shopName ? `<p class="shop">${esc(shopName)}</p>` : ''}
    <p class="label">Período: ${esc(label)}</p>
    <p class="desc">Resumen de ingresos, egresos, ganancia neta y movimientos del período.</p>
    <table>
      <tr><th>Caja del período</th><th class="num">Valor</th></tr>
      ${totalRow('Ingresos por servicios', c?.serviceIncome)}
      ${totalRow('Ventas de productos / otros', c?.manualIncome)}
      ${totalRow('Comisiones (-)', c?.commissions)}
      ${totalRow('Egresos (-)', c?.expenses)}
      ${totalRow('Ingreso total', c?.totalIncome)}
      ${totalRow('Ganancia neta', c?.profit)}
    </table>
    ${
      servicesRows
        ? `<h2>Detalle de turnos</h2><table class="det">
            <tr><th>Fecha</th><th>Cliente</th><th>Servicio</th><th class="num">Monto</th><th>Método</th></tr>
            ${servicesRows}</table>`
        : ''
    }
    ${
      movRows
        ? `<h2>Movimientos del período</h2><table class="mov">
            <tr><th>Fecha</th><th>Tipo</th><th>Categoría</th><th>Descripción</th><th class="num">Monto</th></tr>
            ${movRows}</table>`
        : ''
    }
  </body></html>`;
}

export async function exportCajaPDF(
  summary: CashSummaryResponse | null,
  entries: CashEntry[],
  shopName?: string,
) {
  const label = summary?.period?.label || 'periodo';
  const html = buildCajaHtml(summary, entries, label, shopName);
  const res = await generatePDF({
    html,
    fileName: `caja-${safeName(label)}`,
    base64: false,
    padding: 24,
  });
  if (!res.filePath) {
    throw new Error('No se pudo generar el PDF.');
  }
  await Share.open({
    url: `file://${res.filePath}`,
    type: 'application/pdf',
    filename: `caja-${safeName(label)}`,
    failOnCancel: false,
  });
}
