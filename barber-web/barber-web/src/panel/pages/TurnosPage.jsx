import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  fetchBarbers,
  fetchAppointments,
  fetchBarberAppointments,
  fetchServices,
  createAppointment,
  updateAppointmentStatus,
} from '../../services/panelApi';
import { ChevronLeft, ChevronRight, X, Plus, MessageCircle } from 'lucide-react';
import { formatCurrency } from '../usePeriod';
import { useAuth } from '../AuthContext';
import styles from '../Panel.module.css';

const GRID_STEP = 30;
const FALLBACK_START = 9 * 60;
const FALLBACK_END = 20 * 60;
const ROW_H = 46;
const DOW = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}
const toHHMM = (min) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const toMin = (hhmm) => {
  const m = String(hhmm || '').match(/(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const startMinOf = (iso) => {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
};
const timeOf = (iso) =>
  new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
const apptBarberId = (a) =>
  a.barber && typeof a.barber === 'object' ? String(a.barber._id) : String(a.barber || '');

function startOfWeek(d) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}
function rangesFromSchedule(resolved) {
  const out = [];
  const arr = resolved?.scheduleRanges;
  if (Array.isArray(arr) && arr.length) {
    arr.forEach((r) => {
      const s = toMin(r.start);
      const e = toMin(r.end);
      if (s != null && e != null) out.push({ start: s, end: e });
    });
    if (out.length) return out;
  }
  const str = resolved?.scheduleRange;
  if (str) {
    const m = String(str).match(/(\d{1,2}:\d{2}).*?(\d{1,2}:\d{2})/);
    if (m) out.push({ start: toMin(m[1]), end: toMin(m[2]) });
  }
  return out;
}
// Normaliza un teléfono a formato WhatsApp internacional (default Argentina: 549).
function normalizeWhatsapp(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('00')) d = d.slice(2); // prefijo internacional 00
  if (d.startsWith('54')) {
    const rest = d.slice(2).replace(/^0+/, '');
    return rest.startsWith('9') ? `54${rest}` : `549${rest}`;
  }
  d = d.replace(/^0+/, ''); // sacar 0 inicial (área)
  if (!d) return null;
  return `549${d}`;
}

function waLink(phone, text) {
  const num = normalizeWhatsapp(phone);
  if (!num) return null;
  return `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
}

function TurnosPage() {
  const { isOwner, user, activeShop } = useAuth();
  const [view, setView] = useState('day');
  const [date, setDate] = useState(() => new Date());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [services, setServices] = useState([]);
  const [barbers, setBarbers] = useState([]);
  const [barberFilter, setBarberFilter] = useState('all');

  const [columns, setColumns] = useState([]);
  const [weekData, setWeekData] = useState([]);
  const [monthData, setMonthData] = useState({ cells: [], byDay: {} });

  // Modal turno (cobro + acciones)
  const [active, setActive] = useState(null);
  const [mixed, setMixed] = useState(false);
  const [cashInput, setCashInput] = useState('');
  const [transferInput, setTransferInput] = useState('');
  const [saving, setSaving] = useState(false);

  // Modal crear
  const [createOpen, setCreateOpen] = useState(false);
  const [cMode, setCMode] = useState('slot'); // slot | manual
  const [walkin, setWalkin] = useState(false); // orden de llegada
  const [cBarberId, setCBarberId] = useState('');
  const [cBarberName, setCBarberName] = useState('');
  const [cDate, setCDate] = useState('');
  const [cTime, setCTime] = useState('10:00');
  const [serviceId, setServiceId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [creating, setCreating] = useState(false);

  const dateStr = ymd(date);
  const isToday = dateStr === ymd(new Date());

  useEffect(() => {
    fetchServices()
      .then((s) => setServices(s?.services || []))
      .catch(() => setServices([]));
  }, []);

  useEffect(() => {
    (async () => {
      if (isOwner || !user?.barberId) {
        try {
          const r = await fetchBarbers();
          setBarbers((r?.barbers || []).filter((b) => b.isActive !== false));
        } catch (_e) {
          setBarbers([]);
        }
      } else {
        setBarbers([{ _id: user.barberId, fullName: user.fullName || 'Yo' }]);
      }
    })();
  }, [isOwner, user]);

  const flatAppts = useCallback(
    async (ds) => {
      try {
        if (isOwner || !user?.barberId) {
          const r = await fetchAppointments(ds);
          return r?.appointments || [];
        }
        const r = await fetchBarberAppointments(user.barberId, ds);
        return r?.appointments || [];
      } catch (_e) {
        return [];
      }
    },
    [isOwner, user],
  );

  const loadDay = useCallback(async () => {
    if (!barbers.length) {
      setColumns([]);
      return;
    }
    const perBarber = await Promise.all(
      barbers.map(async (b) => {
        try {
          const r = await fetchBarberAppointments(b._id, dateStr);
          const busy = (r?.appointments || [])
            .filter((a) => a.status !== 'cancelled')
            .map((a) => {
              const start = startMinOf(a.startTime);
              const dur = (a.durationMinutes || 30) + (a.bufferAfterMinutesApplied || 0);
              return { start, end: start + dur, appt: a };
            });
          const blocked = (r?.barberTimeBlocks || [])
            .map((bl) => ({ start: toMin(bl.start), end: toMin(bl.end) }))
            .filter((x) => x.start != null && x.end != null);
          const ivRaw = Number(
            r?.barber?.bookingSlotIntervalMinutes ?? b.bookingSlotIntervalMinutes ?? 30,
          );
          const interval = ivRaw === 15 ? 15 : 30;
          return {
            barber: b,
            interval,
            workRanges: rangesFromSchedule(r?.resolvedSchedule),
            busy,
            blocked,
          };
        } catch (_e) {
          return { barber: b, interval: 30, workRanges: [], busy: [], blocked: [] };
        }
      }),
    );
    setColumns(perBarber);
  }, [dateStr, barbers]);

  const loadWeek = useCallback(async () => {
    const start = startOfWeek(date);
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
    const results = await Promise.all(
      days.map(async (d) => {
        const appts = (await flatAppts(ymd(d)))
          .filter((a) => a.status !== 'cancelled')
          .sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)));
        return { date: d, appts };
      }),
    );
    setWeekData(results);
  }, [date, flatAppts]);

  const loadMonth = useCallback(async () => {
    const first = new Date(date.getFullYear(), date.getMonth(), 1);
    const gridStart = startOfWeek(first);
    const cells = Array.from({ length: 42 }, (_, i) => {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      return d;
    });
    const monthDays = cells.filter((d) => d.getMonth() === date.getMonth());
    const entries = await Promise.all(
      monthDays.map(async (d) => {
        const appts = (await flatAppts(ymd(d))).filter((a) => a.status !== 'cancelled');
        return [ymd(d), appts];
      }),
    );
    setMonthData({ cells, byDay: Object.fromEntries(entries) });
  }, [date, flatAppts]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      if (view === 'day') await loadDay();
      else if (view === 'week') await loadWeek();
      else await loadMonth();
    } catch (err) {
      setError(err?.message || 'No pudimos cargar la agenda.');
    } finally {
      setLoading(false);
    }
  }, [view, loadDay, loadWeek, loadMonth]);

  useEffect(() => {
    load();
  }, [load]);

  const matchesBarber = useCallback(
    (a) => barberFilter === 'all' || apptBarberId(a) === barberFilter,
    [barberFilter],
  );

  const visibleColumns = useMemo(
    () =>
      barberFilter === 'all'
        ? columns
        : columns.filter((c) => String(c.barber._id) === barberFilter),
    [columns, barberFilter],
  );

  // Paso de la grilla = el intervalo más fino entre los barberos visibles (15 o 30).
  const step = useMemo(() => {
    const ivs = visibleColumns.map((c) => c.interval || 30);
    return ivs.length ? Math.min(...ivs) : 30;
  }, [visibleColumns]);

  const { winStart, winEnd } = useMemo(() => {
    let s = Infinity;
    let e = -Infinity;
    visibleColumns.forEach((c) =>
      c.workRanges.forEach((r) => {
        s = Math.min(s, r.start);
        e = Math.max(e, r.end);
      }),
    );
    if (!Number.isFinite(s) || !Number.isFinite(e) || s >= e) {
      return { winStart: FALLBACK_START, winEnd: FALLBACK_END };
    }
    return {
      winStart: Math.floor(s / step) * step,
      winEnd: Math.ceil(e / step) * step,
    };
  }, [visibleColumns, step]);

  const rows = useMemo(() => {
    const out = [];
    for (let t = winStart; t < winEnd; t += step) out.push(t);
    return out;
  }, [winStart, winEnd, step]);

  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();

  const shift = (dir) =>
    setDate((prev) => {
      const d = new Date(prev);
      if (view === 'day') d.setDate(d.getDate() + dir);
      else if (view === 'week') d.setDate(d.getDate() + 7 * dir);
      else d.setMonth(d.getMonth() + dir);
      return d;
    });

  const periodLabel = useMemo(() => {
    if (view === 'day')
      return date.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
    if (view === 'week') {
      const s = startOfWeek(date);
      const e = new Date(s);
      e.setDate(s.getDate() + 6);
      const f = (d) => d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
      return `${f(s)} – ${f(e)}`;
    }
    return date.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
  }, [view, date]);

  const totalOf = (a) => Number(a?.amountTotal ?? a?.servicePrice ?? 0);

  const openAppt = (a) => {
    if (a.status === 'cancelled') return;
    setMixed(false);
    setCashInput('');
    setTransferInput('');
    setActive(a);
  };

  const applyPay = async (extras) => {
    if (!active) return;
    try {
      setSaving(true);
      await updateAppointmentStatus(active._id, 'completed', extras);
      setActive(null);
      await load();
    } catch (err) {
      alert(err?.message || 'No se pudo actualizar.');
    } finally {
      setSaving(false);
    }
  };
  const confirmMixed = () => {
    const cash = Number(String(cashInput).replace(',', '.')) || 0;
    const transfer = Number(String(transferInput).replace(',', '.')) || 0;
    const sum = Number((cash + transfer).toFixed(2));
    if (sum <= 0) return alert('Ingresá los montos.');
    applyPay({
      paymentMethodCollected: 'mixed',
      paymentStatus: 'paid',
      amountPaid: sum,
      cashAmount: cash,
      transferAmount: transfer,
    });
  };
  const cancelAppt = async () => {
    if (!active) return;
    if (!window.confirm('¿Liberar / cancelar este turno?')) return;
    try {
      setSaving(true);
      await updateAppointmentStatus(active._id, 'cancelled');
      setActive(null);
      await load();
    } catch (err) {
      alert(err?.message || 'No se pudo cancelar.');
    } finally {
      setSaving(false);
    }
  };

  // crear
  const openSlot = (barber, min) => {
    setCMode('slot');
    setWalkin(false);
    setCBarberId(barber._id);
    setCBarberName(barber.fullName);
    setCDate(dateStr);
    setCTime(toHHMM(min));
    setServiceId(services[0]?._id || '');
    setCustomerName('');
    setPhone('');
    setEmail('');
    setCreateOpen(true);
  };
  const openManual = () => {
    setCMode('manual');
    setWalkin(false);
    setCBarberId(barbers[0]?._id || '');
    setCDate(dateStr);
    setCTime('10:00');
    setServiceId(services[0]?._id || '');
    setCustomerName('');
    setPhone('');
    setEmail('');
    setCreateOpen(true);
  };
  const confirmCreate = async () => {
    if (!cBarberId) return alert('Elegí un profesional.');
    if (!customerName.trim()) return alert('Poné el nombre del cliente.');
    const svc = services.find((s) => s._id === serviceId);
    let startLocal;
    if (walkin) {
      startLocal = new Date(); // orden de llegada = ahora
    } else {
      const [y, mo, d] = cDate.split('-').map(Number);
      const [hh, mm] = cTime.split(':').map(Number);
      startLocal = new Date(y, mo - 1, d, hh || 0, mm || 0, 0, 0);
    }
    try {
      setCreating(true);
      await createAppointment({
        barberId: cBarberId,
        customerName: customerName.trim(),
        service: svc?.name || '',
        serviceItems: svc
          ? [{ serviceId: svc._id, name: svc.name, durationMinutes: Number(svc.durationMinutes || 0), price: Number(svc.price || 0) }]
          : [],
        startTime: startLocal.toISOString(),
        durationMinutes: Number(svc?.durationMinutes || GRID_STEP),
        servicePrice: Number(svc?.price || 0),
        notes: phone.trim(),
        email: email.trim(),
        paymentMethod: 'cash',
      });
      setCreateOpen(false);
      await load();
    } catch (err) {
      alert(err?.message || 'No se pudo crear el turno.');
    } finally {
      setCreating(false);
    }
  };

  const cellFor = (col, t) => {
    const apptHere = col.busy.find((b) => b.start >= t && b.start < t + step);
    if (apptHere) return { kind: 'appt', appt: apptHere.appt };
    if (col.busy.some((b) => b.start <= t && t < b.end)) return { kind: 'busy' };
    const iv = col.interval || 30;
    // Solo es hueco creable si la hora cae en el intervalo de ESE barbero.
    const aligned = t % iv === 0;
    const inWork = col.workRanges.some((r) => r.start <= t && t + iv <= r.end);
    const isBlocked = col.blocked.some((b) => b.start <= t && t < b.end);
    const isPast = isToday && t < nowMin;
    if (aligned && inWork && !isBlocked && !isPast) return { kind: 'free' };
    return { kind: 'off' };
  };

  const goToDay = (d) => {
    setDate(d);
    setView('day');
  };

  const reminderFor = (a) => {
    const when = `${new Date(a.startTime).toLocaleDateString('es-AR')} a las ${timeOf(a.startTime)}`;
    const shopName = activeShop?.name || 'el negocio';
    return waLink(
      a.notes,
      `Hola ${a.customerName}, te recordamos tu turno en ${shopName} el ${when}. ¡Te esperamos!`,
    );
  };

  return (
    <div>
      <div className={styles.agendaToolbar}>
        <div className={styles.viewTabs}>
          {[
            { k: 'day', l: 'Día' },
            { k: 'week', l: 'Semana' },
            { k: 'month', l: 'Mes' },
          ].map((v) => (
            <button
              key={v.k}
              className={`${styles.viewTab} ${view === v.k ? styles.viewTabActive : ''}`}
              onClick={() => setView(v.k)}
            >
              {v.l}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div className={styles.periodNav} style={{ minWidth: 250, margin: 0 }}>
            <button className={styles.periodNavBtn} onClick={() => shift(-1)}>
              <ChevronLeft size={18} />
            </button>
            <span className={styles.periodNavLabel}>{periodLabel}</span>
            <button className={styles.periodNavBtn} onClick={() => shift(1)}>
              <ChevronRight size={18} />
            </button>
          </div>
          <button className={styles.primaryBtn} onClick={openManual} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Plus size={16} /> Nuevo turno
          </button>
        </div>
      </div>

      {/* Pestañas de barbero */}
      {isOwner && barbers.length > 1 ? (
        <div className={styles.barberTabs}>
          <button
            className={`${styles.barberTab} ${barberFilter === 'all' ? styles.barberTabActive : ''}`}
            onClick={() => setBarberFilter('all')}
          >
            Todos
          </button>
          {barbers.map((b) => (
            <button
              key={b._id}
              className={`${styles.barberTab} ${
                barberFilter === String(b._id) ? styles.barberTabActive : ''
              }`}
              onClick={() => setBarberFilter(String(b._id))}
            >
              {b.fullName}
            </button>
          ))}
        </div>
      ) : null}

      {error ? <div className={styles.errorBox}>{error}</div> : null}

      {loading ? (
        <p className={styles.muted}>Cargando agenda…</p>
      ) : view === 'day' ? (
        visibleColumns.length === 0 ? (
          <p className={styles.muted}>No hay profesionales para mostrar.</p>
        ) : (
          <div className={styles.calWrap}>
            <div className={styles.calGrid}>
              <div className={styles.calTimeCol}>
                <div className={styles.calColHead} />
                {rows.map((t) => (
                  <div key={t} className={styles.calTimeLabel} style={{ height: ROW_H }}>
                    {toHHMM(t)}
                  </div>
                ))}
              </div>
              {visibleColumns.map((col) => (
                <div key={col.barber._id} className={styles.calCol}>
                  <div className={styles.calColHead}>{col.barber.fullName}</div>
                  {rows.map((t) => {
                    const cell = cellFor(col, t);
                    if (cell.kind === 'appt') {
                      const a = cell.appt;
                      const done = a.status === 'completed';
                      return (
                        <button
                          key={t}
                          className={`${styles.calAppt} ${done ? styles.calApptDone : styles.calApptPending}`}
                          style={{ height: ROW_H }}
                          onClick={() => openAppt(a)}
                        >
                          <span className={styles.calApptName}>{a.customerName}</span>
                          <span className={styles.calApptSvc}>{a.service}</span>
                        </button>
                      );
                    }
                    if (cell.kind === 'busy')
                      return <div key={t} className={styles.calBusy} style={{ height: ROW_H }} />;
                    if (cell.kind === 'free')
                      return (
                        <button
                          key={t}
                          className={styles.calFree}
                          style={{ height: ROW_H }}
                          onClick={() => openSlot(col.barber, t)}
                          title={`Crear turno ${toHHMM(t)}`}
                        >
                          <Plus size={15} />
                        </button>
                      );
                    return <div key={t} className={styles.calOff} style={{ height: ROW_H }} />;
                  })}
                </div>
              ))}
            </div>
          </div>
        )
      ) : view === 'week' ? (
        <div className={styles.calWrap}>
          <div className={styles.weekGrid}>
            {weekData.map(({ date: d, appts }) => {
              const list = appts.filter(matchesBarber);
              const today = ymd(d) === ymd(new Date());
              return (
                <div key={ymd(d)} className={styles.weekCol}>
                  <button
                    className={`${styles.weekColHead} ${today ? styles.weekColToday : ''}`}
                    onClick={() => goToDay(d)}
                  >
                    <span className={styles.weekDayName}>{DOW[(d.getDay() + 6) % 7]}</span>
                    <span className={styles.weekDayNum}>{d.getDate()}</span>
                  </button>
                  <div className={styles.weekBody}>
                    {list.length === 0 ? (
                      <span className={styles.weekEmpty}>—</span>
                    ) : (
                      list.map((a) => (
                        <button
                          key={a._id}
                          className={`${styles.weekChip} ${
                            a.status === 'completed' ? styles.weekChipDone : ''
                          }`}
                          onClick={() => openAppt(a)}
                        >
                          <strong>{timeOf(a.startTime)}</strong> {a.customerName}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className={styles.monthGrid}>
          {DOW.map((d) => (
            <div key={d} className={styles.monthDow}>
              {d}
            </div>
          ))}
          {monthData.cells.map((d) => {
            const out = d.getMonth() !== date.getMonth();
            const count = (monthData.byDay[ymd(d)] || []).filter(matchesBarber).length;
            const today = ymd(d) === ymd(new Date());
            return (
              <button
                key={ymd(d)}
                className={`${styles.monthCell} ${out ? styles.monthCellOut : ''} ${
                  today ? styles.monthCellToday : ''
                }`}
                onClick={() => goToDay(d)}
              >
                <span className={styles.monthDayNum}>{d.getDate()}</span>
                {count > 0 ? (
                  <span className={styles.monthCount}>
                    {count} turno{count > 1 ? 's' : ''}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      )}

      {/* Modal turno */}
      {active ? (
        <div className={styles.modalOverlay} onClick={() => !saving && setActive(null)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>
                {active.status === 'completed' ? 'Turno completado' : '¿Cómo pagó?'}
              </h3>
              <button className={styles.iconBtn} onClick={() => setActive(null)}>
                <X size={18} />
              </button>
            </div>
            <p className={styles.muted} style={{ marginTop: 0 }}>
              {active.customerName} · {active.service} · {formatCurrency(totalOf(active))}
            </p>

            {active.status !== 'completed' ? (
              !mixed ? (
                <div className={styles.payOptions}>
                  <button
                    className={styles.payOpt}
                    disabled={saving}
                    onClick={() => applyPay({ paymentMethodCollected: 'cash', paymentStatus: 'paid', amountPaid: totalOf(active) })}
                  >
                    Efectivo
                  </button>
                  <button
                    className={styles.payOpt}
                    disabled={saving}
                    onClick={() => applyPay({ paymentMethodCollected: 'transfer', paymentStatus: 'paid', amountPaid: totalOf(active) })}
                  >
                    Transferencia / adelantado
                  </button>
                  <button
                    className={`${styles.payOpt} ${styles.payOptMixed}`}
                    disabled={saving}
                    onClick={() => setMixed(true)}
                  >
                    Pago mixto
                  </button>
                  <button
                    className={styles.payOptGhost}
                    disabled={saving}
                    onClick={() => applyPay({ paymentStatus: 'unpaid', amountPaid: 0 })}
                  >
                    Aún no pagó
                  </button>
                </div>
              ) : (
                <div>
                  <span className={styles.fieldLabel}>Efectivo</span>
                  <input className={styles.input} type="number" value={cashInput} onChange={(e) => setCashInput(e.target.value)} />
                  <span className={styles.fieldLabel}>Transferencia</span>
                  <input className={styles.input} type="number" value={transferInput} onChange={(e) => setTransferInput(e.target.value)} />
                  <button className={styles.primaryBtn} style={{ marginTop: 16, width: '100%' }} disabled={saving} onClick={confirmMixed}>
                    {saving ? 'Guardando…' : 'Confirmar pago mixto'}
                  </button>
                  <button className={styles.payOptGhost} onClick={() => setMixed(false)}>
                    Volver
                  </button>
                </div>
              )
            ) : null}

            {!mixed ? (
              <div className={styles.apptActions}>
                {reminderFor(active) ? (
                  <a
                    className={styles.apptActionBtn}
                    href={reminderFor(active)}
                    target="_blank"
                    rel="noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                  >
                    <MessageCircle size={15} /> Recordatorio
                  </a>
                ) : (
                  <span className={styles.apptActionHint}>Sin teléfono cargado</span>
                )}
                {active.status !== 'completed' ? (
                  <button
                    className={`${styles.apptActionBtn} ${styles.apptActionDanger}`}
                    disabled={saving}
                    onClick={cancelAppt}
                    style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                  >
                    <X size={15} /> Liberar / cancelar
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Modal crear */}
      {createOpen ? (
        <div className={styles.modalOverlay} onClick={() => !creating && setCreateOpen(false)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Nuevo turno</h3>
              <button className={styles.iconBtn} onClick={() => setCreateOpen(false)}>
                <X size={18} />
              </button>
            </div>

            {cMode === 'slot' ? (
              <p className={styles.muted} style={{ marginTop: 0 }}>
                {cBarberName} · {cTime} hs · {cDate}
              </p>
            ) : (
              <>
                <div className={styles.segmented} style={{ marginBottom: 12 }}>
                  <button
                    type="button"
                    className={`${styles.segment} ${!walkin ? styles.segmentActive : ''}`}
                    onClick={() => setWalkin(false)}
                  >
                    Con horario
                  </button>
                  <button
                    type="button"
                    className={`${styles.segment} ${walkin ? styles.segmentActive : ''}`}
                    onClick={() => setWalkin(true)}
                  >
                    Orden de llegada
                  </button>
                </div>

                <span className={styles.fieldLabel}>Profesional</span>
                <select className={styles.input} value={cBarberId} onChange={(e) => setCBarberId(e.target.value)}>
                  {barbers.map((b) => (
                    <option key={b._id} value={b._id}>
                      {b.fullName}
                    </option>
                  ))}
                </select>

                {walkin ? (
                  <p className={styles.muted} style={{ marginTop: 10 }}>
                    Se crea <strong>ahora mismo</strong> (orden de llegada).
                  </p>
                ) : (
                  <div className={styles.twoCol} style={{ marginTop: 10 }}>
                    <div>
                      <span className={styles.fieldLabel}>Fecha</span>
                      <input className={styles.input} type="date" value={cDate} onChange={(e) => setCDate(e.target.value)} />
                    </div>
                    <div>
                      <span className={styles.fieldLabel}>Hora</span>
                      <input className={styles.input} type="time" value={cTime} onChange={(e) => setCTime(e.target.value)} />
                    </div>
                  </div>
                )}
              </>
            )}

            <span className={styles.fieldLabel}>Servicio</span>
            <select className={styles.input} value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
              {services.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name} · {formatCurrency(s.price)}
                </option>
              ))}
            </select>

            <span className={styles.fieldLabel}>Cliente</span>
            <input className={styles.input} placeholder="Nombre" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />

            <div className={styles.twoCol} style={{ marginTop: 10 }}>
              <div>
                <span className={styles.fieldLabel}>WhatsApp (opcional)</span>
                <input className={styles.input} placeholder="Ej: 342 000-0000" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div>
                <span className={styles.fieldLabel}>Email (opcional)</span>
                <input className={styles.input} type="email" placeholder="cliente@correo.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
            </div>

            <button className={styles.primaryBtn} style={{ marginTop: 16, width: '100%' }} disabled={creating} onClick={confirmCreate}>
              {creating ? 'Creando…' : 'Crear turno'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default TurnosPage;
