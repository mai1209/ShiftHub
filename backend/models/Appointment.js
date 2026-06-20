import mongoose from "mongoose";

const appointmentSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // Local/sucursal (multi-local). Opcional para compatibilidad con datos previos.
    shop: {
      type: mongoose.Types.ObjectId,
      ref: "Shop",
      default: null,
      index: true,
    },
    barber: {
      type: mongoose.Types.ObjectId,
      ref: "Barber",
      required: true,
      index: true,
    },
    customerName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    customerEmail: {
      type: String,
      trim: true,
      lowercase: true,
      default: null,
    },
    service: {
      type: String,
      required: true,
      trim: true,
    },
    serviceItems: {
      type: [
        {
          serviceId: {
            type: mongoose.Types.ObjectId,
            ref: "Service",
            required: true,
          },
          name: {
            type: String,
            required: true,
            trim: true,
          },
          durationMinutes: {
            type: Number,
            required: true,
            min: 10,
            max: 480,
          },
          price: {
            type: Number,
            required: true,
            min: 0,
          },
        },
      ],
      default: [],
    },
    startTime: {
      type: Date,
      required: true,
      index: true,
    },
    durationMinutes: {
      type: Number,
      default: 30,
      min: 15,
      max: 480,
    },
    bufferAfterMinutesApplied: {
      type: Number,
      default: 0,
      min: 0,
      max: 120,
    },
    membershipId: {
      type: mongoose.Types.ObjectId,
      ref: "Membership",
      default: null,
    },
    // Servicio cargado por "orden de llegada": ya ocurrió, no ocupa un horario
    // en la agenda ni participa de la validación de solapamiento.
    walkIn: {
      type: Boolean,
      default: false,
    },
    servicePrice: {
      type: Number,
      default: 0,
      min: 0,
    },
    originalServicePrice: {
      type: Number,
      default: 0,
      min: 0,
    },
    couponCode: {
      type: String,
      trim: true,
      default: null,
    },
    couponName: {
      type: String,
      trim: true,
      default: null,
    },
    couponDiscountAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    paymentMethod: {
      type: String,
      enum: ["cash", "transfer"],
      default: "cash",
    },
    paymentMethodCollected: {
      type: String,
      enum: ["cash", "transfer", "mixed", null],
      default: null,
    },
    cashAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    transferAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    paymentStatus: {
      type: String,
      enum: ["unpaid", "partial", "paid", "refunded"],
      default: "unpaid",
    },
    amountTotal: {
      type: Number,
      default: 0,
      min: 0,
    },
    amountPaid: {
      type: Number,
      default: 0,
      min: 0,
    },
    amountPending: {
      type: Number,
      default: 0,
      min: 0,
    },
    mercadoPagoPreferenceId: {
      type: String,
      default: null,
    },
    mercadoPagoPaymentId: {
      type: String,
      default: null,
    },
    mercadoPagoMerchantOrderId: {
      type: String,
      default: null,
    },
    mercadoPagoExternalReference: {
      type: String,
      default: null,
    },
    paymentDeadlineAt: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ["awaiting_payment", "pending", "completed", "cancelled"],
      default: "pending",
    },
    barberReminderSentAt: {
      type: Date,
      default: null,
    },
    customerReminderSentAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

appointmentSchema.index({ owner: 1, barber: 1, startTime: 1 });
appointmentSchema.index({ owner: 1, status: 1, startTime: 1 });

export const AppointmentModel =
  mongoose.models.Appointment ??
  mongoose.model("Appointment", appointmentSchema);
