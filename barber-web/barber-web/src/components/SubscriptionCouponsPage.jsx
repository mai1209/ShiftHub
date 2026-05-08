import { useCallback, useMemo, useState } from 'react';
import { fetchSubscriptions } from '../services/adminApi';
import styles from '../styles/SubscriptionCouponsPage.module.css';

function formatDate(value) {
  if (!value) return 'Sin fecha';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

function getStatusLabel(value) {
  if (value === 'active') return 'Activa';
  if (value === 'past_due') return 'Pago pendiente';
  if (value === 'cancelled') return 'Cancelada';
  return 'Cuenta de prueba';
}

function getPlanLabel(value) {
  if (value === 'pro') return 'Pro';
  if (value === 'custom') return 'Personalizable';
  return 'Básico';
}

function getCouponDurationLabel(subscription) {
  if (subscription?.couponBenefitDurationType === 'one_time') {
    return 'Solo primer pago';
  }

  if (subscription?.couponBenefitDurationType === 'days') {
    return `Durante ${subscription?.couponBenefitDurationValue || 0} dias`;
  }

  if (subscription?.couponBenefitDurationType === 'months') {
    return `Durante ${subscription?.couponBenefitDurationValue || 0} meses`;
  }

  return 'Permanente';
}

function hasActiveCoupon(subscription) {
  const couponCode = String(subscription?.couponCode || '').trim();
  if (!couponCode) return false;

  const validUntil = subscription?.couponValidUntil
    ? new Date(subscription.couponValidUntil)
    : null;

  if (!validUntil || Number.isNaN(validUntil.getTime())) {
    return true;
  }

  return validUntil.getTime() >= Date.now();
}

export default function SubscriptionCouponsPage() {
  const [secret, setSecret] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [users, setUsers] = useState([]);

  const loadUsers = useCallback(async () => {
    if (!secret.trim()) {
      setError('Ingresá el secret de administración para cargar las cuentas.');
      setUsers([]);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetchSubscriptions({
        secret: secret.trim(),
        search: search.trim(),
      });
      setUsers(response.users || []);
    } catch (err) {
      setError(err.message || 'No pudimos cargar las cuentas.');
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [search, secret]);

  const activeCouponUsers = useMemo(
    () => users.filter((user) => hasActiveCoupon(user.subscription)),
    [users],
  );

  const summary = useMemo(() => {
    return {
      total: activeCouponUsers.length,
      active: activeCouponUsers.filter((user) => user.subscription?.status === 'active').length,
      basic: activeCouponUsers.filter((user) => user.subscription?.plan === 'basic').length,
      pro: activeCouponUsers.filter((user) => user.subscription?.plan === 'pro').length,
    };
  }, [activeCouponUsers]);

  return (
    <main className={styles.screen}>
      <section className={styles.hero}>
        <p className={styles.eyebrow}>ADMIN CUPONES</p>
        <h1 className={styles.title}>Cuentas con cupón activo</h1>
        <p className={styles.subtitle}>
          Vista rápida para ver quién tiene beneficio activo, qué cupón usa y hasta cuándo aplica.
        </p>
      </section>

      <section className={styles.toolbar}>
        <form
          className={styles.toolbarForm}
          onSubmit={(event) => {
            event.preventDefault();
            loadUsers();
          }}
        >
          <label className={styles.field}>
            <span>Secret admin</span>
            <input
              type="password"
              value={secret}
              onChange={(event) => setSecret(event.target.value)}
              placeholder="Pegá tu secret del backend"
            />
          </label>

          <label className={styles.field}>
            <span>Buscar</span>
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Nombre, mail o slug"
            />
          </label>

          <button type="submit" className={styles.loadButton} disabled={loading}>
            {loading ? 'Cargando...' : 'Cargar cuentas'}
          </button>
        </form>
      </section>

      {error ? <div className={styles.errorBox}>{error}</div> : null}

      {!error && users.length > 0 ? (
        <section className={styles.summaryGrid}>
          <article className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Con cupón activo</span>
            <strong className={styles.summaryValue}>{summary.total}</strong>
          </article>
          <article className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Activas</span>
            <strong className={styles.summaryValue}>{summary.active}</strong>
          </article>
          <article className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Básico</span>
            <strong className={styles.summaryValue}>{summary.basic}</strong>
          </article>
          <article className={styles.summaryCard}>
            <span className={styles.summaryLabel}>Pro</span>
            <strong className={styles.summaryValue}>{summary.pro}</strong>
          </article>
        </section>
      ) : null}

      <section className={styles.list}>
        {users.length > 0 && activeCouponUsers.length === 0 ? (
          <article className={styles.emptyCard}>
            <h2>No encontramos cuentas con cupón activo</h2>
            <p>
              Revisá el secret, el buscador o si ese beneficio ya venció en las cuentas que
              esperabas ver.
            </p>
          </article>
        ) : null}

        {activeCouponUsers.map((user) => (
          <article key={user._id} className={styles.card}>
            <div className={styles.cardTop}>
              <div>
                <h2 className={styles.cardTitle}>{user.fullName}</h2>
                <p className={styles.cardMeta}>
                  {user.email} · /{user.shopSlug}
                </p>
              </div>
              <span className={styles.couponBadge}>{user.subscription?.couponCode}</span>
            </div>

            <div className={styles.detailsGrid}>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Plan</span>
                <strong className={styles.detailValue}>{getPlanLabel(user.subscription?.plan)}</strong>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Estado</span>
                <strong className={styles.detailValue}>{getStatusLabel(user.subscription?.status)}</strong>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Descuento</span>
                <strong className={styles.detailValue}>
                  {Number(user.subscription?.couponDiscountPercent || 0)}% OFF
                </strong>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Duración</span>
                <strong className={styles.detailValue}>
                  {getCouponDurationLabel(user.subscription)}
                </strong>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Aplicado</span>
                <strong className={styles.detailValue}>
                  {formatDate(user.subscription?.couponAppliedAt)}
                </strong>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Válido hasta</span>
                <strong className={styles.detailValue}>
                  {formatDate(user.subscription?.couponValidUntil)}
                </strong>
              </div>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
