import React from 'react';
import styles from '../Panel.module.css';

function PlaceholderPage({ title, description }) {
  return (
    <div>
      <h1 className={styles.pageTitle}>{title}</h1>
      {description ? <p className={styles.pageSubtitle}>{description}</p> : null}
      <div className={styles.placeholderCard}>
        <span className={styles.placeholderBadge}>Próximamente</span>
        <p className={styles.placeholderText}>
          Esta sección se conecta con el backend en la siguiente etapa.
        </p>
      </div>
    </div>
  );
}

export default PlaceholderPage;
