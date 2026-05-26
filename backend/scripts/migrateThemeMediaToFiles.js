import "dotenv/config";
import mongoose from "mongoose";
import { connectMongo } from "../database/connectMongo.js";
import { UserModel } from "../models/User.js";
import { isImageDataUrl, persistThemeMediaUpdates } from "../utils/publicMedia.js";

const slug = String(process.argv[2] || "").trim().toLowerCase();
const mediaFields = ["logoDataUrl", "bannerDataUrl", "mobileBannerDataUrl"];

function buildQuery() {
  const baseQuery = {
    $or: mediaFields.map((field) => ({
      [`themeConfig.${field}`]: /^data:image\/[a-zA-Z0-9.+-]+;base64,/,
    })),
  };

  if (!slug) return baseQuery;
  return { ...baseQuery, shopSlug: slug };
}

await connectMongo();

const users = await UserModel.find(buildQuery()).select({
  shopSlug: 1,
  themeConfig: 1,
});

let migratedUsers = 0;
let migratedImages = 0;

for (const user of users) {
  const currentTheme = user.themeConfig?.toObject?.() ?? user.themeConfig ?? {};
  const updates = {};

  for (const field of mediaFields) {
    const value = currentTheme[field];
    if (isImageDataUrl(value)) {
      updates[field] = value;
    }
  }

  if (!Object.keys(updates).length) continue;

  const persistedUpdates = await persistThemeMediaUpdates({
    ownerId: user._id,
    updates,
  });

  user.themeConfig = {
    ...currentTheme,
    ...persistedUpdates,
  };

  await user.save();
  migratedUsers += 1;
  migratedImages += Object.keys(persistedUpdates).length;
  console.log(`Migrado ${user.shopSlug || user._id}: ${Object.keys(persistedUpdates).join(", ")}`);
}

console.log(
  JSON.stringify(
    {
      slug: slug || null,
      migratedUsers,
      migratedImages,
      note:
        "En producción, este script debe correrse en el servidor donde van a vivir backend/uploads.",
    },
    null,
    2,
  ),
);

await mongoose.disconnect();
