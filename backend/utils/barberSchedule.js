const DEFAULT_SCHEDULE_RANGE = "08:00 - 22:00";
const DEFAULT_OVERRIDE_VALID_FROM = "1970-01-01";

const SHIFT_RANGES = {
  morning: "08:00 - 12:00",
  afternoon: "12:00 - 18:00",
  evening: "18:00 - 22:00",
  full: DEFAULT_SCHEDULE_RANGE,
};

export function sanitizeScheduleRange(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

export function normalizeScheduleRanges(input) {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => ({
      label: String(item?.label ?? "").trim(),
      start: String(item?.start ?? "").trim(),
      end: String(item?.end ?? "").trim(),
    }))
    .filter((item) => item.start && item.end);
}

export function normalizeEffectiveDate(value) {
  const text = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text)
    ? text
    : DEFAULT_OVERRIDE_VALID_FROM;
}

export function normalizeDayScheduleOverrides(input) {
  if (!Array.isArray(input)) return [];

  const normalized = input
    .map((item) => {
      const day = Number(item?.day);
      if (!Number.isInteger(day) || day < 0 || day > 6) return null;

      const validFrom = normalizeEffectiveDate(item?.validFrom);
      const useBase = Boolean(item?.useBase);
      const scheduleRange = sanitizeScheduleRange(item?.scheduleRange);
      const scheduleRanges = normalizeScheduleRanges(item?.scheduleRanges);

      if (!useBase && !scheduleRange && !scheduleRanges.length) return null;

      return {
        day,
        validFrom,
        useBase,
        scheduleRange: useBase ? null : scheduleRanges.length ? null : scheduleRange,
        scheduleRanges: useBase ? [] : scheduleRanges,
      };
    })
    .filter(Boolean)
    .sort(
      (a, b) =>
        a.day - b.day || a.validFrom.localeCompare(b.validFrom),
    );

  const uniqueByDayAndDate = new Map();
  for (const item of normalized) {
    uniqueByDayAndDate.set(`${item.day}:${item.validFrom}`, item);
  }

  return Array.from(uniqueByDayAndDate.values()).sort(
    (a, b) =>
      a.day - b.day || a.validFrom.localeCompare(b.validFrom),
  );
}

export function deriveScheduleRange(barberDoc) {
  return (
    barberDoc?.scheduleRange ||
    SHIFT_RANGES[barberDoc?.shift] ||
    DEFAULT_SCHEDULE_RANGE
  );
}

function resolveOverrideForDate(barberDoc, weekday, effectiveDate) {
  const normalizedWeekday = Number(weekday);
  const overrides = Array.isArray(barberDoc?.dayScheduleOverrides)
    ? barberDoc.dayScheduleOverrides
    : [];

  const matches = overrides
    .filter((item) => Number(item?.day) === normalizedWeekday)
    .map((item) => ({
      ...item,
      validFrom: normalizeEffectiveDate(item?.validFrom),
      useBase: Boolean(item?.useBase),
    }))
    .sort((a, b) => b.validFrom.localeCompare(a.validFrom));

  return matches[0] ?? null;
}

export function resolveBarberScheduleForWeekday(
  barberDoc,
  weekday,
  effectiveDate,
) {
  const override = resolveOverrideForDate(barberDoc, weekday, effectiveDate);

  if (override) {
    if (override.useBase) {
      return {
        scheduleRange: deriveScheduleRange(barberDoc),
        scheduleRanges: normalizeScheduleRanges(barberDoc?.scheduleRanges),
        source: "base-reset",
      };
    }

    const scheduleRanges = normalizeScheduleRanges(override.scheduleRanges);
    return {
      scheduleRange: scheduleRanges.length
        ? null
        : sanitizeScheduleRange(override.scheduleRange),
      scheduleRanges,
      source: "override",
    };
  }

  return {
    scheduleRange: deriveScheduleRange(barberDoc),
    scheduleRanges: normalizeScheduleRanges(barberDoc?.scheduleRanges),
    source: "base",
  };
}
