import { getTimeZoneLabel } from "./timezone.js";

const DEFAULT_BARBER_TIME_BLOCK_MESSAGE =
  "Este horario no está disponible. Elegí otro turno.";

function normalizeDateLabel(value) {
  const text = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function normalizeTimeLabel(value) {
  const text = String(value ?? "").trim();
  return /^\d{2}:\d{2}$/.test(text) ? text : null;
}

function labelToMinutes(label) {
  const [hour, minute] = String(label || "")
    .split(":")
    .map(Number);
  return hour * 60 + minute;
}

function normalizeMessage(value) {
  const text = String(value ?? "").trim();
  if (!text) return DEFAULT_BARBER_TIME_BLOCK_MESSAGE;
  return text.slice(0, 220);
}

export function normalizeBarberTimeBlocks(input) {
  if (!Array.isArray(input)) return [];

  const normalized = input
    .map((item) => {
      const date = normalizeDateLabel(item?.date);
      const start = normalizeTimeLabel(item?.start);
      const end = normalizeTimeLabel(item?.end);
      if (!date || !start || !end) return null;

      const startMinutes = labelToMinutes(start);
      const endMinutes = labelToMinutes(end);
      if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes)) return null;
      if (endMinutes <= startMinutes) return null;

      return {
        date,
        start,
        end,
        message: normalizeMessage(item?.message),
      };
    })
    .filter(Boolean)
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.start.localeCompare(b.start) ||
        a.end.localeCompare(b.end),
    );

  const unique = new Map();
  normalized.forEach((item) => {
    unique.set(`${item.date}:${item.start}:${item.end}`, item);
  });

  return Array.from(unique.values()).sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.start.localeCompare(b.start) ||
      a.end.localeCompare(b.end),
  );
}

export function resolveBarberTimeBlocksForDate(source, dateLike) {
  const targetDate =
    typeof dateLike === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateLike)
      ? dateLike
      : getTimeZoneLabel(dateLike).date;

  return normalizeBarberTimeBlocks(source?.barberTimeBlocks).filter(
    (item) => item.date === targetDate,
  );
}

export function serializeBarberTimeBlock(block) {
  if (!block) return null;
  return {
    date: block.date,
    start: block.start,
    end: block.end,
    message: block.message || DEFAULT_BARBER_TIME_BLOCK_MESSAGE,
  };
}

export function serializeBarberTimeBlocks(blocks) {
  return normalizeBarberTimeBlocks(blocks).map(serializeBarberTimeBlock);
}

export function doesTimeBlockOverlapRange(block, startMinutes, endMinutes) {
  const blockStart = labelToMinutes(block?.start);
  const blockEnd = labelToMinutes(block?.end);
  if (!Number.isFinite(blockStart) || !Number.isFinite(blockEnd)) return false;
  return startMinutes < blockEnd && endMinutes > blockStart;
}

export { DEFAULT_BARBER_TIME_BLOCK_MESSAGE };

