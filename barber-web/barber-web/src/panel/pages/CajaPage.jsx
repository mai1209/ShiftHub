import React, { useEffect, useState, useCallback } from 'react';
import {
  fetchCashSummary,
  fetchCashEntries,
  createCashEntry,
  updateCashEntry,
  deleteCashEntry,
  updateAppointmentStatus,
  deleteAppointment,
} from '../../services/panelApi';
import { Pencil, Trash2, X, Plus, RotateCcw } from 'lucide-react';
import { usePeriod, formatCurrency } from '../usePeriod';
import PeriodSelector from '../components/PeriodSelector';
import { runMetricsExport } from '../exportMetrics';
import { useAuth } from '../AuthContext';
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
  const { isOwner } = useAuth();
  const { rangeMode, setRangeMode, refDate, buildParams, shiftPeriod } =
    usePeriod('monthly');
  const [summary, setSummary] = useState(null);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [showAllServices, setShowAllServices] = useState(false);
  const [showAllEntries, setShowAllEntries] = useState(false);
  const PREVIEW = 5;

  const doExport = async (kind) => {
    try {
      setExporting(true);
      await runMetricsExport(kind, { params: buildParams(), isOwner });
    } catch (err) {
      alert(err?.message || 'No se pudo exportar.');
    } finally {
      setExporting(false);
    }
  };

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

  const undoService = async (id) => {
    if (!window.confirm('¿Deshacer el cobro? El turno vuelve a pendiente.')) return;
    try {
      await updateAppointmentStatus(id, 'pending');
      await load();
    } catch (err) {
      alert(err?.message || 'No se pudo deshacer.');
    }
  };

  const removeService = async (id) => {
    if (!window.confirm('¿Eliminar este turno definitivamente?')) return;
    try {
      await deleteAppointment(id);
      await load();
    } catch (err) {
      alert(err?.message || 'No se pudo eliminar.');
    }
  };

  const methodLabel = (m) =>
    m === 'transfer' ? 'Transferencia' : m === 'mixed' ? 'Mixto' : 'Efectivo';

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

      {isOwner ? (
        <div className={styles.exportRow}>
          <button
            className={styles.secondaryBtn}
            onClick={() => doExport('pdf')}
            disabled={loading || exporting}
          >
            Exportar PDF
          </button>
          <button
            className={styles.secondaryBtn}
            onClick={() => doExport('excel')}
            disabled={loading || exporting}
          >
            Exportar Excel
          </button>
        </div>
      ) : null}

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


      {summary?.services?.length > 0 ? (
        <>
          <h2 className={styles.sectionTitle}>Servicios cobrados</h2>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Cliente</th>
                  <th>Servicio</th>
                  <th>Pago</th>
                  <th>Monto</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(showAllServices
                  ? summary.services
                  : summary.services.slice(0, PREVIEW)
                ).map((s) => (
                  <tr key={s._id}>
                    <td>
                      {s.startTime
                        ? new Date(s.startTime).toLocaleDateString('es-AR')
                        : '—'}
                    </td>
                    <td>{s.customerName}</td>
                    <td>{s.service}</td>
                    <td>{methodLabel(s.method)}</td>
                    <td>{formatCurrency(s.amount)}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button
                        className={styles.iconBtn}
                        title="Deshacer cobro"
                        onClick={() => undoService(s._id)}
                      >
                        <RotateCcw size={15} />
                      </button>{' '}
                      <button
                        className={styles.iconBtn}
                        title="Eliminar turno"
                        onClick={() => removeService(s._id)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {summary.services.length > PREVIEW ? (
            <button
              className={styles.showMoreBtn}
              onClick={() => setShowAllServices((v) => !v)}
            >
              {showAllServices
                ? 'Ver menos'
                : `Ver más (${summary.services.length - PREVIEW})`}
            </button>
          ) : null}
        </>
      ) : null}

      <h2 className={styles.sectionTitle}>Movimientos del período</h2>
      {loading ? (
        <p className={styles.muted}>Cargando…</p>
      ) : entries.length === 0 ? (
        <p className={styles.muted}>No hay movimientos en este período.</p>
      ) : (
        <div className={styles.entriesList}>
          {(showAllEntries ? entries : entries.slice(0, PREVIEW)).map((entry) => {
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
          {entries.length > PREVIEW ? (
            <button
              className={styles.showMoreBtn}
              onClick={() => setShowAllEntries((v) => !v)}
            >
              {showAllEntries
                ? 'Ver menos'
                : `Ver más (${entries.length - PREVIEW})`}
            </button>
          ) : null}
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
