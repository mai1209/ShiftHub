import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { fetchMetrics, fetchMonthOverview } from '../../services/panelApi';
import { usePeriod, formatCurrency } from '../usePeriod';
import PeriodSelector from '../components/PeriodSelector';
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

  const t = metrics?.totals;

  const cards = [
    { label: 'Turnos', value: t ? String(t.appointmentsCount) : '—' },
    { label: 'Ingresos', value: t ? formatCurrency(t.totalRevenue) : '—' },
    { label: 'Comisiones', value: t ? formatCurrency(t.commission) : '—' },
    { label: 'Queda al local', value: t ? formatCurrency(t.localRevenue) : '—' },
    { label: 'Efectivo', value: t ? formatCurrency(t.cashRevenue) : '—' },
    { label: 'Transferencia', value: t ? formatCurrency(t.transferRevenue) : '—' },
  ];

  // Datos para gráficos (CSS, sin librerías).
  const BARBER_PALETTE = [
    '#ec4899', '#3b82f6', '#10b981', '#f59e0b',
    '#8b5cf6', '#ef4444', '#14b8a6', '#f97316',
  ];
  const cashRev = Number(t?.cashRevenue || 0);
  const transferRev = Number(t?.transferRevenue || 0);
  const sumCT = cashRev + transferRev;
  const cashPct = sumCT ? Math.round((cashRev / sumCT) * 100) : 0;
  const transferPct = sumCT ? 100 - cashPct : 0;
  const byBarber = isOwner ? overview?.byBarber || [] : [];
  const maxBarberRev = Math.max(
    1,
    ...byBarber.map((b) => Number(b.totalRevenue || 0)),
  );

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

      {t && sumCT > 0 ? (
        <>
          <h2 className={styles.sectionTitle}>Efectivo vs Transferencia</h2>
          <div className={styles.chartCard}>
            <div className={styles.splitBar}>
              <div
                className={styles.splitBarCash}
                style={{ width: `${cashPct}%` }}
              />
              <div
                className={styles.splitBarTransfer}
                style={{ width: `${transferPct}%` }}
              />
            </div>
            <div className={styles.splitLegend}>
              <span>
                <span className={`${styles.legendDot} ${styles.legendCash}`} />
                Efectivo · {cashPct}% · {formatCurrency(cashRev)}
              </span>
              <span>
                <span className={`${styles.legendDot} ${styles.legendTransfer}`} />
                Transferencia · {transferPct}% · {formatCurrency(transferRev)}
              </span>
            </div>
          </div>
        </>
      ) : null}

      {byBarber.length ? (
        <>
          <h2 className={styles.sectionTitle}>Ingresos por profesional</h2>
          <div className={styles.chartCard}>
            {byBarber.map((b, i) => {
              const rev = Number(b.totalRevenue || 0);
              const pct = Math.round((rev / maxBarberRev) * 100);
              const color = BARBER_PALETTE[i % BARBER_PALETTE.length];
              return (
                <div key={b.barberId} className={styles.hbarRow}>
                  <span className={styles.hbarLabel}>{b.barberName}</span>
                  <div className={styles.hbarTrack}>
                    <div
                      className={styles.hbarFill}
                      style={{ width: `${Math.max(4, pct)}%`, background: color }}
                    />
                  </div>
                  <span className={styles.hbarValue}>{formatCurrency(rev)}</span>
                </div>
              );
            })}
          </div>
        </>
      ) : null}

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
