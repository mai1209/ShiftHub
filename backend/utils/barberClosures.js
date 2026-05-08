import { getTimeZoneLabel } from "./timezone.js";

const DEFAULT_BARBER_CLOSED_DAY_MESSAGE =
  "Este barbero no atenderá ese día. Elegí otro profesional o seleccioná otra fecha.";

function normalizeDateLabel(value) {
  const text = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function normalizeMessage(value) {
  const text = String(value ?? "").trim();
  if (!text) return DEFAULT_BARBER_CLOSED_DAY_MESSAGE;
  return text.slice(0, 220);
}

export function normalizeBarberClosedDays(input) {
  if (!Array.isArray(input)) return [];

  const seen = new Map();

  input.forEach((item) => {
    const date = normalizeDateLabel(item?.date);
    if (!date) return;

    seen.set(date, {
      date,
      message: normalizeMessage(item?.message),
    });
  });

  return Array.from(seen.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export function resolveBarberClosureForDate(source, dateLike) {
  const targetDate =
    typeof dateLike === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateLike)
      ? dateLike
      : getTimeZoneLabel(dateLike).date;

  const closures = normalizeBarberClosedDays(source?.barberClosedDays);
  return closures.find((item) => item.date === targetDate) ?? null;
}

export function serializeBarberClosure(closure) {
  if (!closure) return null;
  return {
    isClosed: true,
    date: closure.date,
    message: closure.message || DEFAULT_BARBER_CLOSED_DAY_MESSAGE,
  };
}

export { DEFAULT_BARBER_CLOSED_DAY_MESSAGE };
