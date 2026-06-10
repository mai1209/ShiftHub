import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  fetchAppointments,
  fetchBarberAppointments,
  fetchCashSummary,
} from '../../services/panelApi';
import { usePeriod, formatCurrency, periodLabel } from '../usePeriod';
import PeriodSelector from '../components/PeriodSelector';
import { runMetricsExport } from '../exportMetrics';
import { useAuth } from '../AuthContext';
import styles from '../Panel.module.css';

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}
const timeOf = (iso) =>
  new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
const barberNameOf = (a) =>
  a.barber && typeof a.barber === 'object' ? a.barber.fullName : '';

function ResumenPage() {
  const { user, isOwner } = useAuth();
  const navigate = useNavigate();

  const [appts, setAppts] = useState([]);
  const [dayCash, setDayCash] = useState(null);
  const [monthCash, setMonthCash] = useState(null);
  const [loading, setLoading] = useState(true);

  // Período + export del reporte (independiente de la vista de hoy).
  const {
    rangeMode: expRange,
    setRangeMode: setExpRange,
    refDate: expRefDate,
    buildParams: buildExpParams,
    shiftPeriod: shiftExp,
  } = usePeriod('monthly');
  const [exporting, setExporting] = useState(false);

  const doExport = async (kind) => {
    try {
      setExporting(true);
      await runMetricsExport(kind, { params: buildExpParams(), isOwner });
    } catch (err) {
      alert(err?.message || 'No se pudo exportar.');
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const today = new Date();
        const ds = ymd(today);

        const apptsP =
          isOwner || !user?.barberId
            ? fetchAppointments(ds)
            : fetchBarberAppointments(user.barberId, ds);

        const [apptsRes, dayRes, monthRes] = await Promise.all([
          apptsP.catch(() => null),
          isOwner
            ? fetchCashSummary({ range: 'daily', date: ds }).catch(() => null)
            : Promise.resolve(null),
          isOwner
            ? fetchCashSummary({
                range: 'monthly',
                year: today.getFullYear(),
                month: today.getMonth() + 1,
              }).catch(() => null)
            : Promise.resolve(null),
        ]);

        if (cancelled) return;
        setAppts(
          (apptsRes?.appointments || [])
            .filter((a) => a.status !== 'cancelled')
            .sort((a, b) => String(a.startTime).localeCompare(String(b.startTime))),
        );
        setDayCash(dayRes);
        setMonthCash(monthRes);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOwner, user]);

  const now = new Date();
  const upcoming = appts.filter(
    (a) => a.status === 'pending' && new Date(a.startTime) >= now,
  );

  const cards = [
    { label: 'Turnos hoy', value: loading ? '…' : String(appts.length) },
  ];
  if (isOwner) {
    cards.push(
      {
        label: 'Ingresos hoy',
        value: dayCash ? formatCurrency(dayCash.totalIncome) : loading ? '…' : '—',
      },
      {
        label: 'Ingresos del mes',
        value: monthCash ? formatCurrency(monthCash.totalIncome) : loading ? '…' : '—',
      },
      {
        label: 'Ganancia del mes',
        value: monthCash ? formatCurrency(monthCash.profit) : loading ? '…' : '—',
        accent: true,
      },
    );
  }

  return (
    <div>
      <h1 className={styles.pageTitle} style={{ marginBottom: 18 }}>
        Así viene el día
      </h1>

      <div className={styles.cardsGrid}>
        {cards.map((c) => (
          <div key={c.label} className={styles.infoCard}>
            <span className={styles.infoCardLabel}>{c.label}</span>
            <strong
              className={styles.infoCardValue}
              style={c.accent ? { color: '#16a34a' } : undefined}
            >
              {c.value}
            </strong>
          </div>
        ))}
      </div>

      {isOwner ? (
        <div className={styles.detailCard} style={{ marginBottom: 18 }}>
          <div className={styles.resumenHead}>
            <h3 className={styles.detailCardTitle}>Exportar reporte</h3>
          </div>
          <PeriodSelector
            rangeMode={expRange}
            setRangeMode={setExpRange}
            shiftPeriod={shiftExp}
            label={periodLabel(expRange, expRefDate)}
          />
          <div className={styles.exportRow} style={{ marginTop: 12 }}>
            <button
              className={styles.secondaryBtn}
              onClick={() => doExport('pdf')}
              disabled={exporting}
            >
              Exportar PDF
            </button>
            <button
              className={styles.secondaryBtn}
              onClick={() => doExport('excel')}
              disabled={exporting}
            >
              Exportar Excel
            </button>
          </div>
        </div>
      ) : null}

      <div className={styles.resumenCols}>
        {/* Próximos turnos */}
        <div className={styles.detailCard}>
          <div className={styles.resumenHead}>
            <h3 className={styles.detailCardTitle}>Próximos turnos de hoy</h3>
            <button className={styles.backLink} onClick={() => navigate('/turnos')}>
              Ver agenda ›
            </button>
          </div>
          {loading ? (
            <p className={styles.muted}>Cargando…</p>
          ) : upcoming.length === 0 ? (
            <p className={styles.muted}>No quedan turnos pendientes hoy.</p>
          ) : (
            <div className={styles.entriesList}>
              {upcoming.slice(0, 6).map((a) => (
                <div key={a._id} className={styles.apptRow}>
                  <div className={styles.apptTime}>{timeOf(a.startTime)}</div>
                  <div className={styles.apptInfo}>
                    <span className={styles.entryDesc}>{a.customerName}</span>
                    <span className={styles.entryMeta}>
                      {a.service}
                      {isOwner && barberNameOf(a) ? ` · ${barberNameOf(a)}` : ''}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Accesos rápidos */}
        <div className={styles.detailCard}>
          <h3 className={styles.detailCardTitle}>Accesos rápidos</h3>
          <div className={styles.quickActions}>
            <button className={styles.primaryBtn} onClick={() => navigate('/turnos')}>
              + Cargar turno
            </button>
            {isOwner ? (
              <>
                <button className={styles.secondaryBtn} onClick={() => navigate('/caja')}>
                  Cargar movimiento
                </button>
                <button className={styles.secondaryBtn} onClick={() => navigate('/metricas')}>
                  Ver métricas
                </button>
                <button className={styles.secondaryBtn} onClick={() => navigate('/productos')}>
                  Registrar venta
                </button>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ResumenPage;
