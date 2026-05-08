import styles from '../styles/App.module.css';

export default function NotFoundPage() {
  return (
    <main className={styles.app}>
      <div className={styles.glow} aria-hidden="true" />
      <section className={styles.notFoundCard}>
        <p className={styles.notFoundEyebrow}>ERROR 404</p>
        <h1 className={styles.notFoundTitle}>Esta página no existe</h1>
        <p className={styles.notFoundText}>
          La ruta que abriste no corresponde a una barbería activa o ya no está disponible.
        </p>
        <a href="/" className={styles.notFoundButton}>
          Volver al inicio
        </a>
      </section>
    </main>
  );
}
