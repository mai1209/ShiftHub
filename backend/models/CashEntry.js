import { Schema, model } from "mongoose";

// Movimiento de caja del negocio: ingreso manual (ej. venta de producto) o
// egreso (gasto). Los ingresos por servicios NO se guardan acá; se calculan
// desde los turnos completados.
const cashEntrySchema = new Schema(
  {
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true },
    shop: { type: Schema.Types.ObjectId, ref: "Shop", default: null },
    type: { type: String, enum: ["income", "expense"], required: true },
    amount: { type: Number, required: true, min: 0 },
    description: { type: String, default: "", trim: true, maxlength: 200 },
    category: { type: String, default: "", trim: true, maxlength: 60 },
    date: { type: Date, default: Date.now },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

cashEntrySchema.index({ owner: 1, shop: 1, date: 1 });
cashEntrySchema.index({ owner: 1, type: 1, date: 1 });

export const CashEntryModel = model("CashEntry", cashEntrySchema);
