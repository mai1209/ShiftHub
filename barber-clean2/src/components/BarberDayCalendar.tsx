import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { Appointment } from '../services/api';
import type { Theme } from '../context/ThemeContext';

const SHOP_TZ = 'America/Argentina/Cordoba';
const CAL_HOUR_H = 104;

const WEEKDAY_IDX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const shopWeekday = (value: string | number | Date): number => {
  const wd = new Intl.DateTimeFormat('en-US', {
    timeZone: SHOP_TZ,
    weekday: 'short',
  }).format(new Date(value));
  return WEEKDAY_IDX[wd] ?? new Date(value).getDay();
};

const shopDateStr = (date: Date): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: SHOP_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);

// ¿Atiende esa fecha? Igual que el backend: día laboral + día no cerrado.
const barberWorksOn = (barber: any, date: Date): boolean => {
  const closed = (barber?.barberClosedDays || []).some(
    (c: any) => c?.date === shopDateStr(date),
  );
  if (closed) return false;
  const wd = Array.isArray(barber?.workDays) ? barber.workDays.map(Number) : [];
  if (!wd.length) return true;
  return wd.includes(shopWeekday(date));
};

const hexToRgba = (hex: string, alpha: number) => {
  const s = hex.replace('#', '');
  const n = parseInt(s.length === 3 ? s.repeat(2) : s, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

const formatTimeOnly = (value: string) =>
  new Date(value).toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: SHOP_TZ,
  });

// Hora/minuto en la zona de la barbería, en 24h y sin depender del formato local.
const calStartMin = (iso: string) => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: SHOP_TZ,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(iso));
  let h = Number(parts.find(p => p.type === 'hour')?.value) || 0;
  if (h === 24) h = 0;
  const m = Number(parts.find(p => p.type === 'minute')?.value) || 0;
  return h * 60 + m;
};

const hmToMin = (s: string) => {
  const [h, m] = String(s).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

const minToLabel = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(
    2,
    '0',
  )}`;

const barberRangesOf = (barber: any): { start: number; end: number }[] => {
  if (!barber) return [];
  const sr = Array.isArray(barber.scheduleRanges) ? barber.scheduleRanges : [];
  const ranges = sr
    .filter((r: any) => r?.start && r?.end)
    .map((r: any) => ({ start: hmToMin(r.start), end: hmToMin(r.end) }));
  if (ranges.length) return ranges;
  if (
    typeof barber.scheduleRange === 'string' &&
    barber.scheduleRange.includes('-')
  ) {
    const [a, b] = barber.scheduleRange.split('-').map((x: string) => x.trim());
    if (a && b) return [{ start: hmToMin(a), end: hmToMin(b) }];
  }
  return [];
};

const barberIntervalOf = (barber: any) =>
  Math.max(5, Number(barber?.bookingSlotIntervalMinutes) || 30);

// Minutos que realmente ocupa un turno = duración + tiempo entre turnos (buffer).
const occupiedMinutesOf = (a: Appointment) =>
  (Number(a.durationMinutes) || 30) +
  (Number((a as any).bufferAfterMinutesApplied) || 0);

const freeSlotsOf = (
  barber: any,
  appts: Appointment[],
  interval: number,
): { min: number; label: string }[] => {
  const ranges = barberRangesOf(barber);
  const busy = appts.map(a => {
    const s = calStartMin(a.startTime);
    return { s, e: s + occupiedMinutesOf(a) };
  });
  const out: { min: number; label: string }[] = [];
  const seen = new Set<number>();
  ranges.forEach(r => {
    for (let m = r.start; m + interval <= r.end; m += interval) {
      // Evita duplicados cuando los rangos del horario se solapan.
      if (seen.has(m)) continue;
      seen.add(m);
      const occ = busy.some(x => m >= x.s && m < x.e);
      if (!occ) out.push({ min: m, label: minToLabel(m) });
    }
  });
  return out;
};

type Props = {
  barber: any;
  appointments: Appointment[];
  theme: Theme;
  date: Date;
  onPressFree: (label: string) => void;
  onPressAppt: (a: Appointment) => void;
};

export default function BarberDayCalendar({
  barber,
  appointments,
  theme,
  date,
  onPressFree,
  onPressAppt,
}: Props) {
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const color = theme.primary;
  const interval = barberIntervalOf(barber);
  const works = barberWorksOn(barber, date);

  const calRange = useMemo(() => {
    let minM = Infinity;
    let maxM = -Infinity;
    barberRangesOf(barber).forEach(r => {
      if (r.start < minM) minM = r.start;
      if (r.end > maxM) maxM = r.end;
    });
    appointments.forEach(a => {
      const s = calStartMin(a.startTime);
      const e = s + occupiedMinutesOf(a);
      if (s < minM) minM = s;
      if (e > maxM) maxM = e;
    });
    if (!Number.isFinite(minM)) return { start: 9, end: 20 };
    return {
      start: Math.max(0, Math.floor(minM / 60)),
      end: Math.min(24, Math.ceil(maxM / 60)),
    };
  }, [barber, appointments]);

  if (!works && !appointments.length) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No atiende este día.</Text>
      </View>
    );
  }

  if (!barberRangesOf(barber).length && !appointments.length) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Sin horario configurado.</Text>
      </View>
    );
  }

  const startHour = calRange.start;
  const endHour = calRange.end;
  const gridHeight = Math.max(CAL_HOUR_H, (endHour - startHour) * CAL_HOUR_H);
  const globalInterval = Math.min(interval, 30);
  const ticks: number[] = [];
  for (let m = startHour * 60; m <= endHour * 60; m += globalInterval) {
    ticks.push(m);
  }
  const topOf = (m: number) => ((m - startHour * 60) / 60) * CAL_HOUR_H;
  const free = works ? freeSlotsOf(barber, appointments, interval) : [];

  return (
    <View style={{ flexDirection: 'row' }}>
      <View style={{ width: 48 }}>
        <View style={{ height: gridHeight }}>
          {ticks.map(m => (
            <Text
              key={m}
              style={[
                styles.hourLabel,
                {
                  position: 'absolute',
                  top: topOf(m) - 7,
                  fontWeight: m % 60 === 0 ? '700' : '500',
                  opacity: m % 60 === 0 ? 0.85 : 0.5,
                },
              ]}
            >
              {minToLabel(m)}
            </Text>
          ))}
        </View>
      </View>

      <View style={{ flex: 1 }}>
        {!works ? (
          <View style={styles.closedNote}>
            <Text style={styles.closedNoteText}>No atiende este día</Text>
          </View>
        ) : null}
        <View style={[styles.grid, { height: gridHeight }]}>
          {ticks.map(m => (
            <View
              key={m}
              style={[
                styles.hourLine,
                { top: topOf(m), opacity: m % 60 === 0 ? 1 : 0.4 },
              ]}
            />
          ))}

          {free.map(s => {
            const height = Math.max(24, (interval / 60) * CAL_HOUR_H - 3);
            return (
              <Pressable
                key={`f-${s.min}`}
                onPress={() => onPressFree(s.label)}
                style={[styles.freeCol, { top: topOf(s.min) + 1, height }]}
              >
                <Text style={styles.freePlus} numberOfLines={1}>
                  ＋ {s.label}
                </Text>
              </Pressable>
            );
          })}

          {appointments.map(a => {
            const dur = occupiedMinutesOf(a);
            const height = Math.max(34, (dur / 60) * CAL_HOUR_H - 3);
            const endLabel = minToLabel(calStartMin(a.startTime) + dur);
            const isCompleted = a.status === 'completed';
            return (
              <Pressable
                key={a._id}
                onPress={() => onPressAppt(a)}
                style={[
                  styles.block,
                  {
                    top: topOf(calStartMin(a.startTime)) + 1,
                    height,
                    backgroundColor: hexToRgba(color, 0.16),
                    borderColor: color,
                    opacity: isCompleted ? 0.55 : 1,
                  },
                ]}
              >
                <Text style={[styles.blockTime, { color }]} numberOfLines={1}>
                  {formatTimeOnly(a.startTime)} – {endLabel}
                </Text>
                <Text style={styles.blockName} numberOfLines={1}>
                  {a.customerName}
                </Text>
                {height > 50 ? (
                  <Text style={styles.blockSvc} numberOfLines={1}>
                    {a.service}
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    empty: { alignItems: 'center', paddingVertical: 40 },
    emptyText: { color: theme.textMuted },
    hourLabel: { width: 48, color: '#9aa1ac', fontSize: 11 },
    grid: { position: 'relative', flex: 1 },
    hourLine: {
      position: 'absolute',
      left: 0,
      right: 0,
      height: 1,
      backgroundColor: theme.border,
    },
    closedNote: {
      alignSelf: 'center',
      marginBottom: 8,
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 10,
      backgroundColor: hexToRgba('#ef4444', 0.12),
      borderWidth: 1,
      borderColor: hexToRgba('#ef4444', 0.35),
    },
    closedNoteText: { color: '#ef4444', fontSize: 11, fontWeight: '800' },
    freeCol: {
      position: 'absolute',
      left: 4,
      right: 4,
      borderRadius: 8,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    freePlus: {
      color: theme.primary,
      fontSize: 13,
      fontWeight: '800',
    },
    block: {
      position: 'absolute',
      left: 3,
      right: 3,
      borderRadius: 10,
      borderWidth: 1,
      paddingHorizontal: 8,
      paddingVertical: 5,
      overflow: 'hidden',
    },
    blockTime: { fontSize: 11, fontWeight: '800' },
    blockName: { color: theme.textPrimary, fontSize: 13, fontWeight: '700' },
    blockSvc: { color: theme.textMuted, fontSize: 11 },
  });
