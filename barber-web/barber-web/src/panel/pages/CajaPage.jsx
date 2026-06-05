import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  fetchCashSummary,
  fetchCashEntries,
  createCashEntry,
  updateCashEntry,
  deleteCashEntry,
} from '../../services/panelApi';
import { Pencil, Trash2, X, Plus } from 'lucide-react';
import { usePeriod, formatCurrency } from '../usePeriod';
import PeriodSelector from '../components/PeriodSelector';
import styles from '../Panel.module.css';

const EXPENSE_CATEGORIES = [
  'Alquiler',
  'Sueldos',
  'Insumos',
  'Productos',
  'Servicios',
  'Otro',
];
const INCOME_CATEGORIES = ['Producto', 'Propina', 'Otro'];

const EMPTY_FORM = { type: 'expense', amount: '', description: '', category: '' };

function CajaPage() {
  const { rangeMode, setRangeMode, refDate, buildParams, shiftPeriod } =
    usePeriod('monthly');
  const [summary, setSummary] = useState(null);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const params = buildParams();
      const [s, e] = await Promise.all([
        fetchCashSummary(params),
        fetchCashEntries(params),
      ]);
      setSummary(s);
      setEntries(e?.entries || []);
    } catch (err) {
      setError(err?.message || 'No pudimos cargar la caja.');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeMode, refDate]);

  useEffect(() => {
    load();
  }, [load]);

  const categoryBreakdown = useMemo(() => {
    const map = new Map();
    entries.forEach((entry) => {
      const cat = (entry.category || '').trim() || 'Sin categoría';
      const key = `${entry.type}|${cat}`;
      const cur = map.get(key) || { category: cat, type: entry.type, total: 0 };
      cur.total += Number(entry.amount || 0);
      map.set(key, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [entries]);

  const openNew = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };

  const openEdit = (entry) => {
    setEditingId(entry._id);
    setForm({
      type: entry.type,
      amount: String(entry.amount),
      description: entry.description || '',
      category: entry.category || '',
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const handleSave = async () => {
    const amount = Number(String(form.amount).replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) {
      alert('Ingresá un monto mayor a 0.');
      return;
    }
    try {
      setSaving(true);
      const payload = {
        type: form.type,
        amount,
        description: form.description.trim(),
        category: form.category.trim() || undefined,
      };
      if (editingId) await updateCashEntry(editingId, payload);
      else await createCashEntry(payload);
      closeModal();
      await load();
    } catch (err) {
      alert(err?.message || 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (entry) => {
    if (!window.confirm(`¿Borrar "${entry.description || 'movimiento'}"?`)) return;
    try {
      await deleteCashEntry(entry._id);
      await load();
    } catch (err) {
      alert(err?.message || 'No se pudo borrar.');
    }
  };

  const categories = form.type === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;

  return (
    <div>
      <div className={styles.pageHead}>
        <div />
        <button
          className={styles.primaryBtn}
          onClick={openNew}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <Plus size={16} /> Cargar movimiento
        </button>
      </div>

      <PeriodSelector
        rangeMode={rangeMode}
        setRangeMode={setRangeMode}
        shiftPeriod={shiftPeriod}
        label={summary?.period?.label}
      />

      {error ? <div className={styles.errorBox}>{error}</div> : null}

      <div className={styles.cardsGrid}>
        <div className={styles.infoCard}>
          <span className={styles.infoCardLabel}>Ingresos totales</span>
          <strong className={styles.infoCardValue}>
            {summary ? formatCurrency(summary.totalIncome) : '…'}
          </strong>
        </div>
        <div className={styles.infoCard}>
          <span className={styles.infoCardLabel}>Egresos</span>
          <strong className={styles.infoCardValue} style={{ color: '#ef4444' }}>
            {summary ? formatCurrency(summary.expenses) : '…'}
          </strong>
        </div>
        <div className={styles.infoCard}>
          <span className={styles.infoCardLabel}>Ganancia</span>
          <strong className={styles.infoCardValue} style={{ color: '#16a34a' }}>
            {summary ? formatCurrency(summary.profit) : '…'}
          </strong>
        </div>
        <div className={styles.infoCard}>
          <span className={styles.infoCardLabel}>Servicios / Manual / Comis.</span>
          <strong className={styles.infoCardValueSm}>
            {summary
              ? `${formatCurrency(summary.localServiceIncome)} · ${formatCurrency(
                  summary.manualIncome,
                )} · ${formatCurrency(summary.commissions)}`
              : '…'}
          </strong>
        </div>
      </div>

      {categoryBreakdown.length > 0 ? (
        <>
          <h2 className={styles.sectionTitle}>Por categoría</h2>
          <div className={styles.catList}>
            {categoryBreakdown.map((item) => (
              <div key={`${item.type}|${item.category}`} className={styles.catRow}>
                <span
                  className={styles.catDot}
                  style={{
                    background: item.type === 'income' ? '#16a34a' : '#ef4444',
                  }}
                />
                <span className={styles.catName}>{item.category}</span>
                <span className={styles.catType}>
                  {item.type === 'income' ? 'Ingreso' : 'Egreso'}
                </span>
                <strong
                  className={styles.catTotal}
                  style={{ color: item.type === 'income' ? '#16a34a' : '#ef4444' }}
                >
                  {item.type === 'income' ? '+' : '−'} {formatCurrency(item.total)}
                </strong>
              </div>
            ))}
          </div>
        </>
      ) : null}

      <h2 className={styles.sectionTitle}>Movimientos del período</h2>
      {loading ? (
        <p className={styles.muted}>Cargando…</p>
      ) : entries.length === 0 ? (
        <p className={styles.muted}>No hay movimientos en este período.</p>
      ) : (
        <div className={styles.entriesList}>
          {entries.map((entry) => {
            const isIncome = entry.type === 'income';
            return (
              <div key={entry._id} className={styles.entryRow}>
                <div className={styles.entryInfo}>
                  <span className={styles.entryDesc}>
                    {entry.description || (isIncome ? 'Ingreso' : 'Egreso')}
                  </span>
                  <span className={styles.entryMeta}>
                    {new Date(entry.date).toLocaleDateString('es-AR')}
                    {entry.category ? ` · ${entry.category}` : ''}
                  </span>
                </div>
                <strong
                  className={styles.entryAmount}
                  style={{ color: isIncome ? '#16a34a' : '#ef4444' }}
                >
                  {isIncome ? '+' : '−'} {formatCurrency(entry.amount)}
                </strong>
                <button className={styles.iconBtn} onClick={() => openEdit(entry)}>
                  <Pencil size={15} />
                </button>
                <button
                  className={styles.iconBtn}
                  onClick={() => handleDelete(entry)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {modalOpen ? (
        <div className={styles.modalOverlay} onClick={closeModal}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>
                {editingId ? 'Editar movimiento' : 'Nuevo movimiento'}
              </h3>
              <button className={styles.iconBtn} onClick={closeModal}>
                <X size={18} />
              </button>
            </div>

            <div className={styles.typeToggle}>
              <button
                className={`${styles.typeOpt} ${
                  form.type === 'income' ? styles.typeOptIncome : ''
                }`}
                onClick={() => setForm((f) => ({ ...f, type: 'income', category: '' }))}
              >
                Ingreso
              </button>
              <button
                className={`${styles.typeOpt} ${
                  form.type === 'expense' ? styles.typeOptExpense : ''
                }`}
                onClick={() => setForm((f) => ({ ...f, type: 'expense', category: '' }))}
              >
                Egreso
              </button>
            </div>

            <input
              className={styles.input}
              type="number"
              placeholder="Monto"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            />
            <input
              className={styles.input}
              style={{ marginTop: 10 }}
              placeholder="Descripción (ej. alquiler, shampoo)"
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
            />

            <span className={styles.fieldLabel}>Categoría</span>
            <div className={styles.chips}>
              {categories.map((cat) => (
                <button
                  key={cat}
                  className={`${styles.chip} ${
                    form.category === cat ? styles.chipActive : ''
                  }`}
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      category: f.category === cat ? '' : cat,
                    }))
                  }
                >
                  {cat}
                </button>
              ))}
            </div>

            <button
              className={styles.primaryBtn}
              style={{ marginTop: 18, width: '100%' }}
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Guardar'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default CajaPage;
