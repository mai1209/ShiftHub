import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchBarbers, reactivateBarber } from '../../services/panelApi';
import styles from '../Panel.module.css';

function EmpleadosPage() {
  const navigate = useNavigate();
  const [barbers, setBarbers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await fetchBarbers(true); // incluye inactivos
      setBarbers(res?.barbers || []);
    } catch (err) {
      setError(err?.message || 'No pudimos cargar el equipo.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const active = barbers.filter((b) => b.isActive !== false);
  const inactive = barbers.filter((b) => b.isActive === false);

  const handleReactivate = async (b) => {
    try {
      await reactivateBarber(b._id);
      await load();
    } catch (err) {
      alert(err?.message || 'No se pudo reactivar.');
    }
  };

  return (
    <div>
      {error ? <div className={styles.errorBox}>{error}</div> : null}

      {loading ? (
        <p className={styles.muted}>Cargando…</p>
      ) : active.length === 0 && inactive.length === 0 ? (
        <p className={styles.muted}>Todavía no cargaste profesionales.</p>
      ) : (
        <>
          {active.length === 0 ? (
            <p className={styles.muted}>No hay profesionales activos.</p>
          ) : (
            <div className={styles.teamGrid}>
              {active.map((b) => {
                const commission =
                  b.commissionPercent != null ? `${b.commissionPercent}%` : '—';
                return (
                  <button
                    key={b._id}
                    className={styles.teamCard}
                    onClick={() => navigate(`/empleados/${b._id}`)}
                  >
                    <div className={styles.teamAvatar}>
                      {b.photoUrl ? (
                        <img src={b.photoUrl} alt={b.fullName} />
                      ) : (
                        <span>{(b.fullName || '?').charAt(0).toUpperCase()}</span>
                      )}
                    </div>
                    <div className={styles.teamInfo}>
                      <span className={styles.teamName}>{b.fullName}</span>
                      <span className={styles.teamMeta}>Comisión: {commission}</span>
                    </div>
                    <span className={`${styles.statusBadge} ${styles.statusOn}`}>
                      Activo
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {inactive.length > 0 ? (
            <>
              <h2 className={styles.sectionTitle}>Inactivos</h2>
              <div className={styles.teamGrid}>
                {inactive.map((b) => (
                  <div key={b._id} className={`${styles.teamCard} ${styles.teamCardInactive}`}>
                    <div className={styles.teamAvatar}>
                      {b.photoUrl ? (
                        <img src={b.photoUrl} alt={b.fullName} />
                      ) : (
                        <span>{(b.fullName || '?').charAt(0).toUpperCase()}</span>
                      )}
                    </div>
                    <div className={styles.teamInfo}>
                      <span className={styles.teamName}>{b.fullName}</span>
                      <span className={styles.teamMeta}>Fuera del equipo</span>
                    </div>
                    <button
                      className={styles.secondaryBtn}
                      onClick={() => handleReactivate(b)}
                    >
                      Reactivar
                    </button>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </>
      )}
    </div>
  );
}

export default EmpleadosPage;
