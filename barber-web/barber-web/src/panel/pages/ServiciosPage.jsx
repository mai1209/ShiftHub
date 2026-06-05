import React, { useEffect, useState, useCallback } from 'react';
import { Pencil, Trash2, X, Plus, ChevronUp, ChevronDown } from 'lucide-react';
import {
  fetchServices,
  createService,
  updateService,
  deleteService,
  reorderServices,
} from '../../services/panelApi';
import { formatCurrency } from '../usePeriod';
import styles from '../Panel.module.css';

const EMPTY = { name: '', price: '', durationMinutes: '30', commission: '' };

function ServiciosPage() {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reordering, setReordering] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await fetchServices();
      setServices(res?.services || []);
    } catch (err) {
      setError(err?.message || 'No pudimos cargar los servicios.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openNew = () => {
    setEditingId(null);
    setForm(EMPTY);
    setModalOpen(true);
  };
  const openEdit = (s) => {
    setEditingId(s._id);
    setForm({
      name: s.name || '',
      price: s.price != null ? String(s.price) : '',
      durationMinutes: String(s.durationMinutes || 30),
      commission: s.commissionPercent != null ? String(s.commissionPercent) : '',
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return alert('Poné un nombre.');
    const price = Number(String(form.price).replace(',', '.'));
    if (!Number.isFinite(price) || price < 0) return alert('Precio inválido.');
    const durationMinutes = Math.max(10, Math.floor(Number(form.durationMinutes) || 0));
    const commissionPercent =
      String(form.commission).trim() === ''
        ? null
        : Number(String(form.commission).replace(',', '.'));
    try {
      setSaving(true);
      const payload = { name: form.name.trim(), price, durationMinutes, commissionPercent };
      if (editingId) await updateService(editingId, payload);
      else await createService(payload);
      setModalOpen(false);
      await load();
    } catch (err) {
      alert(err?.message || 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (s) => {
    if (!window.confirm(`¿Borrar el servicio "${s.name}"?`)) return;
    try {
      await deleteService(s._id);
      await load();
    } catch (err) {
      alert(err?.message || 'No se pudo borrar.');
    }
  };

  const move = async (index, dir) => {
    const next = index + dir;
    if (next < 0 || next >= services.length) return;
    const reordered = [...services];
    const [item] = reordered.splice(index, 1);
    reordered.splice(next, 0, item);
    setServices(reordered); // optimista
    try {
      setReordering(true);
      await reorderServices(reordered.map((s) => s._id));
    } catch (err) {
      alert(err?.message || 'No se pudo reordenar.');
      await load();
    } finally {
      setReordering(false);
    }
  };

  return (
    <div>
      <div className={styles.pageHead}>
        <div />
        <button
          className={styles.primaryBtn}
          onClick={openNew}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <Plus size={16} /> Nuevo servicio
        </button>
      </div>

      {error ? <div className={styles.errorBox}>{error}</div> : null}

      {loading ? (
        <p className={styles.muted}>Cargando…</p>
      ) : services.length === 0 ? (
        <p className={styles.muted}>Todavía no cargaste servicios.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Orden</th>
                <th>Servicio</th>
                <th>Duración</th>
                <th>Precio</th>
                <th>Comisión</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {services.map((s, i) => (
                <tr key={s._id}>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button
                      className={styles.iconBtn}
                      disabled={i === 0 || reordering}
                      onClick={() => move(i, -1)}
                    >
                      <ChevronUp size={15} />
                    </button>{' '}
                    <button
                      className={styles.iconBtn}
                      disabled={i === services.length - 1 || reordering}
                      onClick={() => move(i, 1)}
                    >
                      <ChevronDown size={15} />
                    </button>
                  </td>
                  <td>{s.name}</td>
                  <td>{s.durationMinutes} min</td>
                  <td>{formatCurrency(s.price)}</td>
                  <td>
                    {s.commissionPercent != null ? (
                      `${s.commissionPercent}%`
                    ) : (
                      <span className={styles.muted}>usa la del profesional</span>
                    )}
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className={styles.iconBtn} onClick={() => openEdit(s)}>
                      <Pencil size={15} />
                    </button>{' '}
                    <button className={styles.iconBtn} onClick={() => handleDelete(s)}>
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen ? (
        <div className={styles.modalOverlay} onClick={() => setModalOpen(false)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>
                {editingId ? 'Editar servicio' : 'Nuevo servicio'}
              </h3>
              <button className={styles.iconBtn} onClick={() => setModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <span className={styles.fieldLabel}>Nombre</span>
            <input
              className={styles.input}
              placeholder="Ej: Corte, Barba…"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />

            <div className={styles.twoCol} style={{ marginTop: 10 }}>
              <div>
                <span className={styles.fieldLabel}>Precio</span>
                <input
                  className={styles.input}
                  type="number"
                  placeholder="0"
                  value={form.price}
                  onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                />
              </div>
              <div>
                <span className={styles.fieldLabel}>Duración (min)</span>
                <input
                  className={styles.input}
                  type="number"
                  placeholder="30"
                  value={form.durationMinutes}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, durationMinutes: e.target.value }))
                  }
                />
              </div>
            </div>

            <span className={styles.fieldLabel}>
              Comisión del servicio (%) — opcional
            </span>
            <input
              className={styles.input}
              type="number"
              placeholder="Vacío = usa la comisión del profesional"
              value={form.commission}
              onChange={(e) => setForm((f) => ({ ...f, commission: e.target.value }))}
            />
            <p className={styles.muted} style={{ fontSize: '0.78rem', marginTop: 6 }}>
              Si la completás, este % pisa la comisión del profesional para este servicio.
            </p>

            <button
              className={styles.primaryBtn}
              style={{ marginTop: 16, width: '100%' }}
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Crear servicio'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default ServiciosPage;
