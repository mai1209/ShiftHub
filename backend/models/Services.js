import { Schema, model } from "mongoose";

const ServiceSchema = new Schema({
  owner: { type: Schema.Types.ObjectId, ref: "User", required: true },
  // Local/sucursal (multi-local). Opcional para compatibilidad con datos previos.
  shop: { type: Schema.Types.ObjectId, ref: "Shop", default: null, index: true },
  name: { type: String, required: true },
  durationMinutes: { type: Number, required: true, default: 30 },
  price: { type: Number, default: 0 },
  // Comisión por servicio (%). Si está seteada, tiene prioridad sobre la del
  // profesional. null = usa la comisión del profesional.
  commissionPercent: { type: Number, default: null, min: 0, max: 100 },
  sortOrder: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
});

ServiceSchema.index({ owner: 1, isActive: 1, sortOrder: 1, name: 1 });

export const ServiceModel = model("Service", ServiceSchema);
