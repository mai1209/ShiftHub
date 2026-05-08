import mongoose from "mongoose";

const planPricingSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: "default",
    },
    basicPriceArs: {
      type: Number,
      default: 25000,
      min: 0,
    },
    basicPriceUsdReference: {
      type: Number,
      default: 25,
      min: 0,
    },
    proPriceArs: {
      type: Number,
      default: 35000,
      min: 0,
    },
    proPriceUsdReference: {
      type: Number,
      default: 35,
      min: 0,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

export const PlanPricingModel =
  mongoose.models.PlanPricing ?? mongoose.model("PlanPricing", planPricingSchema);
