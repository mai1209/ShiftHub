import { PlanPricingModel } from "../models/PlanPricing.js";

const DEFAULT_PRICING_VALUES = {
  basicPriceArs: 25000,
  basicPriceUsdReference: 25,
  proPriceArs: 35000,
  proPriceUsdReference: 35,
  additionalBusinessPriceArs: 10000,
  additionalBusinessPriceUsdReference: 10,
};

export function serializePlanPricing(doc) {
  const source = doc?.toObject?.() ?? doc ?? {};
  return {
    basic: {
      ars: Number(source.basicPriceArs ?? DEFAULT_PRICING_VALUES.basicPriceArs),
      usdReference: Number(
        source.basicPriceUsdReference ?? DEFAULT_PRICING_VALUES.basicPriceUsdReference,
      ),
    },
    pro: {
      ars: Number(source.proPriceArs ?? DEFAULT_PRICING_VALUES.proPriceArs),
      usdReference: Number(
        source.proPriceUsdReference ?? DEFAULT_PRICING_VALUES.proPriceUsdReference,
      ),
    },
    custom: {
      ars: null,
      usdReference: null,
    },
    additionalBusiness: {
      ars: Number(
        source.additionalBusinessPriceArs ??
          DEFAULT_PRICING_VALUES.additionalBusinessPriceArs,
      ),
      usdReference: Number(
        source.additionalBusinessPriceUsdReference ??
          DEFAULT_PRICING_VALUES.additionalBusinessPriceUsdReference,
      ),
    },
    updatedAt: source.updatedAt ?? null,
  };
}

export async function getOrCreatePlanPricing() {
  const doc = await PlanPricingModel.findOneAndUpdate(
    { key: "default" },
    {
      $setOnInsert: {
        key: "default",
        ...DEFAULT_PRICING_VALUES,
      },
    },
    {
      upsert: true,
      new: true,
    },
  );

  return doc;
}
