import React, { useEffect, useState, useCallback } from 'react';
import { fetchCustomerHistory } from '../../services/panelApi';
import { usePeriod, formatCurrency } from '../usePeriod';
import PeriodSelector from '../components/PeriodSelector';
import styles from '../Panel.module.css';

function paymentLabel(method) {
  if (method === 'transfer') return 'Transferencia';
  if (method === 'mixed') return 'Mixto';
  return 'Efectivo';
}

function HistorialPage() {
  const { rangeMode, setRangeMode, refDate, buildParams, shiftPeriod } =
    usePeriod('monthly');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const params = buildParams();
      if (paymentFilter !== 'all') params.paymentMethod = paymentFilter;
      const res = await fetchCustomerHistory(params);
      setData(res);
    } catch (err) {
      setError(err?.message || 'No pudimos cargar el historial.');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeMode, refDate, paymentFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const items = (data?.items || []).filter((it) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      (it.customerName || '').toLowerCase().includes(q) ||
      (it.service || '').toLowerCase().includes(q) ||
      (it.barberName || '').toLowerCase().includes(q)
    );
  });

  const summary = data?.summary;

  return (
    <div>
      <PeriodSelector
        rangeMode={rangeMode}
        setRangeMode={setRangeMode}
        shiftPeriod={shiftPeriod}
        label={data?.period?.label}
      />

      {error ? <div className={styles.errorBox}>{error}</div> : null}

      <div className={styles.cardsGrid}>
        <div className={styles.infoCard}>
          <span className={styles.infoCardLabel}>Servicios</span>
          <strong className={styles.infoCardValue}>
            {summary ? summary.servicesCount : '…'}
          </strong>
        </div>
        <div className={styles.infoCard}>
          <span className={styles.infoCardLabel}>Clientes únicos</span>
          <strong className={styles.infoCardValue}>
            {summary ? summary.uniqueClients : '…'}
          </strong>
        </div>
        <div className={styles.infoCard}>
          <span className={styles.infoCardLabel}>Ingresos</span>
          <strong className={styles.infoCardValue}>
            {summary ? formatCurrency(summary.totalRevenue) : '…'}
          </strong>
        </div>
      </div>

      <div className={styles.filtersRow}>
        <input
          className={styles.input}
          placeholder="Buscar cliente, servicio o profesional"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 200 }}
        />
        <div className={styles.segmented}>
          {[
            { k: 'all', l: 'Todos' },
            { k: 'cash', l: 'Efectivo' },
            { k: 'transfer', l: 'Transferencia' },
          ].map((opt) => (
            <button
              key={opt.k}
              className={`${styles.segment} ${
                paymentFilter === opt.k ? styles.segmentActive : ''
              }`}
              onClick={() => setPaymentFilter(opt.k)}
            >
              {opt.l}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className={styles.muted}>Cargando…</p>
      ) : items.length === 0 ? (
        <p className={styles.muted}>No hay servicios con ese filtro.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Cliente</th>
                <th>Servicio</th>
                <th>Profesional</th>
                <th>Pago</th>
                <th>Monto</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it._id}>
                  <td>{new Date(it.startTime).toLocaleDateString('es-AR')}</td>
                  <td>{it.customerName}</td>
                  <td>{it.service}</td>
                  <td>{it.barberName}</td>
                  <td>{paymentLabel(it.paymentMethod)}</td>
                  <td>{formatCurrency(it.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default HistorialPage;
