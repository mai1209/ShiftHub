import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { fetchMetrics, fetchMonthOverview } from '../../services/panelApi';
import { usePeriod, formatCurrency } from '../usePeriod';
import PeriodSelector from '../components/PeriodSelector';
import { exportMetricsExcel, exportMetricsPDF } from '../exportMetrics';
import { useAuth } from '../AuthContext';
import styles from '../Panel.module.css';

function MetricasPage() {
  const { isOwner } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const barberId = searchParams.get('barber') || null;
  const { rangeMode, setRangeMode, refDate, buildParams, shiftPeriod } =
    usePeriod('monthly');
  const [metrics, setMetrics] = useState(null);
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const params = buildParams();
      if (barberId) params.barberId = barberId;
      const reqs = [fetchMetrics(params)];
      // El desglose por profesional solo cuando no hay uno filtrado.
      if (isOwner && !barberId) reqs.push(fetchMonthOverview(params));
      const [m, o] = await Promise.all(reqs);
      setMetrics(m);
      setOverview(o || null);
    } catch (err) {
      setError(err?.message || 'No pudimos cargar las métricas.');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeMode, refDate, isOwner, barberId]);

  useEffect(() => {
    load();
  }, [load]);

  const [exporting, setExporting] = useState(false);

  const doExport = async (kind) => {
    if (!metrics) return;
    try {
      setExporting(true);
      const payload = { metrics, overview };
      if (kind === 'excel') await exportMetricsExcel(payload);
      else await exportMetricsPDF(payload);
    } catch (err) {
      alert(err?.message || 'No se pudo exportar.');
    } finally {
      setExporting(false);
    }
  };

  const t = metrics?.totals;

  const cards = [
    { label: 'Turnos', value: t ? String(t.appointmentsCount) : '—' },
    { label: 'Ingresos', value: t ? formatCurrency(t.totalRevenue) : '—' },
    { label: 'Comisiones', value: t ? formatCurrency(t.commission) : '—' },
    { label: 'Queda al local', value: t ? formatCurrency(t.localRevenue) : '—' },
    { label: 'Efectivo', value: t ? formatCurrency(t.cashRevenue) : '—' },
    { label: 'Transferencia', value: t ? formatCurrency(t.transferRevenue) : '—' },
  ];

  return (
    <div>
      {barberId ? (
        <div className={styles.filterChipRow}>
          <span className={styles.filterChip}>
            Métricas de {metrics?.barber?.fullName || 'este profesional'}
          </span>
          <button
            className={styles.backLink}
            onClick={() => navigate('/metricas')}
          >
            Ver todos ›
          </button>
        </div>
      ) : null}

      <PeriodSelector
        rangeMode={rangeMode}
        setRangeMode={setRangeMode}
        shiftPeriod={shiftPeriod}
        label={metrics?.period?.label}
      />

      {error ? <div className={styles.errorBox}>{error}</div> : null}

      <div className={styles.exportRow}>
        <button
          className={styles.secondaryBtn}
          onClick={() => doExport('pdf')}
          disabled={loading || exporting || !metrics}
        >
          Exportar PDF
        </button>
        <button
          className={styles.secondaryBtn}
          onClick={() => doExport('excel')}
          disabled={loading || exporting || !metrics}
        >
          Exportar Excel
        </button>
      </div>

      <div className={styles.cardsGrid}>
        {cards.map((c) => (
          <div key={c.label} className={styles.infoCard}>
            <span className={styles.infoCardLabel}>{c.label}</span>
            <strong className={styles.infoCardValue}>
              {loading ? '…' : c.value}
            </strong>
          </div>
        ))}
      </div>

      {isOwner && overview?.byBarber?.length ? (
        <>
          <h2 className={styles.sectionTitle}>Por profesional</h2>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Profesional</th>
                  <th>Turnos</th>
                  <th>Ingresos</th>
                  <th>Comisión</th>
                  <th>Queda al local</th>
                </tr>
              </thead>
              <tbody>
                {overview.byBarber.map((b) => (
                  <tr key={b.barberId}>
                    <td>{b.barberName}</td>
                    <td>{b.appointmentsCount}</td>
                    <td>{formatCurrency(b.totalRevenue)}</td>
                    <td>{formatCurrency(b.commission)}</td>
                    <td>{formatCurrency(b.localRevenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}

export default MetricasPage;
