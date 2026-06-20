import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "../styles/BookingForm.module.css";
import style from "../styles/LandingPage.module.css";

import {
  fetchBarbers,
  fetchBarberAppointments,
  createAppointment,
  fetchShopInfo,
  fetchShopMedia,
  fetchServices,
  validateBookingCoupon,
  fetchMembershipForEmail,
  resolveApiMediaUrl,
  setShopSlug,
} from "../services/api";
import { getBusinessCopy, SHIFT_APP_BRAND_NAME } from "../utils/businessCopy";

const SHOP_TZ = "America/Argentina/Cordoba";

const formatDateParam = (date) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SHOP_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "00";
  const day = parts.find((part) => part.type === "day")?.value ?? "00";
  return `${year}-${month}-${day}`;
};

const minutesToLabel = (totalMinutes) => {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};

const DEFAULT_SLOT_INTERVAL_MINUTES = 15;

// Degradado "metálico/platinado" para la tarjeta de membresía (igual que la app).
const clampByte = (x) => Math.max(0, Math.min(255, Math.round(x)));
const hexToRgb = (hex) => {
  const s = String(hex || "").replace("#", "");
  const full = s.length === 3 ? s.split("").map((c) => c + c).join("") : s;
  const num = parseInt(full || "000000", 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
};
const toHex = ({ r, g, b }) =>
  "#" + [r, g, b].map((x) => clampByte(x).toString(16).padStart(2, "0")).join("");
const lightenHex = (hex, amt) => {
  const { r, g, b } = hexToRgb(hex);
  return toHex({
    r: r + (255 - r) * amt,
    g: g + (255 - g) * amt,
    b: b + (255 - b) * amt,
  });
};
const darkenHex = (hex, amt) => {
  const { r, g, b } = hexToRgb(hex);
  return toHex({ r: r * (1 - amt), g: g * (1 - amt), b: b * (1 - amt) });
};
const metallicGradient = (color) => {
  const c = color || "#111827";
  return `linear-gradient(135deg, ${lightenHex(c, 0.38)} 0%, ${c} 30%, ${lightenHex(
    c,
    0.5,
  )} 52%, ${darkenHex(c, 0.16)} 74%, ${darkenHex(c, 0.42)} 100%)`;
};

// El intervalo de turnos es por empleado/recurso (Barber.bookingSlotIntervalMinutes).
function normalizeSlotIntervalMinutes(value) {
  return Number(value) === 30 ? 30 : DEFAULT_SLOT_INTERVAL_MINUTES;
}

const DEFAULT_BOOKING_BANNER = null;
const DEFAULT_BOOKING_LOGO = null;

const getEntityId = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    return String(value._id || value.id || value.serviceId || "");
  }
  return String(value);
};

const WEB_STYLE_PRESETS = {
  dark: {
    "--page-bg": "linear-gradient(180deg, #06070a 0%, #120812 100%)",
    "--wrapper-shadow": "0 24px 70px rgba(0, 0, 0, 0.30)",
    "--pink": "#39e01f",
    "--pink-light": "#8dff54",
    "--pink-soft": "rgba(57, 224, 31, 0.08)",
    "--pink-border": "rgba(57, 224, 31, 0.22)",
    "--surface": "rgba(15, 15, 18, 0.96)",
    "--surface-2": "rgba(22, 22, 26, 0.98)",
    "--surface-3": "rgba(28, 28, 34, 0.98)",
    "--line": "rgba(255, 255, 255, 0.06)",
    "--text": "#ffffff",
    "--text-soft": "#d8d8de",
    "--text-dim": "#92929c",
    "--text-faint": "#5f5f69",
    "--glow-1":
      "radial-gradient(circle, rgba(57, 224, 31, 0.16) 0%, transparent 72%)",
    "--glow-2":
      "radial-gradient(circle, rgba(242, 140, 40, 0.12) 0%, transparent 72%)",
    "--card-bg":
      "linear-gradient(180deg, rgba(20, 20, 24, 0.98) 0%, rgba(10, 10, 12, 0.99) 100%)",
    "--card-shadow":
      "0 30px 80px rgba(0, 0, 0, 0.46), inset 0 1px 0 rgba(255, 255, 255, 0.03)",
    "--card-grid":
      "linear-gradient(rgba(57, 224, 31, 0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(57, 224, 31, 0.04) 1px, transparent 1px)",
    "--eyebrow-bg": "rgba(57, 224, 31, 0.1)",
    "--eyebrow-text": "#d9ffbd",
    "--eyebrow-dot-shadow": "rgba(57, 224, 31, 0.75)",
    "--focus-bg": "rgba(33, 33, 39, 0.98)",
    "--focus-ring": "rgba(57, 224, 31, 0.08)",
    "--hover-line": "rgba(255, 255, 255, 0.12)",
    "--hover-surface": "rgba(34, 34, 39, 0.98)",
    "--active-surface":
      "linear-gradient(180deg, rgba(57, 224, 31, 0.12) 0%, rgba(57, 224, 31, 0.05) 100%)",
    "--active-shadow": "0 14px 30px rgba(57, 224, 31, 0.12)",
    "--chip-title": "#f4f4f7",
    "--chip-title-active": "#ffd6ec",
    "--chip-helper-active": "#f1c4df",
    "--warning-border": "rgba(255, 138, 0, 0.22)",
    "--warning-bg": "rgba(255, 138, 0, 0.08)",
    "--warning-text": "#f0cf9d",
    "--avatar-bg": "rgba(255, 255, 255, 0.06)",
    "--active-button-gradient":
      "linear-gradient(135deg, #39e01f 0%, #f28c28 100%)",
    "--active-button-shadow": "0 12px 24px rgba(57, 224, 31, 0.25)",
    "--muted-on-accent": "rgba(255, 255, 255, 0.72)",
    "--empty-card-bg":
      "linear-gradient(180deg, rgba(29, 29, 34, 0.96) 0%, rgba(20, 20, 24, 0.98) 100%)",
    "--submit-gradient": "linear-gradient(135deg, #39e01f 0%, #f28c28 100%)",
    "--submit-shadow": "0 18px 34px rgba(57, 224, 31, 0.28)",
    "--submit-shadow-hover": "0 22px 42px rgba(57, 224, 31, 0.34)",
    "--submit-disabled-bg": "#252525",
    "--submit-disabled-text": "#4c4c56",
    "--modal-backdrop": "rgba(0, 0, 0, 0.82)",
    "--modal-card-bg":
      "linear-gradient(180deg, rgba(19, 19, 23, 0.98) 0%, rgba(11, 11, 13, 1) 100%)",
    "--modal-close-bg": "rgba(255, 255, 255, 0.06)",
    "--modal-close-bg-hover": "rgba(255, 255, 255, 0.12)",
    "--service-active-meta": "rgba(255, 171, 214, 0.88)",
  },
  light: {
    "--page-bg": "linear-gradient(180deg, #f8fafc 0%, #e2e8f0 100%)",
    "--wrapper-shadow": "0 24px 60px rgba(15, 23, 42, 0.08)",
    "--pink": "#39e01f",
    "--pink-light": "#1f9d36",
    "--pink-soft": "rgba(57, 224, 31, 0.08)",
    "--pink-border": "rgba(57, 224, 31, 0.18)",
    "--surface": "rgba(255, 255, 255, 0.96)",
    "--surface-2": "rgba(248, 250, 252, 0.98)",
    "--surface-3": "rgba(255, 255, 255, 0.98)",
    "--line": "rgba(15, 23, 42, 0.10)",
    "--text": "#0f172a",
    "--text-soft": "#1f2937",
    "--text-dim": "#64748b",
    "--text-faint": "#94a3b8",
    "--glow-1":
      "radial-gradient(circle, rgba(57, 224, 31, 0.12) 0%, transparent 72%)",
    "--glow-2":
      "radial-gradient(circle, rgba(242, 140, 40, 0.14) 0%, transparent 72%)",
    "--card-bg":
      "linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(248, 250, 252, 1) 100%)",
    "--card-shadow":
      "0 24px 60px rgba(15, 23, 42, 0.10), inset 0 1px 0 rgba(255, 255, 255, 0.8)",
    "--card-grid":
      "linear-gradient(rgba(15, 23, 42, 0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(15, 23, 42, 0.04) 1px, transparent 1px)",
    "--eyebrow-bg": "rgba(15, 23, 42, 0.05)",
    "--eyebrow-text": "#334155",
    "--eyebrow-dot-shadow": "rgba(57, 224, 31, 0.18)",
    "--focus-bg": "rgba(255, 255, 255, 1)",
    "--focus-ring": "rgba(57, 224, 31, 0.10)",
    "--hover-line": "rgba(15, 23, 42, 0.16)",
    "--hover-surface": "rgba(248, 250, 252, 1)",
    "--active-surface":
      "linear-gradient(180deg, rgba(57, 224, 31, 0.10) 0%, rgba(57, 224, 31, 0.05) 100%)",
    "--active-shadow": "0 14px 30px rgba(57, 224, 31, 0.10)",
    "--chip-title": "#0f172a",
    "--chip-title-active": "#0f172a",
    "--chip-helper-active": "#334155",
    "--warning-border": "rgba(180, 83, 9, 0.18)",
    "--warning-bg": "rgba(245, 158, 11, 0.08)",
    "--warning-text": "#92400e",
    "--avatar-bg": "rgba(15, 23, 42, 0.05)",
    "--active-button-gradient":
      "linear-gradient(135deg, #39e01f 0%, #f28c28 100%)",
    "--active-button-shadow": "0 12px 24px rgba(57, 224, 31, 0.18)",
    "--muted-on-accent": "rgba(255, 255, 255, 0.78)",
    "--empty-card-bg":
      "linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(241, 245, 249, 1) 100%)",
    "--submit-gradient": "linear-gradient(135deg, #39e01f 0%, #f28c28 100%)",
    "--submit-shadow": "0 18px 34px rgba(57, 224, 31, 0.16)",
    "--submit-shadow-hover": "0 22px 42px rgba(57, 224, 31, 0.22)",
    "--submit-disabled-bg": "#e5e7eb",
    "--submit-disabled-text": "#94a3b8",
    "--modal-backdrop": "rgba(15, 23, 42, 0.35)",
    "--modal-card-bg":
      "linear-gradient(180deg, rgba(255, 255, 255, 0.99) 0%, rgba(248, 250, 252, 1) 100%)",
    "--modal-close-bg": "rgba(15, 23, 42, 0.06)",
    "--modal-close-bg-hover": "rgba(15, 23, 42, 0.12)",
    "--service-active-meta": "#475569",
  },
  vintage: {
    "--page-bg": "linear-gradient(180deg, #f7efe2 0%, #ead7bb 100%)",
    "--wrapper-shadow": "0 24px 60px rgba(98, 67, 44, 0.12)",
    "--pink": "#8b5e34",
    "--pink-light": "#b88a5f",
    "--pink-soft": "rgba(139, 94, 52, 0.10)",
    "--pink-border": "rgba(139, 94, 52, 0.24)",
    "--surface": "rgba(248, 241, 228, 0.96)",
    "--surface-2": "rgba(242, 231, 214, 0.98)",
    "--surface-3": "rgba(255, 249, 238, 0.98)",
    "--line": "rgba(107, 70, 42, 0.12)",
    "--text": "#3e2b1f",
    "--text-soft": "#5b3f2b",
    "--text-dim": "#8b6a54",
    "--text-faint": "#b59a83",
    "--glow-1":
      "radial-gradient(circle, rgba(184, 138, 95, 0.20) 0%, transparent 72%)",
    "--glow-2":
      "radial-gradient(circle, rgba(222, 196, 160, 0.24) 0%, transparent 72%)",
    "--card-bg":
      "linear-gradient(180deg, rgba(255, 250, 241, 0.98) 0%, rgba(244, 233, 216, 1) 100%)",
    "--card-shadow":
      "0 26px 60px rgba(98, 67, 44, 0.14), inset 0 1px 0 rgba(255, 255, 255, 0.65)",
    "--card-grid":
      "linear-gradient(rgba(139, 94, 52, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(139, 94, 52, 0.05) 1px, transparent 1px)",
    "--eyebrow-bg": "rgba(139, 94, 52, 0.10)",
    "--eyebrow-text": "#7a4b24",
    "--eyebrow-dot-shadow": "rgba(139, 94, 52, 0.22)",
    "--focus-bg": "rgba(255, 252, 247, 1)",
    "--focus-ring": "rgba(139, 94, 52, 0.10)",
    "--hover-line": "rgba(107, 70, 42, 0.18)",
    "--hover-surface": "rgba(249, 241, 228, 1)",
    "--active-surface":
      "linear-gradient(180deg, rgba(139, 94, 52, 0.14) 0%, rgba(139, 94, 52, 0.06) 100%)",
    "--active-shadow": "0 14px 30px rgba(139, 94, 52, 0.12)",
    "--chip-title": "#4a3323",
    "--chip-title-active": "#6d4020",
    "--chip-helper-active": "#8b6a54",
    "--warning-border": "rgba(146, 64, 14, 0.18)",
    "--warning-bg": "rgba(251, 191, 36, 0.10)",
    "--warning-text": "#7c4a16",
    "--avatar-bg": "rgba(139, 94, 52, 0.08)",
    "--active-button-gradient":
      "linear-gradient(135deg, #8b5e34 0%, #6d4020 100%)",
    "--active-button-shadow": "0 12px 24px rgba(139, 94, 52, 0.24)",
    "--muted-on-accent": "rgba(255, 244, 230, 0.82)",
    "--empty-card-bg":
      "linear-gradient(180deg, rgba(255, 249, 238, 0.98) 0%, rgba(244, 233, 216, 1) 100%)",
    "--submit-gradient": "linear-gradient(135deg, #8b5e34 0%, #6d4020 100%)",
    "--submit-shadow": "0 18px 34px rgba(139, 94, 52, 0.22)",
    "--submit-shadow-hover": "0 22px 42px rgba(139, 94, 52, 0.28)",
    "--submit-disabled-bg": "#d8c7b4",
    "--submit-disabled-text": "#8f7a64",
    "--modal-backdrop": "rgba(62, 43, 31, 0.40)",
    "--modal-card-bg":
      "linear-gradient(180deg, rgba(255, 250, 241, 0.99) 0%, rgba(244, 233, 216, 1) 100%)",
    "--modal-close-bg": "rgba(139, 94, 52, 0.08)",
    "--modal-close-bg-hover": "rgba(139, 94, 52, 0.16)",
    "--service-active-meta": "#8b6a54",
  },
};

const getWebStylePreset = (preset) => {
  if (preset === "vintage") return WEB_STYLE_PRESETS.vintage;
  if (preset === "dark") return WEB_STYLE_PRESETS.dark;
  return WEB_STYLE_PRESETS.light;
};

function formatTimeInShopTZ(value) {
  const parts = new Intl.DateTimeFormat("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: SHOP_TZ,
  }).formatToParts(new Date(value));
  const hh = parts.find((part) => part.type === "hour")?.value ?? "00";
  const mm = parts.find((part) => part.type === "minute")?.value ?? "00";
  return `${hh}:${mm}`;
}

function getOffsetMinutesInShopTZ(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SHOP_TZ,
    timeZoneName: "shortOffset",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date);

  const offsetText =
    parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT";
  const match = offsetText.match(/^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/);

  if (!match) return 0;

  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2] ?? 0);
  const minutes = Number(match[3] ?? 0);
  return sign * (hours * 60 + minutes);
}

function buildIsoFromShopDateAndTime(dateValue, slotLabel) {
  const [year, month, day] = formatDateParam(dateValue).split("-").map(Number);
  const [hour, minute] = slotLabel.split(":").map(Number);
  const startUtcGuess = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const offsetMinutes = getOffsetMinutesInShopTZ(new Date(startUtcGuess));
  return new Date(startUtcGuess - offsetMinutes * 60_000).toISOString();
}

const formatPrice = (value) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const formatBookingDateLabel = (date) =>
  new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    timeZone: SHOP_TZ,
  }).format(date);

const getPublicPaymentOptions = (shopInfo, businessCopy) => {
  const settings = shopInfo?.paymentSettings || {};
  const options = [];

  if (settings.cashEnabled !== false) {
    options.push({
      value: "cash",
      label: "Efectivo / transferencia en el local",
      helper: `Reservás ahora y pagás presencialmente ${businessCopy.atBusiness} cuando llegás a tu turno.`,
    });
  }

  if (settings.advancePaymentEnabled && settings.mercadoPagoReady) {
    const value =
      settings.advanceType === "fixed"
        ? formatPrice(settings.advanceValue || 0)
        : `${Number(settings.advanceValue || 0)}%`;

    options.push({
      value: "transfer",
      label:
        settings.advanceMode === "full"
          ? "Transferencia adelantada"
          : "Transferencia adelantada",
      helper:
        settings.advanceMode === "full"
          ? "Pagás el turno completo online con Mercado Pago antes de confirmar la reserva."
          : `Pagás ${value} online con Mercado Pago para reservar con seña.`,
    });
  }

  return options;
};

const EMAIL_DOMAIN_FIXES = {
  "gmail.con": "gmail.com",
  "gmai.com": "gmail.com",
  "gmial.com": "gmail.com",
  "gnail.com": "gmail.com",
  "hotmail.con": "hotmail.com",
  "hotmal.com": "hotmail.com",
  "hotmil.com": "hotmail.com",
  "outlook.con": "outlook.com",
  "icloud.con": "icloud.com",
  "yahoo.con": "yahoo.com",
};

const normalizeEmail = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");

const reviewEmail = (value) => {
  const normalized = normalizeEmail(value);

  if (!normalized) {
    // El email es opcional: si no lo cargan, el turno se reserva igual.
    return {
      normalized,
      isValid: true,
      message: "",
    };
  }

  const basicEmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  if (!basicEmailPattern.test(normalized)) {
    return {
      normalized,
      isValid: false,
      message: "Revisá el formato del email. Ejemplo: nombre@correo.com",
    };
  }

  const [localPart, domain] = normalized.split("@");
  const fixedDomain =
    EMAIL_DOMAIN_FIXES[domain] ||
    (domain.endsWith(".con") ? domain.replace(/\.con$/, ".com") : "");

  if (fixedDomain) {
    return {
      normalized,
      isValid: false,
      suggestion: `${localPart}@${fixedDomain}`,
      message: `Parece que quisiste escribir ${localPart}@${fixedDomain}.`,
    };
  }

  return {
    normalized,
    isValid: true,
    message: "Vamos a enviar la confirmación a este email.",
  };
};

const labelToMinutes = (label) => {
  const [hours, minutes] = label.split(":").map(Number);
  return hours * 60 + minutes;
};

const parseTimeFragment = (fragment) => {
  if (!fragment) return null;
  const match = fragment.trim().match(/(\d{1,2})(?::(\d{2}))?/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2] ?? "0");
  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  )
    return null;
  return hours * 60 + minutes;
};

const parseScheduleRangeLabel = (range) => {
  if (!range) return null;
  const parts = range
    .split(/-|a/i)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2) return null;
  const start = parseTimeFragment(parts[0]);
  const end = parseTimeFragment(parts[1]);
  if (start == null || end == null || end <= start) return null;
  return { start, end };
};

const normalizeScheduleRanges = (input) => {
  if (!Array.isArray(input)) return [];
  return input.filter((item) => item?.start?.trim() && item?.end?.trim());
};

const normalizeOverrideValidFrom = (value) => {
  const text = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "1970-01-01";
};

const resolveBarberScheduleForDate = (barber, date) => {
  if (!barber) return { scheduleRange: null, scheduleRanges: [] };

  const weekday = date.getDay();
  const override =
    barber.dayScheduleOverrides
      ?.filter((item) => Number(item.day) === weekday)
      .map((item) => ({
        ...item,
        validFrom: normalizeOverrideValidFrom(item.validFrom),
        useBase: Boolean(item.useBase),
      }))
      .sort((a, b) => b.validFrom.localeCompare(a.validFrom))[0] ?? null;

  if (override) {
    if (override.useBase) {
      return {
        scheduleRange: barber.scheduleRange ?? null,
        scheduleRanges: normalizeScheduleRanges(barber.scheduleRanges),
      };
    }

    const scheduleRanges = normalizeScheduleRanges(override.scheduleRanges);
    return {
      scheduleRange: scheduleRanges.length
        ? null
        : (override.scheduleRange ?? null),
      scheduleRanges,
    };
  }

  return {
    scheduleRange: barber.scheduleRange ?? null,
    scheduleRanges: normalizeScheduleRanges(barber.scheduleRanges),
  };
};

function BookingForm({ shopSlug, onNotFound }) {
  // 1. TODOS LOS USESTATE PRIMERO
  const [slugReady] = useState(() => {
    if (shopSlug) {
      setShopSlug(shopSlug);
      return true;
    }
    return false;
  });
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [barbers, setBarbers] = useState([]);
  const [selectedBarber, setSelectedBarber] = useState(null);
  const [loadingBarbers, setLoadingBarbers] = useState(true);
  const [saving, setSaving] = useState(false);
  const [occupiedRanges, setOccupiedRanges] = useState([]);
  const [barberTimeBlocks, setBarberTimeBlocks] = useState([]);
  const [shopInfo, setShopInfo] = useState(null);
  const [shopLoading, setShopLoading] = useState(true);
  const [services, setServices] = useState([]);
  const [selectedServices, setSelectedServices] = useState([]);
  const [servicePickerOpen, setServicePickerOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedBarberSchedule, setSelectedBarberSchedule] = useState(null);
  const [paymentResultMessage, setPaymentResultMessage] = useState("");
  const [shopUnavailable, setShopUnavailable] = useState(false);
  const [closedDayNotice, setClosedDayNotice] = useState("");
  const [successOpen, setSuccessOpen] = useState(false);
  const [successEmail, setSuccessEmail] = useState("");
  const [couponInput, setCouponInput] = useState("");
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [membership, setMembership] = useState(null);
  const businessCopy = useMemo(
    () => getBusinessCopy(shopInfo?.businessType),
    [shopInfo?.businessType],
  );

  const currentDuration = useMemo(() => {
    const total = selectedServices.reduce(
      (sum, item) => sum + Number(item?.durationMinutes || 0),
      0,
    );
    return total || DEFAULT_SLOT_INTERVAL_MINUTES;
  }, [selectedServices]);

  const currentTotalPrice = useMemo(
    () =>
      selectedServices.reduce((sum, item) => sum + Number(item?.price || 0), 0),
    [selectedServices],
  );
  // Precio final (con cupón aplicado, si lo hay).
  const currentServicePrice = useMemo(
    () =>
      appliedCoupon?.totalFinal != null
        ? Number(appliedCoupon.totalFinal || 0)
        : currentTotalPrice,
    [appliedCoupon, currentTotalPrice],
  );
  const couponDiscountsByServiceId = useMemo(() => {
    const entries = Array.isArray(appliedCoupon?.serviceDiscounts)
      ? appliedCoupon.serviceDiscounts
      : [];
    return new Map(entries.map((item) => [String(item.serviceId), item]));
  }, [appliedCoupon]);

  // Si cambian los servicios, el cupón aplicado deja de ser válido.
  useEffect(() => {
    setAppliedCoupon(null);
    setCouponError("");
  }, [selectedServices]);

  // Buscar la membresía del cliente por email (con debounce).
  useEffect(() => {
    const normalized = String(email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      setMembership(null);
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const response = await fetchMembershipForEmail(normalized);
        if (!cancelled) setMembership(response?.membership ?? null);
      } catch {
        if (!cancelled) setMembership(null);
      }
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [email]);

  const handleApplyCoupon = useCallback(async () => {
    const serviceIds = selectedServices
      .map((item) => getEntityId(item))
      .filter(Boolean);
    const code = couponInput.trim().toUpperCase();

    if (!serviceIds.length) {
      setCouponError("Seleccioná un servicio antes de aplicar el cupón.");
      return;
    }
    if (!code) {
      setCouponError("Ingresá el código del cupón.");
      return;
    }

    try {
      setCouponLoading(true);
      setCouponError("");
      const response = await validateBookingCoupon({ code, serviceIds });
      setAppliedCoupon(response?.coupon ?? null);
    } catch (err) {
      setAppliedCoupon(null);
      setCouponError(
        err?.details?.error || err?.message || "No pudimos aplicar el cupón.",
      );
    } finally {
      setCouponLoading(false);
    }
  }, [couponInput, selectedServices]);

  const selectedServiceLabel = useMemo(() => {
    if (!selectedServices.length) return "Seleccionar servicios";
    if (selectedServices.length === 1) return selectedServices[0].name;
    return `${selectedServices.length} servicios seleccionados`;
  }, [selectedServices]);

  const selectedServiceSummary = useMemo(() => {
    if (!selectedServices.length) {
      return `${DEFAULT_SLOT_INTERVAL_MINUTES} minutos · ${formatPrice(0)}`;
    }
    return `${currentDuration} minutos · ${formatPrice(currentServicePrice)}`;
  }, [currentDuration, currentServicePrice, selectedServices.length]);

  // 2. USEMEMO
  const selectedBarberData = useMemo(
    () => barbers.find((b) => b._id === selectedBarber) ?? null,
    [barbers, selectedBarber],
  );

  const currentRequiredMinutes = useMemo(
    () =>
      currentDuration +
      Math.max(0, Number(selectedBarberData?.bookingBufferMinutes || 0)),
    [currentDuration, selectedBarberData],
  );

  const paymentOptions = useMemo(
    () => getPublicPaymentOptions(shopInfo, businessCopy),
    [businessCopy, shopInfo],
  );

  const selectedServiceIds = useMemo(
    () =>
      new Set(
        selectedServices.map((service) => getEntityId(service)).filter(Boolean),
      ),
    [selectedServices],
  );

  const compatibleBarbers = useMemo(() => {
    const ids = selectedServices
      .map((service) => getEntityId(service))
      .filter(Boolean);
    if (!ids.length) return barbers;

    return barbers.filter((barber) => {
      const assignedIds = Array.isArray(barber.serviceIds)
        ? barber.serviceIds.map(getEntityId).filter(Boolean)
        : [];
      if (!assignedIds.length) return true;
      const assignedSet = new Set(assignedIds);
      return ids.every((id) => assignedSet.has(id));
    });
  }, [barbers, selectedServices]);

  const resolvedBarberSchedule = useMemo(
    () =>
      selectedBarberSchedule ||
      resolveBarberScheduleForDate(selectedBarberData, selectedDate),
    [selectedBarberData, selectedDate, selectedBarberSchedule],
  );

  const horarioGroups = useMemo(() => {
    const workDays = selectedBarberData?.workDays || [0, 1, 2, 3, 4, 5, 6];
    const currentDayOfWeek = selectedDate.getDay();
    if (!workDays.includes(currentDayOfWeek)) return [];

    const step = normalizeSlotIntervalMinutes(
      selectedBarberData?.bookingSlotIntervalMinutes,
    );
    const buildSlots = (startStr, endStr) => {
      const parse = (t) => {
        const [h, m] = t.trim().split(":").map(Number);
        return (h || 0) * 60 + (m || 0);
      };
      const start = parse(startStr);
      const end = parse(endStr);
      const slotSet = new Set();
      for (let m = start; m <= end; m += step) {
        if (m + currentRequiredMinutes > end) break;
        slotSet.add(minutesToLabel(m));
      }

      return Array.from(slotSet).sort(
        (a, b) => labelToMinutes(a) - labelToMinutes(b),
      );
    };

    // Turno cortado
    const ranges = resolvedBarberSchedule.scheduleRanges;
    if (ranges && ranges.length > 0) {
      return ranges.map((r) => ({
        label: r.label,
        slots: buildSlots(r.start, r.end),
      }));
    }

    // Horario corrido
    const range = resolvedBarberSchedule.scheduleRange;
    if (!range) return [{ label: "", slots: [] }];
    const parsed = parseScheduleRangeLabel(range);
    if (!parsed) return [];
    return [
      {
        label: "",
        slots: buildSlots(
          minutesToLabel(parsed.start),
          minutesToLabel(parsed.end),
        ),
      },
    ];
  }, [
    currentRequiredMinutes,
    resolvedBarberSchedule,
    selectedBarberData,
    selectedDate,
  ]);

  // Lista plana para isSlotDisabled
  const allSlots = useMemo(
    () => horarioGroups.flatMap((g) => g.slots),
    [horarioGroups],
  );

  const formattedDate = useMemo(
    () => formatBookingDateLabel(selectedDate),
    [selectedDate],
  );

  const desktopBannerSrc =
    resolveApiMediaUrl(shopInfo?.themeConfig?.bannerDataUrl) ||
    DEFAULT_BOOKING_BANNER;
  const mobileBannerSrc =
    resolveApiMediaUrl(
      shopInfo?.themeConfig?.mobileBannerDataUrl ||
        shopInfo?.themeConfig?.bannerDataUrl,
    ) || DEFAULT_BOOKING_BANNER;
  const shopProfileSrc =
    resolveApiMediaUrl(shopInfo?.themeConfig?.logoDataUrl) ||
    DEFAULT_BOOKING_LOGO;
  const publicProfile = shopInfo?.publicProfile || {};
  const shopSubtitle = String(publicProfile.subtitle || "").trim();
  const shopAddress = String(publicProfile.address || "").trim();
  const shopPhone = String(publicProfile.phone || "").trim();
  const googleMapsUrl = String(publicProfile.googleMapsUrl || "").trim();
  const googleReviewsUrl = String(publicProfile.googleReviewsUrl || "").trim();
  const instagramUrl = String(publicProfile.instagramUrl || "").trim();
  const linktreeUrl = String(publicProfile.linktreeUrl || "").trim();
  const googleRating = Number(publicProfile.googleRating || 0);
  const googleReviewCount = Number(publicProfile.googleReviewCount || 0);
  const hasGoogleRating = googleRating > 0;
  const hasMapLink = Boolean(googleMapsUrl);
  const hasReviewsLink = Boolean(googleReviewsUrl);
  const hasInstagramLink = Boolean(instagramUrl);
  const hasLinktreeLink = Boolean(linktreeUrl);
  const webStyleVars = useMemo(
    () => getWebStylePreset(shopInfo?.themeConfig?.webPreset),
    [shopInfo?.themeConfig?.webPreset],
  );
  const emailReview = useMemo(() => reviewEmail(email), [email]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paymentResult = params.get("payment_result");

    if (!paymentResult) return;

    if (paymentResult === "success") {
      setPaymentResultMessage("Pago aprobado. Tu turno ya quedó reservado.");
    } else if (paymentResult === "pending") {
      setPaymentResultMessage(
        "Tu pago quedó pendiente. Apenas se confirme, tu reserva se actualizará.",
      );
    } else if (paymentResult === "failure") {
      setPaymentResultMessage(
        "El pago no se completó. Si querés, podés intentar otra vez.",
      );
    }

    params.delete("payment_result");
    const nextQuery = params.toString();
    const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}`;
    window.history.replaceState({}, "", nextUrl);
  }, []);

  // 3. TODOS LOS USEEFFECT
  useEffect(() => {
    if (!selectedSlot) return;
    if (!allSlots.includes(selectedSlot)) setSelectedSlot(null);
  }, [allSlots, selectedSlot]);

  useEffect(() => {
    if (!paymentOptions.length) return;
    const currentOption = paymentOptions.find(
      (item) => item.value === paymentMethod,
    );
    if (!currentOption) {
      setPaymentMethod(paymentOptions[0].value);
    }
  }, [paymentMethod, paymentOptions]);

  useEffect(() => {
    if (!slugReady || shopUnavailable) return;
    (async () => {
      try {
        const res = await fetchShopInfo();
        setShopInfo(res?.shop ?? null);
        fetchShopMedia()
          .then((mediaRes) => {
            setShopInfo((current) =>
              current
                ? {
                    ...current,
                    themeConfig: {
                      ...(current.themeConfig || {}),
                      ...(mediaRes?.themeConfig || {}),
                    },
                  }
                : current,
            );
          })
          .catch((mediaError) => {
            console.warn(
              "No se pudo cargar la media pública:",
              mediaError?.message || mediaError,
            );
          });
      } catch (err) {
        console.error(err);
        if (err?.status === 404) {
          setShopUnavailable(true);
          onNotFound?.();
        }
      } finally {
        setShopLoading(false);
      }
    })();
  }, [onNotFound, shopUnavailable, slugReady]);

  useEffect(() => {
    if (!slugReady || shopUnavailable) return;
    (async () => {
      try {
        const res = await fetchServices();
        const list = res?.services ?? [];
        setServices(list);
        setSelectedServices(list[0] ? [list[0]] : []);
      } catch (err) {
        console.error("Error servicios:", err?.message, err?.status);
        if (err?.status === 404) {
          setShopUnavailable(true);
          onNotFound?.();
        }
      } finally {
      }
    })();
  }, [onNotFound, shopUnavailable, slugReady]);

  useEffect(() => {
    if (!slugReady || shopUnavailable) return;
    (async () => {
      try {
        const res = await fetchBarbers();
        const list = res.barbers || [];
        setBarbers(list);
        if (list.length > 0) setSelectedBarber(list[0]._id);
      } catch (err) {
        console.error("Error barberos:", err.message, err.status);
        if (err?.status === 404) {
          setShopUnavailable(true);
          onNotFound?.();
        }
      } finally {
        setLoadingBarbers(false);
      }
    })();
  }, [onNotFound, shopUnavailable, slugReady]);

  const loadSlots = useCallback(async () => {
    if (!selectedBarber || !slugReady || shopUnavailable) return;
    try {
      setLoadingSlots(true);
      const res = await fetchBarberAppointments(
        selectedBarber,
        formatDateParam(selectedDate),
      );
      if (res?.shopClosure?.isClosed) {
        setClosedDayNotice(
          res.shopClosure.message ||
            "Este día el local permanecerá cerrado. Elegí otro turno disponible.",
        );
      } else if (res?.barberClosure?.isClosed) {
        setClosedDayNotice(
          res.barberClosure.message ||
            `Este ${businessCopy.staffSingular} no atenderá ese día. Elegí otro profesional o seleccioná otra fecha.`,
        );
      } else {
        setClosedDayNotice("");
      }
      const busyRanges = [];
      if (res?.appointments) {
        res.appointments.forEach((app) => {
          if (app.status === "cancelled") return;
          const startLabel = formatTimeInShopTZ(app.startTime);
          const [baseHour, baseMinute] = startLabel.split(":").map(Number);
          const startMinutes = baseHour * 60 + baseMinute;
          const occupiedDuration =
            (app.durationMinutes ?? DEFAULT_SLOT_INTERVAL_MINUTES) +
            (app.bufferAfterMinutesApplied ?? 0);
          busyRanges.push({
            start: startMinutes,
            end: startMinutes + occupiedDuration,
          });
        });
      }
      if (res?.resolvedSchedule) {
        setSelectedBarberSchedule({
          scheduleRange: res.resolvedSchedule.scheduleRange ?? null,
          scheduleRanges: normalizeScheduleRanges(
            res.resolvedSchedule.scheduleRanges,
          ),
        });
      } else {
        setSelectedBarberSchedule(null);
      }
      setOccupiedRanges(busyRanges);
      setBarberTimeBlocks(res?.barberTimeBlocks || []);
    } catch (err) {
      console.error("Error ocupación:", err);
      if (err?.status === 404) {
        setShopUnavailable(true);
        onNotFound?.();
      }
    } finally {
      setLoadingSlots(false);
    }
  }, [
    businessCopy.staffSingular,
    onNotFound,
    selectedBarber,
    selectedDate,
    shopUnavailable,
    slugReady,
  ]);

  useEffect(() => {
    if (!selectedBarber) {
      setSelectedBarberSchedule(null);
      setClosedDayNotice("");
    }
  }, [selectedBarber]);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!active) return;
      await loadSlots();
    })();
    const intervalId = setInterval(() => {
      loadSlots();
    }, 15000);
    return () => {
      active = false;
      clearInterval(intervalId);
    };
  }, [loadSlots]);

  // 4. CALLBACKS
  const handleDateShift = useCallback((days) => {
    setSelectedDate((prev) => {
      const next = new Date(prev);
      next.setDate(prev.getDate() + days);
      return next;
    });
  }, []);

  const isSlotDisabled = useCallback(
    (label) => {
      const startMinutes = labelToMinutes(label);

      // Solo bloquear pasados si es hoy
      const isToday = selectedDate.toDateString() === new Date().toDateString();
      if (isToday) {
        const now = new Date();
        const nowMinutes = now.getHours() * 60 + now.getMinutes();
        if (startMinutes <= nowMinutes) return true;
      }

      // Bloquear si está ocupado
      const endMinutes = startMinutes + currentRequiredMinutes;
      const overlaps = occupiedRanges.some(
        (range) => range.start < endMinutes && range.end > startMinutes,
      );
      if (overlaps) return true;

      const overlapsBlockedTime = barberTimeBlocks.some((block) => {
        if (block?.date !== formatDateParam(selectedDate)) return false;
        const [blockStartHour, blockStartMinute] = String(
          block.start || "00:00",
        )
          .split(":")
          .map(Number);
        const [blockEndHour, blockEndMinute] = String(block.end || "00:00")
          .split(":")
          .map(Number);
        const blockStart = blockStartHour * 60 + blockStartMinute;
        const blockEnd = blockEndHour * 60 + blockEndMinute;
        return startMinutes < blockEnd && endMinutes > blockStart;
      });
      if (overlapsBlockedTime) return true;

      return false;
    },
    [barberTimeBlocks, currentRequiredMinutes, occupiedRanges, selectedDate],
  );

  useEffect(() => {
    if (!selectedSlot) return;
    if (isSlotDisabled(selectedSlot)) {
      setSelectedSlot(null);
    }
  }, [isSlotDisabled, selectedSlot]);

  useEffect(() => {
    if (!compatibleBarbers.length) {
      setSelectedBarber(null);
      setSelectedSlot(null);
      return;
    }

    if (!compatibleBarbers.some((barber) => barber._id === selectedBarber)) {
      setSelectedBarber(compatibleBarbers[0]._id);
      setSelectedSlot(null);
    }
  }, [compatibleBarbers, selectedBarber]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const serviceName =
      selectedServices.map((item) => item.name).join(" + ") || "Servicio";

    if (!selectedBarber || !selectedSlot) {
      alert(`Por favor selecciona ${businessCopy.staffSingular} y horario`);
      return;
    }

    if (!selectedServices.length) {
      alert("Por favor seleccioná al menos un servicio.");
      return;
    }

    if (!phone.trim()) {
      alert("Ingresá un teléfono/WhatsApp para que puedan contactarte.");
      return;
    }

    if (!emailReview.isValid) {
      alert(emailReview.message);
      return;
    }

    // Con membresía activa el turno es gratis: el backend fuerza efectivo y no
    // genera link de pago, así que en el cliente también usamos "cash".
    const hasUsableMembership = Boolean(membership && membership.turnsRemaining > 0);
    const effectivePaymentMethod = hasUsableMembership ? "cash" : paymentMethod;

    try {
      setSaving(true);
      const finalDateUTC = buildIsoFromShopDateAndTime(
        selectedDate,
        selectedSlot,
      );

      const response = await createAppointment({
        barberId: selectedBarber,
        customerName: customerName.trim(),
        service: serviceName,
        serviceItems: selectedServices.map((item) => ({
          serviceId: getEntityId(item),
          name: item.name,
          durationMinutes: item.durationMinutes,
          price: item.price,
        })),
        startTime: finalDateUTC,
        durationMinutes: currentDuration,
        servicePrice: currentServicePrice,
        couponCode: appliedCoupon?.code || null,
        notes: phone.trim(),
        email: emailReview.normalized,
        paymentMethod: effectivePaymentMethod,
      });

      if (
        response?.payment?.requiresRedirect &&
        response?.payment?.checkoutUrl
      ) {
        window.location.assign(response.payment.checkoutUrl);
        return;
      }

      if (effectivePaymentMethod === "transfer") {
        throw new Error(
          "La reserva se creó, pero Mercado Pago no devolvió un link de pago. Revisá la configuración del checkout y volvé a intentar.",
        );
      }

      // --- POPUP DE ÉXITO ---
      setSuccessEmail(emailReview.normalized || "");
      setSuccessOpen(true);
      // -----------------------------

      setCustomerName("");
      setPhone("");
      setEmail("");
      setSelectedServices([]);
      setSelectedBarber("");
      setSelectedSlot(null);
      setPaymentMethod("cash");
      await loadSlots();
    } catch (err) {
      alert("Error: " + (err.details?.error || err.message));
    } finally {
      setSaving(false);
    }
  };

  // 5. LOADING STATE
  if (!slugReady || loadingBarbers) {
    return (
      <section className={styles.wrapper}>
        <div
          style={{
            textAlign: "center",
            padding: "60px 20px",
            color: "#B89016",
          }}
        >
          Cargando...
        </div>
      </section>
    );
  }

  // 6. RENDER
  return (
    <section className={styles.wrapper} style={webStyleVars}>
      <div className={styles.pageBackdrop} aria-hidden="true" />
      {paymentResultMessage ? (
        <div
          style={{
            maxWidth: 860,
            margin: "0 auto 18px",
            background: "rgba(57, 224, 31, 0.12)",
            border: "1px solid rgba(57, 224, 31, 0.28)",
            color: "#FFD6EC",
            padding: "14px 16px",
            borderRadius: 18,
            fontWeight: 600,
          }}
        >
          {paymentResultMessage}
        </div>
      ) : null}

      {servicePickerOpen && (
        <div
          className={styles.modalBackdrop}
          onClick={() => setServicePickerOpen(false)}
        >
          <div
            className={styles.modalCard}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Seleccionar servicio</h3>
              <button
                type="button"
                className={styles.modalClose}
                onClick={() => setServicePickerOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className={styles.modalList}>
              {services.map((service) => (
                <button
                  type="button"
                  key={service._id}
                  className={`${styles.serviceItem} ${selectedServiceIds.has(service._id) ? styles.serviceItemActive : ""}`}
                  onClick={() => {
                    setSelectedServices((current) => {
                      const exists = current.some(
                        (item) => item._id === service._id,
                      );
                      if (exists) {
                        if (current.length === 1) return current;
                        return current.filter(
                          (item) => item._id !== service._id,
                        );
                      }
                      return [...current, service];
                    });
                  }}
                >
                  <div>
                    <span className={styles.serviceItemTitle}>
                      {service.name}
                    </span>
                    <span className={styles.serviceItemMeta}>
                      {service.durationMinutes} min ·{" "}
                      {couponDiscountsByServiceId.get(String(service._id))
                        ?.discountAmount > 0 ? (
                        <>
                          <span className={styles.oldPrice}>
                            {formatPrice(
                              couponDiscountsByServiceId.get(String(service._id))
                                .originalPrice,
                            )}
                          </span>{" "}
                          {formatPrice(
                            couponDiscountsByServiceId.get(String(service._id))
                              .finalPrice,
                          )}
                        </>
                      ) : (
                        formatPrice(service.price)
                      )}
                    </span>
                  </div>
                  <span className={styles.serviceCheck}>
                    {selectedServiceIds.has(service._id) ? "✓" : "+"}
                  </span>
                </button>
              ))}
            </div>
            <div className={styles.modalFooter}>
              <div className={styles.modalFooterSummary}>
                <strong>{selectedServices.length || 0}</strong>
                <span>
                  {selectedServices.length === 1 ? "servicio" : "servicios"} ·{" "}
                  {selectedServiceSummary}
                </span>
              </div>
              <button
                type="button"
                className={styles.modalConfirm}
                onClick={() => setServicePickerOpen(false)}
              >
                Listo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* NAV */}
      <nav className={`${style.nav} ${styles.bookingNav}`}>
        <div className={style.navLogo}>
          <span className={`${style.navLogoMark} ${styles.bookingNavLogoMark}`}>
            {shopProfileSrc ? (
              <img
                src={shopProfileSrc}
                alt={shopInfo?.name || SHIFT_APP_BRAND_NAME}
              />
            ) : (
              <span className={styles.logoPlaceholderText}>
                {(shopInfo?.name || SHIFT_APP_BRAND_NAME).charAt(0)}
              </span>
            )}
          </span>
        </div>
      </nav>

      <form className={styles.card} onSubmit={handleSubmit}>
        <div className={styles.cardHero}>
          <div className={styles.shopHeroMedia}>
            {desktopBannerSrc || mobileBannerSrc ? (
              <picture className={styles.shopHeroPicture}>
                {mobileBannerSrc ? (
                  <source media="(max-width: 768px)" srcSet={mobileBannerSrc} />
                ) : null}
                <img
                  className={styles.shopHeroBanner}
                  src={desktopBannerSrc || mobileBannerSrc}
                  alt=""
                  aria-hidden="true"
                />
              </picture>
            ) : (
              <div className={styles.shopHeroPlaceholder} aria-hidden="true" />
            )}
            <div className={styles.shopHeroAvatar}>
              {shopProfileSrc ? (
                <img
                  src={shopProfileSrc}
                  alt={
                    shopInfo?.name
                      ? `Logo de ${shopInfo.name}`
                      : "Logo del negocio"
                  }
                />
              ) : (
                <span className={styles.heroAvatarPlaceholderText}>
                  {(shopInfo?.name || SHIFT_APP_BRAND_NAME).charAt(0)}
                </span>
              )}
            </div>
          </div>
          <div className={styles.shopHeroContent}>
            <div className={styles.shopHeroText}>
              <p className={styles.shopHeroEyebrow}>Reservas online</p>
              <div className={styles.shopHeroTitleRow}>
                <h2 className={styles.shopHeroName}>
                  {shopLoading
                    ? "Cargando negocio..."
                    : shopInfo?.name || SHIFT_APP_BRAND_NAME}
                </h2>
              </div>
              {shopSubtitle ? (
                <p className={styles.shopHeroSubtitle}>{shopSubtitle}</p>
              ) : null}
              {hasGoogleRating ? (
                <div
                  className={styles.shopRating}
                  aria-label={`Valoración ${googleRating.toFixed(1)} de 5`}
                >
                  <span className={styles.shopRatingStars} aria-hidden="true">
                    ★★★★★
                  </span>
                  <strong>{googleRating.toFixed(1)}</strong>
                  {googleReviewCount > 0 ? (
                    <span>{googleReviewCount} reseñas</span>
                  ) : null}
                </div>
              ) : null}
              {shopAddress || shopPhone ? (
                <div className={styles.shopContactMeta}>
                  {shopAddress ? (
                    <span>
                      <span className={styles.contactIcon} aria-hidden="true">
                        <img className={style.icon} src="mapa.png" alt="mapa" />
                      </span>
                      {shopAddress}
                    </span>
                  ) : null}
                  {shopPhone ? (
                    <span>
                      <span className={styles.contactIcon} aria-hidden="true">
                        <img
                          className={style.icon}
                          src="telefonoNegro.png"
                          alt="telefono"
                        />
                      </span>
                      {shopPhone}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
            {hasMapLink ||
            hasReviewsLink ||
            hasInstagramLink ||
            hasLinktreeLink ? (
              <div className={styles.shopSecondaryLinks}>
                {hasMapLink ? (
                  <a
                    href={googleMapsUrl}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Cómo llegar"
                    title="Cómo llegar"
                  >
                    <span aria-hidden="true">
                      <img className={style.icon} src="mapa.png" alt="mapa" />
                    </span>
                  </a>
                ) : null}
                {hasReviewsLink ? (
                  <a
                    href={googleReviewsUrl}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Ver reseñas"
                    title="Ver reseñas"
                  >
                    <span aria-hidden="true">
                      <img
                        className={style.icon}
                        src="estrella.png"
                        alt="estrella"
                      />
                    </span>
                  </a>
                ) : null}
                {hasInstagramLink ? (
                  <a
                    href={instagramUrl}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Instagram"
                    title="Instagram"
                  >
                    <span aria-hidden="true">
                      <img
                        className={style.icon}
                        src="instagram.png"
                        alt="instagram"
                      />
                    </span>
                  </a>
                ) : null}
                {hasLinktreeLink ? (
                  <a
                    href={linktreeUrl}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Linktree"
                    title="Linktree"
                  >
                    <span aria-hidden="true">
                      <img
                        className={style.icon}
                        src="linktree.png"
                        alt="linktree"
                      />
                    </span>
                  </a>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <div className={styles.fieldGroup}>
          <label className={styles.label}>Servicios deseados</label>
          <button
            type="button"
            className={styles.selector}
            onClick={() => setServicePickerOpen(true)}
          >
            <div>
              <span className={styles.selectorMainText}>
                {selectedServiceLabel}
              </span>
              <span className={styles.selectorSubText}>
                {selectedServiceSummary}
              </span>
            </div>
            <span className={styles.arrowIcon}>▼</span>
          </button>
          {selectedServices.length > 1 ? (
            <div className={styles.selectedServicesList}>
              {selectedServices.map((service) => (
                <span key={service._id} className={styles.selectedServiceTag}>
                  {service.name}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        {shopInfo?.paymentSettings?.bookingCouponsEnabled ? (
          <div className={styles.couponBox}>
            <div className={styles.couponHeader}>
              <div>
                <span className={styles.couponTitle}>¿Tenés un cupón?</span>
                <span className={styles.couponHint}>
                  Ingresalo para ver el precio con descuento.
                </span>
              </div>
              {appliedCoupon ? (
                <button
                  type="button"
                  className={styles.couponClearButton}
                  onClick={() => {
                    setAppliedCoupon(null);
                    setCouponInput("");
                    setCouponError("");
                  }}
                >
                  Quitar
                </button>
              ) : null}
            </div>
            <div className={styles.couponRow}>
              <input
                className={styles.couponInput}
                value={couponInput}
                placeholder="Código del cupón"
                onChange={(event) =>
                  setCouponInput(event.target.value.toUpperCase())
                }
              />
              <button
                type="button"
                className={styles.couponApplyButton}
                onClick={handleApplyCoupon}
                disabled={couponLoading}
              >
                {couponLoading ? "Aplicando..." : "Aplicar"}
              </button>
            </div>
            {couponError ? (
              <p className={styles.couponError}>{couponError}</p>
            ) : null}
            {appliedCoupon ? (
              <div className={styles.couponApplied}>
                <span>
                  {appliedCoupon.name || appliedCoupon.code}: ahorrás{" "}
                  {formatPrice(appliedCoupon.totalDiscount)}
                </span>
                <strong>
                  {formatPrice(appliedCoupon.totalOriginal)} →{" "}
                  {formatPrice(appliedCoupon.totalFinal)}
                </strong>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className={styles.twoColumn}>
          <div className={styles.fieldGroup}>
            <label className={styles.label}>Nombre</label>
            <input
              className={styles.input}
              placeholder="Tu nombre"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              required
            />
          </div>
          <div className={styles.fieldGroup}>
            <label className={styles.label}>WhatsApp</label>
            <input
              className={styles.input}
              placeholder="Ej: 342 000 0000"
              type="tel"
              value={phone}
              onChange={(e) =>
                setPhone(e.target.value.replace(/[^0-9+\s-]/g, ""))
              }
              required
            />
          </div>
        </div>
        {/* CAMPO DE EMAIL (opcional). Si sos miembro, ingresalo para vincular tu membresía. */}
        <div className={styles.fieldGroup}>
          <label className={styles.label}>Email (opcional)</label>
          <p className={styles.memberHint}>
            ¿Sos miembro? Ingresá tu email y usás tu turno gratis.
          </p>
          <input
            className={styles.input}
            type="email"
            placeholder="ejemplo@correo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {email ? (
            <p
              className={`${styles.emailFeedback} ${
                emailReview.isValid
                  ? styles.emailFeedbackOk
                  : styles.emailFeedbackWarning
              }`}
            >
              {emailReview.message}
            </p>
          ) : null}

          {membership && membership.turnsRemaining > 0 ? (
            <div className={styles.membershipCard}>
              <div
                className={styles.membershipCardInner}
                style={{ background: metallicGradient(membership.color) }}
              >
                <span className={styles.membershipBadge}>Membresía</span>
                <span className={styles.membershipName}>
                  {membership.planName}
                </span>
                <div className={styles.membershipTurns}>
                  <span className={styles.membershipTurnsNum}>
                    {membership.turnsRemaining}
                  </span>
                  <span className={styles.membershipTurnsLbl}>
                    turno{membership.turnsRemaining === 1 ? "" : "s"} gratis
                    disponibles
                  </span>
                </div>
                {membership.giftText ? (
                  <span className={styles.membershipGift}>
                    🎁 {membership.giftText}
                  </span>
                ) : null}
                <span className={styles.membershipNote}>
                  Este turno va sin cargo.
                </span>
              </div>
            </div>
          ) : null}
        </div>

        {paymentOptions.length ? (
          <div className={styles.fieldGroup}>
            <label className={styles.label}>¿Cómo preferís pagar?</label>
            <div className={styles.paymentMethodRow}>
              {paymentOptions.map((option) => (
                <div className={style.containerMetodo}>
                  <button
                    type="button"
                    key={option.value}
                    className={`${styles.paymentMethodChip} ${paymentMethod === option.value ? styles.paymentMethodChipActive : ""}`}
                    onClick={() => setPaymentMethod(option.value)}
                  >
                    <span className={styles.paymentMethodChipTitle}>
                      {option.label}
                    </span>
                  </button>
                  <div className={styles.paymentMethodChipHelper}>
                    <img
                      className={styles.infoicon}
                      src="/infoicon.png"
                      alt="info"
                    />
                    {option.helper}
                  </div>
                </div>
              ))}
            </div>
            <p className={styles.paymentMethodNotice}>
              Algunas tarjetas prepagas pueden ser rechazadas por Mercado Pago.
              Si pasa, intentá con saldo en tu cuenta de Mercado Pago, otra
              tarjeta o elegí pagar en el local.
            </p>
          </div>
        ) : null}

        <div className={styles.fieldGroup}>
          <label className={styles.label}>
            {`Elegí tu ${businessCopy.staffSingularCapitalized}`}
          </label>
          <div className={styles.barberGrid}>
            {compatibleBarbers.length === 0 ? (
              <p style={{ color: "#666", fontSize: 14 }}>
                {selectedServices.length
                  ? `No hay ${businessCopy.staffPlural} disponibles para ese servicio.`
                  : `No hay ${businessCopy.staffPlural} disponibles.`}
              </p>
            ) : (
              compatibleBarbers.map((b) => (
                <button
                  type="button"
                  key={b._id}
                  className={`${styles.barberChip} ${selectedBarber === b._id ? styles.barberChipSelected : ""}`}
                  onClick={() => {
                    setSelectedBarber(b._id);
                    setSelectedSlot(null);
                  }}
                >
                  <div className={styles.barberAvatar}>
                    {b.photoUrl ? (
                      <img
                        src={b.photoUrl}
                        alt={b.fullName}
                        className={styles.barberAvatarImage}
                      />
                    ) : (
                      b.fullName.charAt(0)
                    )}
                  </div>
                  <div className={styles.barberInfo}>
                    <span className={styles.barberName}>
                      {b.fullName.split(" ")[0]}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className={styles.fieldGroup}>
          <div className={styles.scheduleHeader}>
            <label className={`${styles.label} ${styles.scheduleHeaderLabel}`}>
              Horarios
              <br />
              disponibles
            </label>
            <div className={styles.dateSelector}>
              <button
                type="button"
                onClick={() => handleDateShift(-1)}
                className={styles.dateBtn}
              >
                ‹
              </button>
              <span className={styles.dateText}>{formattedDate}</span>
              <button
                type="button"
                onClick={() => handleDateShift(1)}
                className={styles.dateBtn}
              >
                ›
              </button>
            </div>
          </div>

          {/* ANTES: <div className={styles.timeGrid}> */}
          <div className={styles.timeGridWrapper}>
            {loadingSlots ? (
              <p style={{ color: "#666", fontSize: 14 }}>
                Cargando horarios...
              </p>
            ) : closedDayNotice ? (
              <div className={styles.noScheduleMessage}>
                <p>
                  <strong>No disponible este día</strong>
                </p>
                <p>{closedDayNotice}</p>
                <p className={styles.subtitleError}>
                  Elegí otra fecha para reservar tu turno.
                </p>
              </div>
            ) : horarioGroups.length === 0 ? (
              <div className={styles.noScheduleMessage}>
                <p>
                  {`🚫 Este ${businessCopy.staffSingular} no atiende los días `}
                  <br />
                  <strong>{formattedDate}</strong>
                </p>
                <p className={styles.subtitleError}>
                  {`Intentá seleccionar otra fecha u otro ${businessCopy.staffSingular}.`}
                </p>
              </div>
            ) : (
              horarioGroups.map((group, gi) => (
                <div key={gi}>
                  {group.label ? (
                    <p className={styles.shiftGroupLabel}>
                      {group.label === "mañana" ? "☀️ Mañana" : "🌙 Tarde"}
                    </p>
                  ) : null}
                  <div className={styles.timeGrid}>
                    {group.slots.map((label) => {
                      const disabled = isSlotDisabled(label);
                      return (
                        <button
                          type="button"
                          key={label}
                          disabled={disabled}
                          className={`${styles.timeChip} ${selectedSlot === label ? styles.timeChipActive : ""} ${disabled ? styles.timeChipDisabled : ""}`}
                          onClick={() => setSelectedSlot(label)}
                        >
                          <span className={styles.timeChipText}>{label}</span>
                          <span className={styles.timeChipDuration}>
                            {currentDuration}min
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <button
          className={styles.submitButton}
          type="submit"
          disabled={saving || !selectedSlot || Boolean(closedDayNotice)}
        >
          {saving ? "Procesando..." : "Confirmar Reserva"}
        </button>
        {paymentMethod === "transfer" ? (
          <p className={styles.submitHint}>
            Al confirmar te vamos a redirigir a Mercado Pago para completar el
            pago.
          </p>
        ) : null}
      </form>

      {successOpen ? (
        <div
          onClick={() => {
            setSuccessOpen(false);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            zIndex: 9999,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 380,
              background: "#fff",
              borderRadius: 22,
              padding: "28px 24px",
              textAlign: "center",
              boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
            }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                margin: "0 auto 14px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(22,163,74,0.14)",
                color: "#16a34a",
              }}
            >
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
                <path
                  d="M4 12.5l5 5 11-11"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h3 style={{ margin: "0 0 8px", fontSize: "1.25rem", fontWeight: 900, color: "#111" }}>
              ¡Tu reserva se confirmó!
            </h3>
            <p style={{ margin: "0 0 20px", fontSize: "0.95rem", color: "#555", lineHeight: 1.5 }}>
              Tu turno quedó reservado con éxito.
              {successEmail
                ? ` Te enviamos la confirmación a ${successEmail}.`
                : ""}
            </p>
            <button
              type="button"
              onClick={() => {
                setSuccessOpen(false);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              style={{
                width: "100%",
                border: "none",
                borderRadius: 14,
                padding: "13px 16px",
                fontSize: "1rem",
                fontWeight: 800,
                color: "#fff",
                background: "var(--indigo, #2FAA1F)",
                cursor: "pointer",
              }}
            >
              Aceptar
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default BookingForm;
