import mongoose from "mongoose";

const barberSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 120,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    photoUrl: {
      type: String,
      trim: true,
      default: null,
    },
       // ← AGREGAR ESTE CAMPO
    scheduleRange: {
      type: String,
      trim: true,
      default: null,
    },
    scheduleRanges: {
      type: [
        {
          label: { type: String }, // "mañana" o "tarde"
          start: { type: String },
          end: { type: String },
        },
      ],
      default: [],
    },
    dayScheduleOverrides: {
      type: [
        {
          day: { type: Number, min: 0, max: 6 },
          validFrom: { type: String, default: null },
          useBase: { type: Boolean, default: false },
          scheduleRange: { type: String, default: null },
          scheduleRanges: {
            type: [
              {
                label: { type: String },
                start: { type: String },
                end: { type: String },
              },
            ],
            default: [],
          },
        },
      ],
      default: [],
    },
    bookingBufferMinutes: {
      type: Number,
      default: 0,
      min: 0,
      max: 120,
    },
    barberTimeBlocks: {
      type: [
        {
          date: { type: String, required: true },
          start: { type: String, required: true },
          end: { type: String, required: true },
          message: { type: String, default: null },
        },
      ],
      default: [],
    },
    barberClosedDays: {
      type: [
        {
          date: { type: String, required: true },
          message: { type: String, default: null },
        },
      ],
      default: [],
    },
    shift: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    workDays: {
      type: [Number], // 0 para Domingo, 1 para Lunes, etc.
      default: [1, 2, 3, 4, 5, 6], // Por defecto Lunes a Sábado
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

barberSchema.index({ owner: 1, isActive: 1, createdAt: 1 });

export const BarberModel =
  mongoose.models.Barber ?? mongoose.model("Barber", barberSchema);
