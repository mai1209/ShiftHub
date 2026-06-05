import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  fetchProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  registerSale,
} from '../../services/panelApi';
import { Pencil, Trash2, X, Plus, Minus } from 'lucide-react';
import { formatCurrency } from '../usePeriod';
import styles from '../Panel.module.css';

const EMPTY_FORM = { name: '', price: '', stock: '', isActive: true };

function ProductosPage() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modal producto
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // Modal venta
  const [saleOpen, setSaleOpen] = useState(false);
  const [cart, setCart] = useState({}); // productId -> qty
  const [selling, setSelling] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await fetchProducts();
      setProducts(res?.products || []);
    } catch (err) {
      setError(err?.message || 'No pudimos cargar los productos.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openNew = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  };
  const openEdit = (p) => {
    setEditingId(p._id);
    setForm({
      name: p.name,
      price: String(p.price),
      stock: String(p.stock),
      isActive: p.isActive,
    });
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return alert('Poné un nombre.');
    const price = Number(String(form.price).replace(',', '.'));
    if (!Number.isFinite(price) || price < 0) return alert('Precio inválido.');
    try {
      setSaving(true);
      const payload = {
        name: form.name.trim(),
        price,
        stock: Math.max(0, Math.floor(Number(form.stock) || 0)),
        isActive: form.isActive,
      };
      if (editingId) await updateProduct(editingId, payload);
      else await createProduct(payload);
      setFormOpen(false);
      await load();
    } catch (err) {
      alert(err?.message || 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (p) => {
    if (!window.confirm(`¿Borrar "${p.name}"?`)) return;
    try {
      await deleteProduct(p._id);
      await load();
    } catch (err) {
      alert(err?.message || 'No se pudo borrar.');
    }
  };

  // --- Venta ---
  const openSale = () => {
    setCart({});
    setSaleOpen(true);
  };
  const setQty = (id, qty) =>
    setCart((c) => {
      const next = { ...c };
      if (qty <= 0) delete next[id];
      else next[id] = qty;
      return next;
    });

  const saleItems = useMemo(
    () =>
      Object.entries(cart)
        .map(([productId, quantity]) => {
          const p = products.find((x) => x._id === productId);
          return p ? { product: p, quantity } : null;
        })
        .filter(Boolean),
    [cart, products],
  );

  const saleTotal = saleItems.reduce(
    (acc, it) => acc + it.product.price * it.quantity,
    0,
  );

  const confirmSale = async () => {
    if (!saleItems.length) return alert('Agregá al menos un producto.');
    try {
      setSelling(true);
      await registerSale(
        saleItems.map((it) => ({ productId: it.product._id, quantity: it.quantity })),
      );
      setSaleOpen(false);
      await load();
      alert(`Venta registrada por ${formatCurrency(saleTotal)}. Quedó en Caja como ingreso.`);
    } catch (err) {
      alert(err?.message || 'No se pudo registrar la venta.');
    } finally {
      setSelling(false);
    }
  };

  const activeProducts = products.filter((p) => p.isActive);

  return (
    <div>
      <div className={styles.pageHead}>
        <div />
        <div style={{ display: 'flex', gap: 10 }}>
          <button className={styles.secondaryBtn} onClick={openSale}>
            Registrar venta
          </button>
          <button
            className={styles.primaryBtn}
            onClick={openNew}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Plus size={16} /> Nuevo producto
          </button>
        </div>
      </div>

      {error ? <div className={styles.errorBox}>{error}</div> : null}

      {loading ? (
        <p className={styles.muted}>Cargando…</p>
      ) : products.length === 0 ? (
        <p className={styles.muted}>Todavía no cargaste productos.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Producto</th>
                <th>Precio</th>
                <th>Stock</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p._id}>
                  <td>{p.name}</td>
                  <td>{formatCurrency(p.price)}</td>
                  <td>{p.stock}</td>
                  <td>
                    <span
                      className={`${styles.statusBadge} ${
                        p.isActive ? styles.statusOn : styles.statusOff
                      }`}
                    >
                      {p.isActive ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className={styles.iconBtn} onClick={() => openEdit(p)}>
                      <Pencil size={15} />
                    </button>{' '}
                    <button className={styles.iconBtn} onClick={() => handleDelete(p)}>
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal producto */}
      {formOpen ? (
        <div className={styles.modalOverlay} onClick={() => setFormOpen(false)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>
                {editingId ? 'Editar producto' : 'Nuevo producto'}
              </h3>
              <button className={styles.iconBtn} onClick={() => setFormOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <span className={styles.fieldLabel}>Nombre</span>
            <input
              className={styles.input}
              placeholder="Ej: Cera, Shampoo…"
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
                <span className={styles.fieldLabel}>Stock</span>
                <input
                  className={styles.input}
                  type="number"
                  placeholder="0"
                  value={form.stock}
                  onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))}
                />
              </div>
            </div>
            <label className={styles.checkRow}>
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) =>
                  setForm((f) => ({ ...f, isActive: e.target.checked }))
                }
              />
              Activo (disponible para vender)
            </label>
            <button
              className={styles.primaryBtn}
              style={{ marginTop: 16, width: '100%' }}
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Crear producto'}
            </button>
          </div>
        </div>
      ) : null}

      {/* Modal venta */}
      {saleOpen ? (
        <div className={styles.modalOverlay} onClick={() => !selling && setSaleOpen(false)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Registrar venta</h3>
              <button className={styles.iconBtn} onClick={() => setSaleOpen(false)}>
                <X size={18} />
              </button>
            </div>

            {activeProducts.length === 0 ? (
              <p className={styles.muted}>No hay productos activos para vender.</p>
            ) : (
              <div className={styles.saleList}>
                {activeProducts.map((p) => {
                  const qty = cart[p._id] || 0;
                  return (
                    <div key={p._id} className={styles.saleRow}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span className={styles.entryDesc}>{p.name}</span>
                        <span className={styles.entryMeta}>
                          {formatCurrency(p.price)} · stock {p.stock}
                        </span>
                      </div>
                      <div className={styles.qtyBox}>
                        <button
                          className={styles.iconBtn}
                          onClick={() => setQty(p._id, Math.max(0, qty - 1))}
                        >
                          <Minus size={15} />
                        </button>
                        <span className={styles.qtyVal}>{qty}</span>
                        <button
                          className={styles.iconBtn}
                          disabled={qty >= p.stock}
                          onClick={() => setQty(p._id, qty + 1)}
                        >
                          <Plus size={15} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className={styles.saleTotalRow}>
              <span>Total</span>
              <strong>{formatCurrency(saleTotal)}</strong>
            </div>

            <button
              className={styles.primaryBtn}
              style={{ marginTop: 8, width: '100%' }}
              onClick={confirmSale}
              disabled={selling || saleItems.length === 0}
            >
              {selling ? 'Registrando…' : 'Confirmar venta'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default ProductosPage;
