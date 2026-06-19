import { Schema, model } from "mongoose";

// "Tarjeta" de membresía configurable por el local (máx. 4 activas).
// Define cuántos turnos gratis da, su duración y el precio que entra a la caja.
const membershipPlanSchema = new Schema(
  {
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    shop: { type: Schema.Types.ObjectId, ref: "Shop", default: null },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    color: { type: String, default: "#2FAA1F", trim: true, maxlength: 20 },
    freeTurns: { type: Number, required: true, min: 1, max: 100 },
    durationDays: { type: Number, default: 0, min: 0 }, // 0 = sin límite de tiempo
    giftText: { type: String, default: "", trim: true, maxlength: 120 },
    priceArs: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

membershipPlanSchema.index({ owner: 1, shop: 1, isActive: 1 });

export const MembershipPlanModel = model("MembershipPlan", membershipPlanSchema);
