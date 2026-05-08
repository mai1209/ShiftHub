import { Schema, model } from "mongoose";

const shopSchema = new Schema({
  owner: { type: Schema.Types.ObjectId, ref: "User", required: true },
  name: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  description: { type: String },
  address: { type: String },
  phone: { type: String },
}, { timestamps: true });

export const ShopModel = model("Shop", shopSchema);