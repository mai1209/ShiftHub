import { Schema, model } from "mongoose";

const shopSchema = new Schema({
  owner: { type: Schema.Types.ObjectId, ref: "User", required: true },
  name: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  description: { type: String },
  address: { type: String },
  phone: { type: String },
  isDefault: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

shopSchema.index({ owner: 1, isActive: 1, createdAt: 1 });

export const ShopModel = model("Shop", shopSchema);