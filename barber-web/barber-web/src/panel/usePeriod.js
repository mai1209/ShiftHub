import { useState, useCallback } from 'react';

function toYmd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

export const RANGE_OPTIONS = [
  { key: 'daily', label: 'Día' },
  { key: 'weekly', label: 'Semana' },
  { key: 'monthly', label: 'Mes' },
  { key: 'annual', label: 'Año' },
];

// Maneja el modo de rango (Día/Semana/Mes/Año) + navegación ← →.
export function usePeriod(initialMode = 'monthly') {
  const [rangeMode, setRangeMode] = useState(initialMode);
  const [refDate, setRefDate] = useState(() => new Date());

  const buildParams = useCallback(() => {
    if (rangeMode === 'daily') return { range: 'daily', date: toYmd(refDate) };
    if (rangeMode === 'weekly') return { range: 'weekly', date: toYmd(refDate) };
    if (rangeMode === 'annual')
      return { range: 'annual', year: refDate.getFullYear() };
    return {
      range: 'monthly',
      year: refDate.getFullYear(),
      month: refDate.getMonth() + 1,
    };
  }, [rangeMode, refDate]);

  const shiftPeriod = useCallback(
    (dir) => {
      setRefDate((prev) => {
        const d = new Date(prev);
        if (rangeMode === 'daily') d.setDate(d.getDate() + dir);
        else if (rangeMode === 'weekly') d.setDate(d.getDate() + dir * 7);
        else if (rangeMode === 'annual') d.setFullYear(d.getFullYear() + dir);
        else d.setMonth(d.getMonth() + dir);
        return d;
      });
    },
    [rangeMode],
  );

  return { rangeMode, setRangeMode, refDate, buildParams, shiftPeriod, toYmd };
}

export function formatCurrency(value) {
  return `$${Math.max(0, Number(value || 0)).toLocaleString('es-AR')}`;
}
