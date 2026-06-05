import mongoose from "mongoose";
import { BarberModel } from "../models/Barber.js";
import { AppointmentModel } from "../models/Appointment.js";
import { ServiceModel } from "../models/Services.js";
import { UserModel } from "../models/User.js";
import { CashEntryModel } from "../models/CashEntry.js";
import { applyShopScope } from "../utils/shopContext.js";
import admin from "../firebase.js";
import { sendAppMail } from "../services/mailer.js";
import {
  getTimeZoneDayRange,
  getTimeZoneLabel,
  getTimeZoneWeekday,
} from "../utils/timezone.js";
import {
  resolveBarberClosureForDate,
  serializeBarberClosure,
} from "../utils/barberClosures.js";
import {
  doesTimeBlockOverlapRange,
  resolveBarberTimeBlocksForDate,
} from "../utils/barberTimeBlocks.js";
import {
  resolveShopClosureForDate,
  serializeShopClosure,
} from "../utils/shopClosures.js";
import {
  isReminderRunAuthorized,
  processAppointmentReminders,
} from "../services/reminderService.js";
import { getAppointmentOccupiedEnd } from "../utils/appointmentTiming.js";
import {
  resolveAssignedBarberPushTarget,
  resolveOwnerPushTarget,
} from "../utils/pushRecipients.js";

// Función auxiliar para calcular rangos de fecha
function buildDayRange(dateLike) {
  return getTimeZoneDayRange(dateLike);
}

function logPushError(label, error) {
  console.error(label, {
    code: error?.code,
    message: error?.message,
    errorInfo: error?.errorInfo,
  });
}

function normalizePaymentMethod(value) {
  return value === "transfer" ? "transfer" : "cash";
}

function normalizeCollectedPaymentMethod(value) {
  if (value == null || value === "") return null;
  if (value === "mixed") return "mixed";
  return normalizePaymentMethod(value);
}

function normalizePaymentStatus(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["unpaid", "partial", "paid", "refunded"].includes(normalized)) {
    return normalized;
  }
  return "unpaid";
}

function getEffectivePaymentMethod(appointment) {
  if (appointment.paymentMethodCollected === "mixed") return "mixed";
  return normalizePaymentMethod(
    appointment.paymentMethodCollected || appointment.paymentMethod,
  );
}

function getEffectivePaidAmount(appointment, fallbackPrice = 0) {
  const hasExplicitStatus =
    appointment.paymentStatus != null &&
    String(appointment.paymentStatus).trim() !== "";
  const paymentStatus = normalizePaymentStatus(appointment.paymentStatus);

  if (!hasExplicitStatus) {
    const paid = Number(appointment.amountPaid);
    if (Number.isFinite(paid) && paid > 0) return paid;

    const total = Number(appointment.amountTotal);
    if (Number.isFinite(total) && total > 0) return total;

    return Number(fallbackPrice || appointment.servicePrice || 0);
  }

  if (paymentStatus === "unpaid" || paymentStatus === "refunded") {
    return 0;
  }

  const paid = Number(appointment.amountPaid);
  if (Number.isFinite(paid) && paid > 0) return paid;

  const total = Number(appointment.amountTotal);
  if (paymentStatus === "paid" && Number.isFinite(total) && total > 0) {
    return total;
  }

  return Number(fallbackPrice || appointment.servicePrice || 0);
}

async function resolveServicePrice({ ownerId, serviceName, providedPrice }) {
  const parsedPrice = Number(providedPrice);
  if (Number.isFinite(parsedPrice) && parsedPrice >= 0) {
    return parsedPrice;
  }

  const serviceDoc = await ServiceModel.findOne({
    owner: ownerId,
    name: serviceName,
  })
    .select({ price: 1 })
    .lean();

  return Number(serviceDoc?.price || 0);
}

function monthStartFromOffset(baseDate, offset) {
  return new Date(baseDate.getFullYear(), baseDate.getMonth() + offset, 1, 0, 0, 0, 0);
}

function parseDateOnly(value) {
  if (!value) return null;
  const text = String(value).trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (!match) return null;
  const d = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 0, 0, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d;
}

function buildMetricsRange(query = {}) {
  const now = new Date();
  const parsedYear = Number(query.year);
  const year = Number.isInteger(parsedYear) && parsedYear >= 2024
    ? parsedYear
    : now.getFullYear();

  const annualFlag = String(query.annual ?? "").toLowerCase() === "true";
  let mode = String(query.range || "").trim().toLowerCase();
  if (!["daily", "weekly", "monthly", "annual"].includes(mode)) {
    mode = annualFlag ? "annual" : "monthly";
  }

  if (mode === "daily") {
    const ref = parseDateOnly(query.date) || now;
    const start = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), 0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return {
      mode: "daily",
      year: start.getFullYear(),
      month: start.getMonth() + 1,
      day: start.getDate(),
      key: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`,
      label: start.toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric" }),
      start,
      end,
    };
  }

  if (mode === "weekly") {
    const ref = parseDateOnly(query.date) || now;
    const base = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), 0, 0, 0, 0);
    const offsetToMonday = (base.getDay() + 6) % 7;
    const start = new Date(base);
    start.setDate(base.getDate() - offsetToMonday);
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    const lastDay = new Date(end);
    lastDay.setDate(end.getDate() - 1);
    return {
      mode: "weekly",
      year: start.getFullYear(),
      month: start.getMonth() + 1,
      day: start.getDate(),
      key: `${start.getFullYear()}-W${String(start.getMonth() + 1).padStart(2, "0")}${String(start.getDate()).padStart(2, "0")}`,
      label: `Semana ${start.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" })} al ${lastDay.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" })}`,
      start,
      end,
    };
  }

  if (mode === "annual") {
    const start = new Date(year, 0, 1, 0, 0, 0, 0);
    const end = new Date(year + 1, 0, 1, 0, 0, 0, 0);
    return {
      mode: "annual",
      year,
      month: null,
      key: String(year),
      label: `Año ${year}`,
      start,
      end,
    };
  }

  const parsedMonth = Number(query.month);
  const month = Number.isInteger(parsedMonth) && parsedMonth >= 1 && parsedMonth <= 12
    ? parsedMonth
    : now.getMonth() + 1;
  const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const end = new Date(year, month, 1, 0, 0, 0, 0);

  return {
    mode: "monthly",
    year,
    month,
    key: `${year}-${String(month).padStart(2, "0")}`,
    label: start.toLocaleDateString("es-AR", {
      month: "long",
      year: "numeric",
    }),
    start,
    end,
  };
}

function createMetricsBucket(base = {}) {
  return {
    appointmentsCount: 0,
    totalRevenue: 0,
    cashCount: 0,
    cashRevenue: 0,
    transferCount: 0,
    transferRevenue: 0,
    commission: 0,
    localRevenue: 0,
    ...base,
  };
}

// % de comisión normalizado para un profesional (0–100).
function normalizeCommissionPercent(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(100, parsed));
}

// % de comisión de un servicio. null = sin comisión propia (hereda la del profesional).
function normalizeServiceCommission(value) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.min(100, parsed));
}

function buildCommissionMaps(activeServices, barbers) {
  const serviceCommissionMap = new Map(
    (activeServices || []).map((s) => [
      String(s.name || "").trim().toLowerCase(),
      s.commissionPercent === null || s.commissionPercent === undefined
        ? null
        : Number(s.commissionPercent),
    ]),
  );
  const barberCommissionMap = new Map(
    (barbers || []).map((b) => [String(b._id), Number(b.commissionPercent || 0)]),
  );
  return { serviceCommissionMap, barberCommissionMap };
}

// La comisión del SERVICIO tiene prioridad; si el servicio no tiene, usa la del profesional.
function resolveCommissionPercent(appointment, commissionMaps) {
  if (!commissionMaps) return 0;
  const { serviceCommissionMap, barberCommissionMap } = commissionMaps;
  const serviceKey = String(appointment.service || "").trim().toLowerCase();
  const servicePct = serviceCommissionMap ? serviceCommissionMap.get(serviceKey) : null;
  if (servicePct !== undefined && servicePct !== null && Number.isFinite(Number(servicePct))) {
    return Math.max(0, Math.min(100, Number(servicePct)));
  }
  const barberId = String(
    appointment.barber && typeof appointment.barber === "object"
      ? appointment.barber._id || appointment.barber
      : appointment.barber || "",
  );
  const barberPct = barberCommissionMap ? barberCommissionMap.get(barberId) : 0;
  return Math.max(0, Math.min(100, Number(barberPct || 0)));
}

function applyAppointmentMetrics(bucket, appointment, servicePriceMap, commissionMaps) {
  const fallbackPrice = servicePriceMap.get(
    String(appointment.service || "").trim().toLowerCase(),
  );
  const finalPrice = getEffectivePaidAmount(appointment, fallbackPrice);
  const method = getEffectivePaymentMethod(appointment);

  bucket.appointmentsCount += 1;
  bucket.totalRevenue += finalPrice;

  const pct = resolveCommissionPercent(appointment, commissionMaps);
  const commission = pct > 0 ? Number(((finalPrice * pct) / 100).toFixed(2)) : 0;
  bucket.commission += commission;
  bucket.localRevenue += Number((finalPrice - commission).toFixed(2));

  if (!(finalPrice > 0)) {
    return;
  }

  if (method === "mixed") {
    // El pago mixto suma su parte en efectivo y su parte en transferencia.
    const cash = Math.max(0, Number(appointment.cashAmount) || 0);
    const transfer = Math.max(0, Number(appointment.transferAmount) || 0);
    if (cash > 0) {
      bucket.cashCount += 1;
      bucket.cashRevenue += cash;
    }
    if (transfer > 0) {
      bucket.transferCount += 1;
      bucket.transferRevenue += transfer;
    }
  } else if (method === "transfer") {
    bucket.transferCount += 1;
    bucket.transferRevenue += finalPrice;
  } else {
    bucket.cashCount += 1;
    bucket.cashRevenue += finalPrice;
  }
}

function sanitizeHistoryAppointment(appointment, servicePriceMap) {
  const fallbackPrice = servicePriceMap.get(
    String(appointment.service || "").trim().toLowerCase(),
  );
  const finalPrice = getEffectivePaidAmount(appointment, fallbackPrice);

  return {
    _id: String(appointment._id),
    startTime: appointment.startTime,
    customerName: appointment.customerName,
    service: appointment.service,
    barberName:
      appointment.barber && typeof appointment.barber === "object"
        ? appointment.barber.fullName
        : "Barbero eliminado",
    phone: String(appointment.notes || "").trim(),
    paymentMethod: getEffectivePaymentMethod(appointment),
    price: finalPrice,
    status: appointment.status,
  };
}

function sanitizeService(service) {
  return {
    _id: String(service._id),
    name: String(service.name || "").trim(),
    durationMinutes: Number(service.durationMinutes || 30),
    price: Number(service.price || 0),
    commissionPercent:
      service.commissionPercent == null ? null : Number(service.commissionPercent),
    sortOrder: Number(service.sortOrder || 0),
    isActive: Boolean(service.isActive ?? true),
  };
}

// --- CONTROLADORES ---

// LISTAR TURNOS (Para el admin/barbero)
export async function listAppointments(req, res, next) {
  try {
    const { date } = req.query;
    const { startOfDay, endOfDay } = buildDayRange(date);
    const ownerId = req.user.ownerId || req.user.id;

    const appointments = await AppointmentModel.find({
      owner: ownerId,
      status: { $in: ["pending", "completed"] },
      startTime: { $gte: startOfDay, $lte: endOfDay },
    })
      .populate({ path: "barber", select: "fullName" })
      .sort({ startTime: 1 })
      .lean();

    return res.json({ appointments });
  } catch (err) {
    return next(err);
  }
}

// CREAR TURNO (Público desde Web/App)
export async function createAppointment(req, res, next) {
  try {
    const ownerId = req.user?.ownerId || req.user?.id; // Puede ser undefined en reserva pública
    const {
      barberId,
      durationMinutes = 30,
      email,
      paymentMethod,
      servicePrice,
    } = req.body;
    
    const customerName = String(req.body?.customerName ?? "").trim();
    const service = String(req.body?.service ?? "").trim();
    const notes = String(req.body?.notes ?? "").trim();
    const startTime = req.body?.startTime ? new Date(req.body.startTime) : null;

    if (!barberId || !customerName || !service || !startTime) {
      return res.status(400).json({ error: "Datos obligatorios faltantes" });
    }

    const barber = await BarberModel.findById(barberId).lean();
    if (!barber) return res.status(404).json({ error: "Barbero no encontrado" });
    const ownerDoc = await UserModel.findById(ownerId)
      .select({ shopClosedDays: 1 })
      .lean();
    const shopClosure = resolveShopClosureForDate(ownerDoc, startTime);
    if (shopClosure) {
      return res.status(400).json({
        error: shopClosure.message,
        closedDay: serializeShopClosure(shopClosure),
      });
    }
    const barberClosure = resolveBarberClosureForDate(barber, startTime);
    if (barberClosure) {
      return res.status(400).json({
        error: barberClosure.message,
        closedDay: serializeBarberClosure(barberClosure),
      });
    }

    // 1. VALIDACIÓN DÍA LABORAL (usar horario local de la barbería)
    const dayOfWeek = getTimeZoneWeekday(startTime);
    const barberWorkDays = (barber.workDays || []).map(Number);
    
    if (barberWorkDays.length > 0 && !barberWorkDays.includes(dayOfWeek)) {
      return res.status(400).json({ error: "El barbero no trabaja este día." });
    }

    const finalOwnerId = ownerId || barber.owner;
    const normalizedPaymentMethod = normalizePaymentMethod(paymentMethod);
    const resolvedServicePrice = await resolveServicePrice({
      ownerId: finalOwnerId,
      serviceName: service,
      providedPrice: servicePrice,
    });
    const bufferAfterMinutes = Math.max(
      0,
      Number(barber?.bookingBufferMinutes || 0),
    );
    const endTime = new Date(startTime.getTime() + durationMinutes * 60000);
    const occupiedEndTime = getAppointmentOccupiedEnd(
      startTime,
      durationMinutes,
      bufferAfterMinutes,
    );
    const barberTimeBlocks = resolveBarberTimeBlocksForDate(barber, startTime);
    const startTimeLabel = getTimeZoneLabel(startTime).time;
    const [startHour, startMinute] = startTimeLabel.split(":").map(Number);
    const startMinutes = startHour * 60 + startMinute;
    const occupiedEndMinutes =
      startMinutes + Number(durationMinutes || 0) + bufferAfterMinutes;

    const overlappingBlock = barberTimeBlocks.find((block) =>
      doesTimeBlockOverlapRange(block, startMinutes, occupiedEndMinutes),
    );
    if (overlappingBlock) {
      return res.status(400).json({
        error: overlappingBlock.message,
        blockedTime: overlappingBlock,
      });
    }

    // 2. VALIDACIÓN SOLAPAMIENTO
    const overlappingCandidates = await AppointmentModel.find({
      barber: barberId,
      status: { $ne: "cancelled" },
      startTime: { $lt: occupiedEndTime },
    })
      .select({ startTime: 1, durationMinutes: 1, bufferAfterMinutesApplied: 1 })
      .lean();

    const isOverlapping = overlappingCandidates.some((existing) => {
      const existingStart = new Date(existing.startTime);
      const existingEnd = getAppointmentOccupiedEnd(
        existingStart,
        existing.durationMinutes || 30,
        existing.bufferAfterMinutesApplied || 0,
      );
      return existingEnd > startTime;
    });

    if (isOverlapping) {
      return res.status(409).json({ error: "El horario ya está ocupado" });
    }

    // 3. GUARDAR EN BASE DE DATOS
    const appointment = await AppointmentModel.create({
      owner: finalOwnerId,
      shop: req.activeShopId || null,
      barber: barberId,
      customerName,
      service,
      startTime,
      durationMinutes,
      bufferAfterMinutesApplied: bufferAfterMinutes,
      servicePrice: resolvedServicePrice,
      amountTotal: resolvedServicePrice,
      amountPaid: 0,
      amountPending: resolvedServicePrice,
      notes,
      paymentMethod: normalizedPaymentMethod,
      paymentMethodCollected: null,
      paymentStatus: "unpaid",
      customerEmail: email || undefined,
    });

    // --- ENVIAR NOTIFICACIÓN PUSH AL BARBERO ---
    try {
      const [ownerUser, ownerPushTarget, barberPushTarget] = await Promise.all([
        UserModel.findById(finalOwnerId)
          .select({ notificationSettings: 1 })
          .lean(),
        resolveOwnerPushTarget({ ownerId: finalOwnerId }),
        resolveAssignedBarberPushTarget({
          ownerId: finalOwnerId,
          barberId,
        }),
      ]);
      const ownerToken =
        ownerUser?.notificationSettings?.adminInstantBookingEnabled !== false
          ? String(ownerPushTarget?.token || "").trim()
          : "";
      const barberToken =
        ownerUser?.notificationSettings?.barberInstantBookingEnabled !== false
          ? String(barberPushTarget?.token || "").trim()
          : "";
      const targetTokens = Array.from(
        new Set([ownerToken, barberToken].filter(Boolean)),
      );

      if (targetTokens.length) {
        const timeZone = "America/Argentina/Cordoba";
        const timeLabel = startTime.toLocaleTimeString("es-AR", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
          timeZone,
        });
        const dateLabel = startTime.toLocaleDateString("es-AR", {
          weekday: "short",
          day: "2-digit",
          month: "2-digit",
          timeZone,
        });
        const payload = {
          notification: {
            title: "💈Nuevo turno confirmado",
            body: `${customerName} reservó ${service} con ${barber?.fullName || "tu barbero"} el ${dateLabel} a las ${timeLabel}.`,
          },
          android: {
            priority: "high",
            notification: { sound: "default" },
          },
          apns: {
            payload: { aps: { sound: "default" } },
          },
        };
        const responses = await Promise.all(
          targetTokens.map((token) => admin.messaging().send({ ...payload, token })),
        );
        console.log("Push enviado OK:", responses);
      }
    } catch (err) {
      logPushError("Push error:", err);
    }

    // --- ENVIAR EMAIL DE CONFIRMACIÓN AL CLIENTE ---
    if (email) {
      // Obtener datos del dueño para el nombre de la barbería
      const ownerUser = await UserModel.findById(finalOwnerId).lean();
      const shopName = ownerUser?.fullName || "Tu Barbería";

      const timeZone = "America/Argentina/Cordoba";
      const dateLabel = startTime.toLocaleDateString("es-AR", {
        weekday: "long",
        day: "numeric",
        month: "long",
        timeZone,
      });
      const timeLabel = startTime.toLocaleTimeString("es-AR", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone,
      });



      const mailHtml = `
    <div style="background-color: #121212; color: #ffffff; padding: 30px; font-family: sans-serif; border-radius: 15px; max-width: 500px; margin: auto; border: 1px solid #B89016;">
      
      <div style="text-align: center; margin-bottom: 25px;">
         <h2 style="color: #B89016; margin: 0; font-size: 24px; letter-spacing: 1px;">¡RESERVA EXITOSA!</h2>
         <p style="color: #888; font-size: 14px; margin-top: 10px;">Hola <strong>${customerName}</strong>, confirmamos tu cita en <b>${shopName}</b>:</p>
      </div>

     
        <p style="margin: 10px 0; color: #ccc; font-size: 15px;">
          <span style="color: #B89016; margin-right: 5px;">◈</span> <strong>Barbero:</strong> 
          <span style="color: #FF1493; font-weight: bold;">${barber.fullName}${barber.phone ? ` Telefono Barbero ${barber.phone}` : ''}</span>
        </p>
        <p style="margin: 10px 0; color: #ccc; font-size: 15px;">
          <span style="color: #B89016; margin-right: 5px;">◈</span> <strong>Servicio:</strong> 
          <span style="color: #FF1493; font-weight: bold;">${service}</span>
        </p>
        <p style="margin: 10px 0; color: #ccc; font-size: 15px;">
          <span style="color: #B89016; margin-right: 5px;">◈</span> <strong>Fecha:</strong> 
          <span style="color: #FF1493; font-weight: bold;">${dateLabel}</span>
        </p>
        <p style="margin: 10px 0; color: #ccc; font-size: 15px;">
          <span style="color: #B89016; margin-right: 5px;">◈</span> <strong>Hora:</strong> 
          <span style="color: #FF1493; font-weight: bold;">${timeLabel}</span>
        </p>
    

      <div style="text-align: center; margin-top: 16px;">

        ${barber.phone ? `
        <a href="https://wa.me/${barber.phone.replace(/\s+/g, '')}?text=Hola!%20Soy%20${customerName},%20te%20escribo%20por%20mi%20turno%20del%20dia%20${dateLabel}%20a%20las%20${timeLabel}%20para%20CANCELARLO" 
           style="background-color: #FF1493; color: white; padding: 12px 18px; text-decoration: none; border-radius: 8px; font-weight: 700; display: inline-block; font-size: 14px; border: 1px solid #ff4d4d; margin-bottom: 8px;">
           CONCELAR TURNO
        </a>
        ` : ''}
      </div>

      <div style="text-align: center; margin-top: 12px;">
        <p style="font-size: 9px; color: #444; letter-spacing: 3px; margin: 0; text-transform: uppercase;">
           POWERED BY CODEX® SYSTEM
        </p>
      </div>
    </div>
  `;

      try {
        await sendAppMail({
          to: email,
          subject: `✅ Turno Confirmado: ${service}`,
          html: mailHtml,
        });
        console.log("Email enviado con exito a:", email);
      } catch (mailErr) {
        console.error("Error enviando email de turno:", mailErr.message);
      }
    }

    return res.status(201).json({ appointment });
  } catch (err) {
    console.error("Error en createAppointment:", err);
    return next(err);
  }
}

export async function runAppointmentReminders(req, res, next) {
  try {
    if (!isReminderRunAuthorized(req)) {
      return res.status(401).json({ error: "No autorizado para ejecutar recordatorios." });
    }

    const result = await processAppointmentReminders();
    return res.json(result);
  } catch (err) {
    return next(err);
  }
}

export async function getAppointmentMetrics(req, res, next) {
  try {
    const ownerId = req.user.ownerId || req.user.id;
    const requestedBarberId = req.query.barberId ? String(req.query.barberId) : null;
    const barberId =
      req.user?.role === "barber"
        ? req.user?.barberId || null
        : requestedBarberId;
    const period = buildMetricsRange(req.query);

    const filter = {
      owner: ownerId,
      status: "completed",
      startTime: { $gte: period.start, $lt: period.end },
    };

    if (barberId) {
      if (!mongoose.Types.ObjectId.isValid(barberId)) {
        return res.status(400).json({ error: "Barbero inválido" });
      }

      if (
        req.user?.role === "barber" &&
        req.user?.barberId &&
        String(req.user.barberId) !== String(barberId)
      ) {
        return res.status(403).json({ error: "Solo podés ver tus métricas." });
      }

      filter.barber = barberId;
    }

    const [appointments, activeServices, barber, commissionBarbers] = await Promise.all([
      AppointmentModel.find(filter)
        .select({
          barber: 1,
          service: 1,
          servicePrice: 1,
          paymentMethod: 1,
          paymentMethodCollected: 1,
          paymentStatus: 1,
          amountTotal: 1,
          amountPaid: 1,
          cashAmount: 1,
          transferAmount: 1,
          startTime: 1,
        })
        .lean(),
      ServiceModel.find({ owner: ownerId })
        .select({ name: 1, price: 1, commissionPercent: 1 })
        .lean(),
      barberId
        ? BarberModel.findOne({ _id: barberId, owner: ownerId })
            .select({ fullName: 1 })
            .lean()
        : Promise.resolve(null),
      BarberModel.find({ owner: ownerId, isActive: true })
        .select({ _id: 1, commissionPercent: 1 })
        .lean(),
    ]);

    const servicePriceMap = new Map(
      activeServices.map((item) => [String(item.name || "").trim().toLowerCase(), Number(item.price || 0)]),
    );
    const commissionMaps = buildCommissionMaps(activeServices, commissionBarbers);

    const totals = createMetricsBucket();
    const monthlyMap = new Map();
    const monthly = [];

    if (period.mode === "annual") {
      for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
        const monthDate = new Date(period.year, monthIndex, 1, 0, 0, 0, 0);
        const entry = createMetricsBucket({
          key: `${period.year}-${String(monthIndex + 1).padStart(2, "0")}`,
          label: monthDate.toLocaleDateString("es-AR", {
            month: "short",
          }),
        });
        monthlyMap.set(entry.key, entry);
        monthly.push(entry);
      }
    }

    for (const appointment of appointments) {
      applyAppointmentMetrics(totals, appointment, servicePriceMap, commissionMaps);

      if (period.mode === "annual") {
        const date = new Date(appointment.startTime);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        const monthEntry = monthlyMap.get(key);
        if (monthEntry) {
          applyAppointmentMetrics(monthEntry, appointment, servicePriceMap, commissionMaps);
        }
      }
    }

    return res.json({
      barber: barber
        ? {
            _id: barber._id,
            fullName: barber.fullName,
          }
        : null,
      period: {
        mode: period.mode,
        key: period.key,
        label: period.label,
        year: period.year,
        month: period.month,
        from: period.start,
        to: new Date(period.end.getTime() - 1),
      },
      totals,
      monthly,
    });
  } catch (err) {
    return next(err);
  }
}

export async function getCurrentMonthOverview(req, res, next) {
  try {
    const ownerId = req.user.ownerId || req.user.id;
    const period = buildMetricsRange(req.query);

    const [appointments, activeServices, activeBarbers] = await Promise.all([
      AppointmentModel.find({
        owner: ownerId,
        status: "completed",
        startTime: { $gte: period.start, $lt: period.end },
      })
        .select({
          barber: 1,
          service: 1,
          servicePrice: 1,
          paymentMethod: 1,
          paymentMethodCollected: 1,
          paymentStatus: 1,
          amountTotal: 1,
          amountPaid: 1,
          cashAmount: 1,
          transferAmount: 1,
        })
        .lean(),
      ServiceModel.find({ owner: ownerId })
        .select({ name: 1, price: 1, commissionPercent: 1 })
        .lean(),
      BarberModel.find({ owner: ownerId, isActive: true })
        .select({ fullName: 1, commissionPercent: 1 })
        .sort({ fullName: 1 })
        .lean(),
    ]);

    const servicePriceMap = new Map(
      activeServices.map((item) => [String(item.name || "").trim().toLowerCase(), Number(item.price || 0)]),
    );
    const commissionMaps = buildCommissionMaps(activeServices, activeBarbers);

    const barberMap = new Map(
      activeBarbers.map((barber) => [
        String(barber._id),
        {
          barberId: String(barber._id),
          barberName: barber.fullName,
          ...createMetricsBucket(),
        },
      ]),
    );

    for (const appointment of appointments) {
      const barberId = String(appointment.barber || "");
      if (!barberMap.has(barberId)) {
        barberMap.set(barberId, {
          barberId,
          barberName: "Barbero eliminado",
          ...createMetricsBucket(),
        });
      }

      const entry = barberMap.get(barberId);
      applyAppointmentMetrics(entry, appointment, servicePriceMap, commissionMaps);
    }

    const byBarber = Array.from(barberMap.values()).sort((a, b) => {
      if (b.totalRevenue !== a.totalRevenue) return b.totalRevenue - a.totalRevenue;
      return b.appointmentsCount - a.appointmentsCount;
    });

    const totals = byBarber.reduce(
      (acc, item) => {
        acc.appointmentsCount += item.appointmentsCount;
        acc.totalRevenue += item.totalRevenue;
        acc.cashCount += item.cashCount;
        acc.cashRevenue += item.cashRevenue;
        acc.transferCount += item.transferCount;
        acc.transferRevenue += item.transferRevenue;
        acc.commission += item.commission;
        acc.localRevenue += item.localRevenue;
        return acc;
      },
      createMetricsBucket(),
    );

    return res.json({
      period: {
        mode: period.mode,
        key: period.key,
        label: period.label,
        year: period.year,
        month: period.month,
        from: period.start,
        to: new Date(period.end.getTime() - 1),
      },
      byBarber,
      totals,
    });
  } catch (err) {
    return next(err);
  }
}

export async function getCustomerHistory(req, res, next) {
  try {
    const ownerId = req.user.ownerId || req.user.id;
    const period = buildMetricsRange(req.query);
    const search = String(req.query.search ?? "").trim();
    const paymentMethod = String(req.query.paymentMethod ?? "").trim();
    const barberId = String(req.query.barberId ?? "").trim();

    const filter = {
      owner: ownerId,
      status: "completed",
      startTime: { $gte: period.start, $lt: period.end },
    };

    if (barberId) {
      if (!mongoose.Types.ObjectId.isValid(barberId)) {
        return res.status(400).json({ error: "Barbero inválido" });
      }
      filter.barber = barberId;
    }

    if (search) {
      const safePattern = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(safePattern, "i");
      filter.$or = [{ customerName: regex }, { notes: regex }, { service: regex }];
    }

    const [appointments, activeServices] = await Promise.all([
      AppointmentModel.find(filter)
        .populate({ path: "barber", select: "fullName" })
        .sort({ startTime: -1 })
        .limit(120)
        .lean(),
      ServiceModel.find({ owner: ownerId })
        .select({ name: 1, price: 1 })
        .lean(),
    ]);

    const servicePriceMap = new Map(
      activeServices.map((item) => [
        String(item.name || "").trim().toLowerCase(),
        Number(item.price || 0),
      ]),
    );

    let items = appointments.map(appointment =>
      sanitizeHistoryAppointment(appointment, servicePriceMap),
    );

    if (paymentMethod === "cash" || paymentMethod === "transfer") {
      items = items.filter(item => item.paymentMethod === paymentMethod);
    }

    const uniqueClients = new Set(
      items.map(item =>
        `${String(item.customerName || "").trim().toLowerCase()}|${String(item.phone || "").trim()}`,
      ),
    ).size;

    const totalRevenue = items.reduce((acc, item) => acc + Number(item.price || 0), 0);

    return res.json({
      period: {
        mode: period.mode,
        key: period.key,
        label: period.label,
        year: period.year,
        month: period.month,
        from: period.start,
        to: new Date(period.end.getTime() - 1),
      },
      summary: {
        servicesCount: items.length,
        uniqueClients,
        totalRevenue,
      },
      items,
    });
  } catch (err) {
    return next(err);
  }
}

export async function listCustomerContacts(req, res, next) {
  try {
    const ownerId = req.user.ownerId || req.user.id;
    const search = String(req.query.search ?? "").trim();
    const limit = Math.min(Math.max(Number(req.query.limit) || 300, 1), 800);

    const filter = {
      owner: ownerId,
      status: { $in: ["pending", "completed"] },
      notes: { $exists: true, $ne: "" },
    };

    if (search) {
      const safePattern = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(safePattern, "i");
      filter.$or = [{ customerName: regex }, { notes: regex }, { service: regex }];
    }

    const appointments = await AppointmentModel.find(filter)
      .select({ customerName: 1, notes: 1, startTime: 1, service: 1 })
      .sort({ startTime: -1 })
      .limit(limit)
      .lean();

    const contactsByPhone = new Map();

    appointments.forEach((appointment) => {
      const phone = String(appointment.notes || "").trim();
      const normalizedPhone = phone.replace(/[^\d+]/g, "");
      const digitsKey = normalizedPhone.replace(/\D/g, "");
      if (!digitsKey) return;

      const previous = contactsByPhone.get(digitsKey);
      if (previous) {
        previous.appointmentsCount += 1;
        return;
      }

      contactsByPhone.set(digitsKey, {
        id: digitsKey,
        customerName: String(appointment.customerName || "Cliente").trim() || "Cliente",
        phone,
        normalizedPhone,
        lastAppointmentAt: appointment.startTime,
        lastService: appointment.service || "",
        appointmentsCount: 1,
      });
    });

    return res.json({
      contacts: Array.from(contactsByPhone.values()),
    });
  } catch (err) {
    return next(err);
  }
}

// ACTUALIZAR ESTADO (pending, completed, cancelled)
export async function updateAppointmentStatus(req, res, next) {
  try {
    const ownerId = req.user.ownerId || req.user.id;
    const { appointmentId } = req.params;
    const {
      status,
      paymentMethodCollected,
      paymentStatus,
      amountPaid,
      cashAmount,
      transferAmount,
    } = req.body;

    if (!["awaiting_payment", "pending", "completed", "cancelled"].includes(status)) {
      return res.status(400).json({ error: "Estado inválido" });
    }

    const appointmentDoc = await AppointmentModel.findOne({
      _id: appointmentId,
      owner: ownerId,
    });

    if (!appointmentDoc) {
      return res.status(404).json({ error: "Turno no encontrado" });
    }

    if (
      req.user.role === "barber" &&
      String(appointmentDoc.barber || "") !== String(req.user.barberId || "")
    ) {
      return res.status(403).json({ error: "No autorizado para modificar este turno." });
    }

    appointmentDoc.status = status;

    if (status === "completed") {
      const total = Number(
        appointmentDoc.amountTotal ??
          appointmentDoc.servicePrice ??
          0,
      );
      const normalizedStatus = paymentStatus
        ? normalizePaymentStatus(paymentStatus)
        : "paid";
      const normalizedCollectedMethod =
        normalizedStatus === "paid" || normalizedStatus === "partial"
          ? normalizeCollectedPaymentMethod(paymentMethodCollected) ??
            normalizePaymentMethod(appointmentDoc.paymentMethod)
          : null;
      const parsedAmountPaid = Number(amountPaid);
      const safeAmountPaid =
        normalizedStatus === "paid" || normalizedStatus === "partial"
          ? Number.isFinite(parsedAmountPaid)
            ? Math.max(0, parsedAmountPaid)
            : total
          : 0;

      appointmentDoc.paymentMethodCollected = normalizedCollectedMethod;
      appointmentDoc.paymentStatus = normalizedStatus;
      appointmentDoc.amountTotal = total;
      appointmentDoc.amountPaid = safeAmountPaid;
      appointmentDoc.amountPending =
        normalizedStatus === "paid"
          ? Math.max(0, total - safeAmountPaid)
          : Math.max(0, total - safeAmountPaid);

      // Desglose del pago mixto (efectivo + transferencia).
      if (normalizedCollectedMethod === "mixed") {
        appointmentDoc.cashAmount = Math.max(0, Number(cashAmount) || 0);
        appointmentDoc.transferAmount = Math.max(0, Number(transferAmount) || 0);
      } else {
        appointmentDoc.cashAmount = 0;
        appointmentDoc.transferAmount = 0;
      }
    }

    await appointmentDoc.save();

    const appointment = appointmentDoc.toObject();

    return res.json({ appointment });
  } catch (err) {
    return next(err);
  }
}

// LISTAR SERVICIOS
export async function listServices(req, res, next) {
  try {
    const ownerId = req.user.ownerId || req.user.id;
    const services = await ServiceModel.find({
      owner: ownerId,
      isActive: true,
    })
      .sort({ sortOrder: 1, name: 1, _id: 1 })
      .lean();
    return res.json({ services: services.map(sanitizeService) });
  } catch (err) {
    return next(err);
  }
}

export async function createService(req, res, next) {
  try {
    const ownerId = req.user.id;
    const name = String(req.body?.name ?? "").trim();
    const durationMinutes = Number(req.body?.durationMinutes ?? 30);
    const price = Number(req.body?.price ?? 0);

    if (!name) {
      return res.status(400).json({ error: "El nombre del servicio es obligatorio" });
    }

    if (!Number.isFinite(durationMinutes) || durationMinutes < 10 || durationMinutes > 480) {
      return res.status(400).json({ error: "La duración del servicio no es válida" });
    }

    if (!Number.isFinite(price) || price < 0) {
      return res.status(400).json({ error: "El precio del servicio no es válido" });
    }

    const existing = await ServiceModel.findOne({
      owner: ownerId,
      isActive: true,
      name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
    }).lean();

    if (existing) {
      return res.status(409).json({ error: "Ya existe un servicio con ese nombre" });
    }

    const lastService = await ServiceModel.findOne({
      owner: ownerId,
      isActive: true,
    })
      .sort({ sortOrder: -1, createdAt: -1, _id: -1 })
      .select({ sortOrder: 1 })
      .lean();

    const service = await ServiceModel.create({
      owner: ownerId,
      name,
      durationMinutes,
      price,
      commissionPercent: normalizeServiceCommission(req.body?.commissionPercent),
      sortOrder: Number(lastService?.sortOrder || 0) + 1,
      isActive: true,
    });

    return res.status(201).json({ service: sanitizeService(service) });
  } catch (err) {
    return next(err);
  }
}

export async function updateService(req, res, next) {
  try {
    const ownerId = req.user.id;
    const { serviceId } = req.params;
    const name = String(req.body?.name ?? "").trim();
    const durationMinutes = Number(req.body?.durationMinutes ?? 30);
    const price = Number(req.body?.price ?? 0);

    if (!mongoose.Types.ObjectId.isValid(serviceId)) {
      return res.status(400).json({ error: "Servicio inválido" });
    }

    if (!name) {
      return res.status(400).json({ error: "El nombre del servicio es obligatorio" });
    }

    if (!Number.isFinite(durationMinutes) || durationMinutes < 10 || durationMinutes > 480) {
      return res.status(400).json({ error: "La duración del servicio no es válida" });
    }

    if (!Number.isFinite(price) || price < 0) {
      return res.status(400).json({ error: "El precio del servicio no es válido" });
    }

    const existing = await ServiceModel.findOne({
      owner: ownerId,
      isActive: true,
      _id: { $ne: serviceId },
      name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
    }).lean();

    if (existing) {
      return res.status(409).json({ error: "Ya existe otro servicio con ese nombre" });
    }

    const service = await ServiceModel.findOneAndUpdate(
      { _id: serviceId, owner: ownerId, isActive: true },
      {
        name,
        durationMinutes,
        price,
        commissionPercent: normalizeServiceCommission(req.body?.commissionPercent),
      },
      { new: true },
    ).lean();

    if (!service) {
      return res.status(404).json({ error: "Servicio no encontrado" });
    }

    return res.json({ service: sanitizeService(service) });
  } catch (err) {
    return next(err);
  }
}

export async function deleteService(req, res, next) {
  try {
    const ownerId = req.user.id;
    const { serviceId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(serviceId)) {
      return res.status(400).json({ error: "Servicio inválido" });
    }

    const service = await ServiceModel.findOneAndUpdate(
      { _id: serviceId, owner: ownerId, isActive: true },
      { isActive: false },
      { new: true },
    ).lean();

    if (!service) {
      return res.status(404).json({ error: "Servicio no encontrado" });
    }

    return res.json({ service: sanitizeService(service) });
  } catch (err) {
    return next(err);
  }
}

export async function reorderServices(req, res, next) {
  try {
    const ownerId = req.user.ownerId || req.user.id;
    const serviceIds = Array.isArray(req.body?.serviceIds) ? req.body.serviceIds : [];
    const normalizedIds = serviceIds.map((id) => String(id || "").trim());

    if (!normalizedIds.length || normalizedIds.some((id) => !mongoose.Types.ObjectId.isValid(id))) {
      return res.status(400).json({ error: "El orden de servicios no es válido." });
    }

    if (new Set(normalizedIds).size !== normalizedIds.length) {
      return res.status(400).json({ error: "El orden contiene servicios duplicados." });
    }

    const services = await ServiceModel.find({
      owner: ownerId,
      isActive: true,
    })
      .select({ _id: 1 })
      .lean();
    const activeServiceIds = services.map((service) => String(service._id));

    if (
      activeServiceIds.length !== normalizedIds.length ||
      activeServiceIds.some((id) => !normalizedIds.includes(id))
    ) {
      return res.status(400).json({
        error: "El orden recibido no coincide con los servicios activos.",
      });
    }

    await ServiceModel.bulkWrite(
      normalizedIds.map((serviceId, index) => ({
        updateOne: {
          filter: { _id: serviceId, owner: ownerId, isActive: true },
          update: { $set: { sortOrder: index + 1 } },
        },
      })),
      { ordered: true },
    );

    const reorderedServices = await ServiceModel.find({
      owner: ownerId,
      isActive: true,
    })
      .sort({ sortOrder: 1, name: 1, _id: 1 })
      .lean();

    return res.json({
      message: "Orden de servicios guardado correctamente.",
      services: reorderedServices.map(sanitizeService),
    });
  } catch (err) {
    return next(err);
  }
}

// ELIMINAR TURNO
export async function deleteAppointment(req, res, next) {
  try {
    const { appointmentId } = req.params;

    const appointment = await AppointmentModel.findById(appointmentId);
    if (!appointment) return res.status(404).json({ error: "Turno no encontrado" });

    if (
      req.user.role === "barber" &&
      String(appointment.barber || "") !== String(req.user.barberId || "")
    ) {
      return res.status(403).json({ error: "No autorizado para borrar este turno." });
    }

    // Autorización básica: solo el dueño del turno o un admin puede borrarlo
    if (
      appointment.owner &&
      appointment.owner.toString() !== String(req.user.ownerId || req.user.id) &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({ error: "No autorizado para borrar este turno" });
    }

    await appointment.deleteOne();

    return res.json({ success: true });
  } catch (err) {
    return next(err);
  }
}

// ──────────────────────────────────────────────────────────────────────────
// CAJA (movimientos de ingreso/egreso + resumen)
// ──────────────────────────────────────────────────────────────────────────

function serializePeriod(period) {
  return {
    mode: period.mode,
    key: period.key,
    label: period.label,
    year: period.year,
    month: period.month ?? null,
    from: period.start,
    to: period.end,
  };
}

function serializeCashEntry(doc) {
  return {
    _id: String(doc._id),
    type: doc.type,
    amount: Number(doc.amount || 0),
    description: doc.description || "",
    category: doc.category || "",
    date: doc.date,
  };
}

function buildCashEntryFilter(req, period) {
  const ownerId = req.user.ownerId || req.user.id;
  return {
    owner: ownerId,
    ...(req.activeShopId ? { shop: req.activeShopId } : {}),
    date: { $gte: period.start, $lt: period.end },
  };
}

export async function createCashEntry(req, res, next) {
  try {
    const ownerId = req.user.ownerId || req.user.id;
    const type = String(req.body?.type || "").trim().toLowerCase();
    if (!["income", "expense"].includes(type)) {
      return res.status(400).json({ error: "El tipo debe ser income (ingreso) o expense (egreso)." });
    }

    const amount = Number(req.body?.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: "El monto debe ser un número mayor a 0." });
    }

    const description = String(req.body?.description || "").trim().slice(0, 200);
    const category = String(req.body?.category || "").trim().slice(0, 60);
    const date = req.body?.date ? new Date(req.body.date) : new Date();
    if (Number.isNaN(date.getTime())) {
      return res.status(400).json({ error: "La fecha no es válida." });
    }

    const entry = await CashEntryModel.create({
      owner: ownerId,
      shop: req.activeShopId || null,
      type,
      amount: Number(amount.toFixed(2)),
      description,
      category,
      date,
      createdBy: req.user.id || null,
    });

    return res.status(201).json({ entry: serializeCashEntry(entry) });
  } catch (err) {
    return next(err);
  }
}

export async function listCashEntries(req, res, next) {
  try {
    const period = buildMetricsRange(req.query);
    const filter = buildCashEntryFilter(req, period);
    const typeFilter = String(req.query.type || "").trim().toLowerCase();
    if (["income", "expense"].includes(typeFilter)) {
      filter.type = typeFilter;
    }

    const entries = await CashEntryModel.find(filter)
      .sort({ date: -1, createdAt: -1 })
      .lean();

    return res.json({
      period: serializePeriod(period),
      entries: entries.map(serializeCashEntry),
    });
  } catch (err) {
    return next(err);
  }
}

export async function updateCashEntry(req, res, next) {
  try {
    const ownerId = req.user.ownerId || req.user.id;
    const id = String(req.params?.id || "");
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Movimiento inválido." });
    }

    const entry = await CashEntryModel.findOne({
      _id: id,
      owner: ownerId,
      ...(req.activeShopId ? { shop: req.activeShopId } : {}),
    });

    if (!entry) {
      return res.status(404).json({ error: "No encontramos ese movimiento." });
    }

    if (req.body?.type !== undefined) {
      const type = String(req.body.type || "").trim().toLowerCase();
      if (!["income", "expense"].includes(type)) {
        return res.status(400).json({ error: "El tipo debe ser income (ingreso) o expense (egreso)." });
      }
      entry.type = type;
    }

    if (req.body?.amount !== undefined) {
      const amount = Number(req.body.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ error: "El monto debe ser un número mayor a 0." });
      }
      entry.amount = Number(amount.toFixed(2));
    }

    if (req.body?.description !== undefined) {
      entry.description = String(req.body.description || "").trim().slice(0, 200);
    }

    if (req.body?.category !== undefined) {
      entry.category = String(req.body.category || "").trim().slice(0, 60);
    }

    if (req.body?.date !== undefined) {
      const date = req.body.date ? new Date(req.body.date) : new Date();
      if (Number.isNaN(date.getTime())) {
        return res.status(400).json({ error: "La fecha no es válida." });
      }
      entry.date = date;
    }

    await entry.save();

    return res.json({ entry: serializeCashEntry(entry) });
  } catch (err) {
    return next(err);
  }
}

export async function deleteCashEntry(req, res, next) {
  try {
    const ownerId = req.user.ownerId || req.user.id;
    const id = String(req.params?.id || "");
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Movimiento inválido." });
    }

    const deleted = await CashEntryModel.findOneAndDelete({
      _id: id,
      owner: ownerId,
      ...(req.activeShopId ? { shop: req.activeShopId } : {}),
    });

    if (!deleted) {
      return res.status(404).json({ error: "No encontramos ese movimiento." });
    }

    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
}

// Resumen de caja del período: ingresos por servicios (turnos completados) +
// ingresos/egresos manuales, descontando las comisiones de los profesionales.
// profit = ingresos − egresos − comisiones.
export async function getCashSummary(req, res, next) {
  try {
    const ownerId = req.user.ownerId || req.user.id;
    const period = buildMetricsRange(req.query);

    const appointmentFilter = {
      owner: ownerId,
      ...(req.activeShopId ? { shop: req.activeShopId } : {}),
      status: "completed",
      startTime: { $gte: period.start, $lt: period.end },
    };

    const [appointments, activeServices, commissionBarbers, cashEntries] = await Promise.all([
      AppointmentModel.find(appointmentFilter)
        .select({
          barber: 1,
          service: 1,
          servicePrice: 1,
          amountPaid: 1,
          amountTotal: 1,
          paymentStatus: 1,
        })
        .lean(),
      ServiceModel.find(applyShopScope({ owner: ownerId }, req))
        .select({ name: 1, price: 1, commissionPercent: 1 })
        .lean(),
      BarberModel.find(applyShopScope({ owner: ownerId, isActive: true }, req))
        .select({ _id: 1, commissionPercent: 1 })
        .lean(),
      CashEntryModel.find(buildCashEntryFilter(req, period)).lean(),
    ]);

    const servicePriceMap = new Map(
      activeServices.map((item) => [
        String(item.name || "").trim().toLowerCase(),
        Number(item.price || 0),
      ]),
    );
    const commissionMaps = buildCommissionMaps(activeServices, commissionBarbers);

    let serviceIncome = 0;
    let commissions = 0;
    for (const appointment of appointments) {
      const fallback = servicePriceMap.get(
        String(appointment.service || "").trim().toLowerCase(),
      );
      const paid = getEffectivePaidAmount(appointment, fallback);
      serviceIncome += paid;
      const pct = resolveCommissionPercent(appointment, commissionMaps);
      if (pct > 0) commissions += (paid * pct) / 100;
    }

    let manualIncome = 0;
    let expenses = 0;
    for (const entry of cashEntries) {
      if (entry.type === "income") manualIncome += Number(entry.amount || 0);
      else if (entry.type === "expense") expenses += Number(entry.amount || 0);
    }

    commissions = Number(commissions.toFixed(2));
    const totalIncome = Number((serviceIncome + manualIncome).toFixed(2));
    const localServiceIncome = Number((serviceIncome - commissions).toFixed(2));
    const profit = Number((totalIncome - expenses - commissions).toFixed(2));

    return res.json({
      period: serializePeriod(period),
      serviceIncome: Number(serviceIncome.toFixed(2)),
      localServiceIncome,
      commissions,
      manualIncome: Number(manualIncome.toFixed(2)),
      totalIncome,
      expenses: Number(expenses.toFixed(2)),
      profit,
      servicesCount: appointments.length,
      entriesCount: cashEntries.length,
    });
  } catch (err) {
    return next(err);
  }
}
