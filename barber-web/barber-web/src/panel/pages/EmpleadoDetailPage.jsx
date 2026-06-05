import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, Trash2 } from 'lucide-react';
import {
  fetchBarbers,
  updateBarber,
  deactivateBarber,
  upsertBarberAccess,
} from '../../services/panelApi';
import styles from '../Panel.module.css';

const WEEK = [
  { n: 1, l: 'Lun' },
  { n: 2, l: 'Mar' },
  { n: 3, l: 'Mié' },
  { n: 4, l: 'Jue' },
  { n: 5, l: 'Vie' },
  { n: 6, l: 'Sáb' },
  { n: 0, l: 'Dom' },
];

// Lee un archivo de imagen y lo devuelve como data URL redimensionado (chico).
function fileToDataUrl(file, max = 256) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function parseRange(str) {
  const m = String(str || '').match(/(\d{1,2}:\d{2}).*?(\d{1,2}:\d{2})/);
  return m ? { start: m[1], end: m[2] } : { start: '', end: '' };
}

function EmpleadoDetailPage() {
  const { barberId } = useParams();
  const navigate = useNavigate();
  const [barber, setBarber] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const [fullName, setFullName] = useState('');
  const [commission, setCommission] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [workDays, setWorkDays] = useState([]);
  const [slotInterval, setSlotInterval] = useState(30);
  // Franjas (horario partido)
  const [m1, setM1] = useState({ start: '', end: '' });
  const [m2, setM2] = useState({ start: '', end: '' });
  // Bloqueos
  const [blocks, setBlocks] = useState([]);
  const [nb, setNb] = useState({ date: '', start: '', end: '' });

  // Acceso
  const [accessEmail, setAccessEmail] = useState('');
  const [accessPassword, setAccessPassword] = useState('');
  const [accessSaving, setAccessSaving] = useState(false);
  const [accessMsg, setAccessMsg] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await fetchBarbers();
      const b = (res?.barbers || []).find((x) => String(x._id) === String(barberId));
      if (!b) {
        setError('No encontramos ese profesional.');
        return;
      }
      setBarber(b);
      setFullName(b.fullName || '');
      setCommission(b.commissionPercent != null ? String(b.commissionPercent) : '');
      setPhotoUrl(b.photoUrl || '');
      setWorkDays(Array.isArray(b.workDays) ? b.workDays : []);
      setSlotInterval(b.bookingSlotIntervalMinutes === 15 ? 15 : 30);
      const ranges = Array.isArray(b.scheduleRanges) ? b.scheduleRanges : [];
      if (ranges.length) {
        setM1({ start: ranges[0]?.start || '', end: ranges[0]?.end || '' });
        setM2(ranges[1] ? { start: ranges[1].start || '', end: ranges[1].end || '' } : { start: '', end: '' });
      } else {
        setM1(parseRange(b.scheduleRange));
        setM2({ start: '', end: '' });
      }
      setBlocks(
        (b.barberTimeBlocks || []).map((x) => ({
          date: x.date || '',
          start: x.start || '',
          end: x.end || '',
        })),
      );
      setAccessEmail(b.loginAccess?.email || '');
    } catch (err) {
      setError(err?.message || 'No pudimos cargar el profesional.');
    } finally {
      setLoading(false);
    }
  }, [barberId]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleDay = (n) =>
    setWorkDays((prev) =>
      prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n].sort(),
    );

  const handlePhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await fileToDataUrl(file);
      setPhotoUrl(dataUrl);
    } catch (_e) {
      alert('No se pudo procesar la imagen.');
    }
  };

  const addBlock = () => {
    if (!nb.date || !nb.start || !nb.end) {
      return alert('Completá fecha, desde y hasta del bloqueo.');
    }
    setBlocks((prev) => [...prev, { ...nb }]);
    setNb({ date: '', start: '', end: '' });
  };
  const removeBlock = (i) => setBlocks((prev) => prev.filter((_, idx) => idx !== i));

  const handleSave = async () => {
    if (!fullName.trim()) return alert('El nombre es obligatorio.');
    const ranges = [];
    if (m1.start && m1.end) ranges.push({ label: 'mañana', start: m1.start, end: m1.end });
    if (m2.start && m2.end) ranges.push({ label: 'tarde', start: m2.start, end: m2.end });
    try {
      setSaving(true);
      setMsg('');
      await updateBarber(barberId, {
        fullName: fullName.trim(),
        email: barber.email || '',
        phone: barber.phone || '',
        photoUrl: photoUrl || '',
        scheduleRange: m1.start && m1.end ? `${m1.start} - ${m1.end}` : '',
        scheduleRanges: ranges,
        dayScheduleOverrides: barber.dayScheduleOverrides || [],
        barberClosedDays: barber.barberClosedDays || [],
        barberTimeBlocks: blocks,
        bookingBufferMinutes: Number(barber.bookingBufferMinutes || 0),
        bookingSlotIntervalMinutes: slotInterval,
        commissionPercent: Number(String(commission).replace(',', '.')) || 0,
        workDays,
      });
      setMsg('Cambios guardados.');
      await load();
    } catch (err) {
      alert(err?.message || 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async () => {
    if (!window.confirm(`¿Quitar a ${fullName} del equipo? Dejará de aparecer en la agenda.`))
      return;
    try {
      await deactivateBarber(barberId);
      navigate('/empleados', { replace: true });
    } catch (err) {
      alert(err?.message || 'No se pudo desactivar.');
    }
  };

  const handleAccess = async () => {
    if (!accessEmail.trim()) return alert('Ingresá un email para el acceso.');
    const isNew = !barber?.loginAccess?.enabled;
    if (isNew && accessPassword.length < 8) {
      return alert('La contraseña debe tener al menos 8 caracteres.');
    }
    try {
      setAccessSaving(true);
      setAccessMsg('');
      await upsertBarberAccess({
        barberId,
        email: accessEmail.trim().toLowerCase(),
        password: accessPassword || undefined,
      });
      setAccessPassword('');
      setAccessMsg(isNew ? 'Acceso creado.' : 'Acceso actualizado.');
      await load();
    } catch (err) {
      alert(err?.message || 'No se pudo generar el acceso.');
    } finally {
      setAccessSaving(false);
    }
  };

  if (loading) return <p className={styles.muted}>Cargando…</p>;
  if (error) return <div className={styles.errorBox}>{error}</div>;

  return (
    <div>
      <button
        className={styles.backLink}
        onClick={() => navigate('/empleados')}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
      >
        <ChevronLeft size={16} /> Volver al equipo
      </button>
      <div className={styles.detailHead}>
        <h2 className={styles.detailName}>{barber?.fullName}</h2>
        <button
          className={styles.secondaryBtn}
          onClick={() => navigate(`/metricas?barber=${barberId}`)}
        >
          Ver métricas
        </button>
      </div>

      <div className={styles.detailGrid}>
        {/* Configuración */}
        <div className={styles.detailCard}>
          <h3 className={styles.detailCardTitle}>Datos y horario</h3>

          {/* Foto */}
          <span className={styles.fieldLabel}>Foto</span>
          <div className={styles.photoRow}>
            <div className={styles.photoPreview}>
              {photoUrl ? (
                <img src={photoUrl} alt={fullName} />
              ) : (
                <span>{(fullName || '?').charAt(0).toUpperCase()}</span>
              )}
            </div>
            <label className={styles.secondaryBtn} style={{ cursor: 'pointer' }}>
              Subir foto
              <input
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handlePhoto}
              />
            </label>
            {photoUrl ? (
              <button className={styles.backLink} onClick={() => setPhotoUrl('')}>
                Quitar
              </button>
            ) : null}
          </div>

          <span className={styles.fieldLabel}>Nombre</span>
          <input className={styles.input} value={fullName} onChange={(e) => setFullName(e.target.value)} />

          <span className={styles.fieldLabel}>Comisión (%)</span>
          <input
            className={styles.input}
            type="number"
            placeholder="0"
            value={commission}
            onChange={(e) => setCommission(e.target.value)}
          />

          <span className={styles.fieldLabel}>Días de trabajo</span>
          <div className={styles.dayToggles}>
            {WEEK.map((d) => (
              <button
                key={d.n}
                type="button"
                className={`${styles.dayToggle} ${
                  workDays.includes(d.n) ? styles.dayToggleActive : ''
                }`}
                onClick={() => toggleDay(d.n)}
              >
                {d.l}
              </button>
            ))}
          </div>

          {Array.isArray(barber?.dayScheduleOverrides) &&
          barber.dayScheduleOverrides.some((o) => o && o.useBase === false) ? (
            <div className={styles.infoNote}>
              Este profesional tiene <strong>horarios distintos por día</strong>{' '}
              configurados en la app. Acá editás el horario general; esos días
              especiales se respetan y se siguen editando desde la app.
            </div>
          ) : null}

          <span className={styles.fieldLabel}>Horario — Mañana</span>
          <div className={styles.twoCol}>
            <input className={styles.input} type="time" value={m1.start} onChange={(e) => setM1((p) => ({ ...p, start: e.target.value }))} />
            <input className={styles.input} type="time" value={m1.end} onChange={(e) => setM1((p) => ({ ...p, end: e.target.value }))} />
          </div>

          <span className={styles.fieldLabel}>Tarde (opcional — dejá vacío si es corrido)</span>
          <div className={styles.twoCol}>
            <input className={styles.input} type="time" value={m2.start} onChange={(e) => setM2((p) => ({ ...p, start: e.target.value }))} />
            <input className={styles.input} type="time" value={m2.end} onChange={(e) => setM2((p) => ({ ...p, end: e.target.value }))} />
          </div>

          <span className={styles.fieldLabel}>
            Intervalo entre turnos (cada cuánto hay un horario)
          </span>
          <div className={styles.segmented}>
            {[
              { v: 15, l: '15 min' },
              { v: 30, l: '30 min' },
            ].map((o) => (
              <button
                key={o.v}
                type="button"
                className={`${styles.segment} ${slotInterval === o.v ? styles.segmentActive : ''}`}
                onClick={() => setSlotInterval(o.v)}
              >
                {o.l}
              </button>
            ))}
          </div>

          {/* Bloqueos */}
          <span className={styles.fieldLabel}>Bloqueos (días/horas que no atiende)</span>
          {blocks.length === 0 ? (
            <p className={styles.muted} style={{ marginTop: 0 }}>Sin bloqueos.</p>
          ) : (
            <div className={styles.blockList}>
              {blocks.map((bl, i) => (
                <div key={`${bl.date}-${bl.start}-${i}`} className={styles.blockRow}>
                  <span>
                    {bl.date} · {bl.start}–{bl.end}
                  </span>
                  <button className={styles.iconBtn} onClick={() => removeBlock(i)}>
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className={styles.blockAdd}>
            <input className={styles.input} type="date" value={nb.date} onChange={(e) => setNb((p) => ({ ...p, date: e.target.value }))} />
            <input className={styles.input} type="time" value={nb.start} onChange={(e) => setNb((p) => ({ ...p, start: e.target.value }))} />
            <input className={styles.input} type="time" value={nb.end} onChange={(e) => setNb((p) => ({ ...p, end: e.target.value }))} />
            <button className={styles.secondaryBtn} onClick={addBlock}>
              Agregar
            </button>
          </div>

          {msg ? <div className={styles.okBox}>{msg}</div> : null}
          <button
            className={styles.primaryBtn}
            style={{ marginTop: 16, width: '100%' }}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>

        {/* Acceso */}
        <div className={styles.detailCard}>
          <h3 className={styles.detailCardTitle}>Acceso a la app / panel</h3>
          <p className={styles.muted} style={{ marginTop: 0 }}>
            {barber?.loginAccess?.enabled
              ? `Acceso activo: ${barber.loginAccess.email}`
              : 'Este profesional todavía no tiene acceso.'}
          </p>

          <span className={styles.fieldLabel}>Email de acceso</span>
          <input
            className={styles.input}
            type="email"
            placeholder="profesional@correo.com"
            value={accessEmail}
            onChange={(e) => setAccessEmail(e.target.value)}
          />

          <span className={styles.fieldLabel}>
            {barber?.loginAccess?.enabled ? 'Nueva contraseña (opcional)' : 'Contraseña (mín. 8)'}
          </span>
          <input
            className={styles.input}
            type="text"
            placeholder="••••••••"
            value={accessPassword}
            onChange={(e) => setAccessPassword(e.target.value)}
          />

          {accessMsg ? <div className={styles.okBox}>{accessMsg}</div> : null}
          <button
            className={styles.secondaryBtn}
            style={{ marginTop: 16, width: '100%' }}
            onClick={handleAccess}
            disabled={accessSaving}
          >
            {accessSaving
              ? 'Guardando…'
              : barber?.loginAccess?.enabled
              ? 'Actualizar acceso'
              : 'Generar acceso'}
          </button>

          <div className={styles.dangerZone}>
            <button className={styles.dangerBtn} onClick={handleDeactivate}>
              Quitar del equipo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default EmpleadoDetailPage;
