export function normalizeWhatsAppPhone(phone) {
  return String(phone || "").replace(/[^\d]/g, "");
}

export function buildWhatsAppUrl(phone, text) {
  const normalizedPhone = normalizeWhatsAppPhone(phone);
  if (!normalizedPhone) return "";

  return `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(
    String(text || ""),
  )}`;
}

export function buildAppointmentCancellationWhatsAppUrl({
  phone,
  customerName,
  dateLabel,
  timeLabel,
  whenLabel = "del dia",
}) {
  return buildWhatsAppUrl(
    phone,
    `Hola! Soy ${customerName}, te escribo por mi turno ${whenLabel} ${dateLabel} a las ${timeLabel} para cancelarlo`,
  );
}
