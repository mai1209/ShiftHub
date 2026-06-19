import { Schema, model } from "mongoose";

// Cliente inscripto a una membresía. Vence por LO QUE PASE PRIMERO:
// se queda sin turnos (depleted) o se vence por tiempo (expired).
const membershipSchema = new Schema(
  {
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    shop: { type: Schema.Types.ObjectId, ref: "Shop", default: null },
    plan: { type: Schema.Types.ObjectId, ref: "MembershipPlan", default: null },
    planName: { type: String, default: "", trim: true, maxlength: 60 }, // snapshot
    customerName: { type: String, required: true, trim: true, maxlength: 120 },
    customerEmail: { type: String, default: "", trim: true, lowercase: true, maxlength: 160 },
    turnsTotal: { type: Number, required: true, min: 0 },
    turnsUsed: { type: Number, default: 0, min: 0 },
    startedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, default: null }, // null = sin límite de tiempo
    pricePaidArs: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: ["active", "expired", "depleted", "cancelled"],
      default: "active",
    },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

membershipSchema.index({ owner: 1, shop: 1, customerEmail: 1, status: 1 });

export const MembershipModel = model("Membership", membershipSchema);
