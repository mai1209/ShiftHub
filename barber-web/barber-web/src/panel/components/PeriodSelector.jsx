import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { RANGE_OPTIONS } from '../usePeriod';
import styles from '../Panel.module.css';

// Selector Día/Semana/Mes/Año + flechas ← →.
function PeriodSelector({ rangeMode, setRangeMode, shiftPeriod, label }) {
  return (
    <div className={styles.periodWrap}>
      <div className={styles.rangeTabs}>
        {RANGE_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            type="button"
            className={`${styles.rangeTab} ${
              rangeMode === opt.key ? styles.rangeTabActive : ''
            }`}
            onClick={() => setRangeMode(opt.key)}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <div className={styles.periodNav}>
        <button
          type="button"
          className={styles.periodNavBtn}
          onClick={() => shiftPeriod(-1)}
        >
          <ChevronLeft size={18} />
        </button>
        <span className={styles.periodNavLabel}>{label || '—'}</span>
        <button
          type="button"
          className={styles.periodNavBtn}
          onClick={() => shiftPeriod(1)}
        >
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}

export default PeriodSelector;
