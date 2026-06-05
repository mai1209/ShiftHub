import { Schema, model } from "mongoose";

// Producto del local para el POS interno (venta de productos físicos).
const productSchema = new Schema(
  {
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true },
    shop: { type: Schema.Types.ObjectId, ref: "Shop", default: null },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    price: { type: Number, required: true, min: 0 },
    stock: { type: Number, default: 0, min: 0 },
    photoUrl: { type: String, default: "", trim: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

productSchema.index({ owner: 1, shop: 1, isActive: 1 });

export const ProductModel = model("Product", productSchema);
