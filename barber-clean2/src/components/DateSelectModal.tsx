import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import type { Theme } from '../context/ThemeContext';

type Props = {
  visible: boolean;
  value?: string | null;
  title?: string;
  theme: Theme;
  onClose: () => void;
  onConfirm: (date: string) => void;
};

const WEEKDAY_LABELS = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];

function normalizeDate(value?: string | null) {
  const text = String(value ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

function parseDateString(value?: string | null) {
  const normalized = normalizeDate(value);
  if (!normalized) return null;
  const [year, month, day] = normalized.split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function formatDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getMonthLabel(date: Date) {
  return new Intl.DateTimeFormat('es-AR', {
    month: 'long',
    year: 'numeric',
  }).format(date);
}

const hexToRgba = (hex: string, alpha: number) => {
  const sanitized = hex.replace('#', '');
  const bigint = parseInt(sanitized.length === 3 ? sanitized.repeat(2) : sanitized, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

export default function DateSelectModal({
  visible,
  value,
  title = 'Elegir fecha',
  theme,
  onClose,
  onConfirm,
}: Props) {
  const initialDate = useMemo(() => parseDateString(value) ?? new Date(), [value]);
  const [displayedMonth, setDisplayedMonth] = useState(
    () => new Date(initialDate.getFullYear(), initialDate.getMonth(), 1, 12, 0, 0, 0),
  );
  const [selectedDate, setSelectedDate] = useState(() => formatDateString(initialDate));

  useEffect(() => {
    if (!visible) return;
    const nextDate = parseDateString(value) ?? new Date();
    setDisplayedMonth(new Date(nextDate.getFullYear(), nextDate.getMonth(), 1, 12, 0, 0, 0));
    setSelectedDate(formatDateString(nextDate));
  }, [value, visible]);

  const styles = useMemo(() => createStyles(theme), [theme]);

  const monthDays = useMemo(() => {
    const year = displayedMonth.getFullYear();
    const month = displayedMonth.getMonth();
    const firstDay = new Date(year, month, 1, 12, 0, 0, 0);
    const offset = firstDay.getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const cells: Array<{ key: string; label: string; value: string; inMonth: boolean }> = [];

    for (let i = 0; i < offset; i += 1) {
      cells.push({
        key: `empty-${i}`,
        label: '',
        value: '',
        inMonth: false,
      });
    }

    for (let day = 1; day <= totalDays; day += 1) {
      const date = new Date(year, month, day, 12, 0, 0, 0);
      cells.push({
        key: formatDateString(date),
        label: String(day),
        value: formatDateString(date),
        inMonth: true,
      });
    }

    return cells;
  }, [displayedMonth]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(event) => event.stopPropagation()}>
          <Text style={styles.title}>{title}</Text>

          <View style={styles.monthHeader}>
            <Pressable
              style={styles.navButton}
              onPress={() =>
                setDisplayedMonth(
                  current => new Date(current.getFullYear(), current.getMonth() - 1, 1, 12, 0, 0, 0),
                )
              }
            >
              <ChevronLeft size={18} color={theme.primary} />
            </Pressable>
            <Text style={styles.monthLabel}>{getMonthLabel(displayedMonth)}</Text>
            <Pressable
              style={styles.navButton}
              onPress={() =>
                setDisplayedMonth(
                  current => new Date(current.getFullYear(), current.getMonth() + 1, 1, 12, 0, 0, 0),
                )
              }
            >
              <ChevronRight size={18} color={theme.primary} />
            </Pressable>
          </View>

          <View style={styles.weekRow}>
            {WEEKDAY_LABELS.map(label => (
              <Text key={label} style={styles.weekLabel}>
                {label}
              </Text>
            ))}
          </View>

          <View style={styles.grid}>
            {monthDays.map(cell => {
              const isSelected = cell.value && cell.value === selectedDate;
              return (
                <Pressable
                  key={cell.key}
                  style={[
                    styles.dayCell,
                    !cell.inMonth && styles.dayCellEmpty,
                    isSelected && styles.dayCellSelected,
                  ]}
                  disabled={!cell.inMonth}
                  onPress={() => setSelectedDate(cell.value)}
                >
                  <Text
                    style={[
                      styles.dayLabel,
                      !cell.inMonth && styles.dayLabelEmpty,
                      isSelected && styles.dayLabelSelected,
                    ]}
                  >
                    {cell.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.actions}>
            <Pressable style={styles.secondaryButton} onPress={onClose}>
              <Text style={styles.secondaryButtonText}>Cancelar</Text>
            </Pressable>
            <Pressable
              style={styles.primaryButton}
              onPress={() => onConfirm(selectedDate)}
            >
              <Text style={styles.primaryButtonText}>Elegir</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.72)',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 18,
    },
    sheet: {
      width: '100%',
      maxWidth: 380,
      borderRadius: 24,
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: hexToRgba(theme.primary, 0.16),
      padding: 18,
    },
    title: {
      color: theme.textPrimary,
      fontSize: 18,
      fontWeight: '800',
      textAlign: 'center',
      marginBottom: 14,
    },
    monthHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 14,
      gap: 10,
    },
    navButton: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: hexToRgba(theme.primary, 0.08),
      borderWidth: 1,
      borderColor: hexToRgba(theme.primary, 0.16),
    },
    monthLabel: {
      flex: 1,
      color: theme.textPrimary,
      fontSize: 16,
      fontWeight: '800',
      textAlign: 'center',
      textTransform: 'capitalize',
    },
    weekRow: {
      flexDirection: 'row',
      marginBottom: 8,
    },
    weekLabel: {
      flex: 1,
      textAlign: 'center',
      color: '#8E96A8',
      fontSize: 12,
      fontWeight: '700',
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
    },
    dayCell: {
      width: '14.2857%',
      aspectRatio: 1,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.border,
      marginBottom: 6,
    },
    dayCellEmpty: {
      opacity: 0,
    },
    dayCellSelected: {
      backgroundColor: theme.primary,
      borderColor: theme.primary,
    },
    dayLabel: {
      color: theme.textPrimary,
      fontSize: 14,
      fontWeight: '700',
    },
    dayLabelEmpty: {
      color: 'transparent',
    },
    dayLabelSelected: {
      color: theme.textOnPrimary,
    },
    actions: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 18,
    },
    secondaryButton: {
      flex: 1,
      minHeight: 46,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.border,
    },
    secondaryButtonText: {
      color: theme.textPrimary,
      fontSize: 14,
      fontWeight: '800',
    },
    primaryButton: {
      flex: 1,
      minHeight: 46,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.primary,
    },
    primaryButtonText: {
      color: theme.textOnPrimary,
      fontSize: 14,
      fontWeight: '800',
    },
  });
}
