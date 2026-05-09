
import mongoose from "mongoose";
import {
  BUSINESS_TYPE_VALUES,
  DEFAULT_BUSINESS_TYPE,
} from "../utils/businessTypes.js";

const themeConfigSchema = new mongoose.Schema(
  {
    mode: { type: String, enum: ["dark", "light"], default: null },
    webPreset: {
      type: String,
      enum: ["dark", "light", "vintage"],
      default: null,
    },
    primary: { type: String, trim: true, default: null },
    secondary: { type: String, trim: true, default: null },
    card: { type: String, trim: true, default: null },
    gradientColors: {
      type: [String],
      default: [],
    },
    logoDataUrl: { type: String, default: null },
    bannerDataUrl: { type: String, default: null },
    mobileBannerDataUrl: { type: String, default: null },
  },
  {
    _id: false,
  },
);

const paymentSettingsSchema = new mongoose.Schema(
  {
    cashEnabled: { type: Boolean, default: true },
    advancePaymentEnabled: { type: Boolean, default: false },
    advanceMode: {
      type: String,
      enum: ["deposit", "full"],
      default: "deposit",
    },
    advanceType: {
      type: String,
      enum: ["percent", "fixed"],
      default: "percent",
    },
    advanceValue: { type: Number, default: 30, min: 0 },
    mercadoPagoConnectionStatus: {
      type: String,
      enum: ["disconnected", "pending", "connected"],
      default: "disconnected",
    },
    mercadoPagoSellerId: { type: String, default: null },
    mercadoPagoPublicKey: { type: String, default: null },
  },
  {
    _id: false,
  },
);

const mercadoPagoAuthSchema = new mongoose.Schema(
  {
    accessToken: { type: String, default: null },
    refreshToken: { type: String, default: null },
    userId: { type: String, default: null },
    publicKey: { type: String, default: null },
    scope: { type: String, default: null },
    expiresAt: { type: Date, default: null },
    linkedAt: { type: Date, default: null },
    lastRefreshAt: { type: Date, default: null },
  },
  {
    _id: false,
  },
);

const notificationSettingsSchema = new mongoose.Schema(
  {
    adminInstantBookingEnabled: { type: Boolean, default: true },
    barberInstantBookingEnabled: { type: Boolean, default: true },
    barberReminderEnabled: { type: Boolean, default: true },
    barberReminderMinutesBefore: {
      type: Number,
      enum: [15, 30, 60, 120, 180, 1440],
      default: 60,
    },
    customerSameDayEmailEnabled: { type: Boolean, default: true },
  },
  {
    _id: false,
  },
);

const barberProfileSettingsSchema = new mongoose.Schema(
  {
    barberSelfEditEnabled: { type: Boolean, default: true },
  },
  {
    _id: false,
  },
);

const shopClosedDaySchema = new mongoose.Schema(
  {
    date: { type: String, required: true, trim: true },
    message: { type: String, default: "", trim: true, maxlength: 220 },
  },
  {
    _id: false,
  },
);

const accountDeletionRequestSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ["pending", "processed", "cancelled"],
      default: "pending",
    },
    requestedAt: {
      type: Date,
      default: null,
    },
    reason: {
      type: String,
      trim: true,
      default: "",
      maxlength: 500,
    },
    contactEmail: {
      type: String,
      trim: true,
      lowercase: true,
      default: null,
    },
    handledAt: {
      type: Date,
      default: null,
    },
  },
  {
    _id: false,
  },
);

const subscriptionSchema = new mongoose.Schema(
  {
    plan: {
      type: String,
      enum: ["basic", "pro", "custom"],
      default: "basic",
    },
    status: {
      type: String,
      enum: ["trial", "active", "past_due", "cancelled"],
      default: "trial",
    },
    billingCycle: {
      type: String,
      enum: ["monthly", "yearly", "custom", null],
      default: "monthly",
    },
    renewalMode: {
      type: String,
      enum: ["manual", "automatic"],
      default: "manual",
    },
    provider: {
      type: String,
      enum: ["mercadopago", "apple", "google", null],
      default: null,
    },
    customPriceArs: {
      type: Number,
      default: null,
      min: 0,
    },
    customPriceUsdReference: {
      type: Number,
      default: null,
      min: 0,
    },
    couponCode: {
      type: String,
      default: null,
    },
    couponDiscountType: {
      type: String,
      enum: ["percentage", "fixed_usd_reference", null],
      default: null,
    },
    couponDiscountPercent: {
      type: Number,
      default: null,
      min: 0,
      max: 100,
    },
    couponDiscountAmountUsdReference: {
      type: Number,
      default: null,
      min: 0,
    },
    couponBenefitDurationType: {
      type: String,
      enum: ["forever", "one_time", "days", "months", null],
      default: null,
    },
    couponBenefitDurationValue: {
      type: Number,
      default: null,
      min: 1,
    },
    couponAppliedAt: {
      type: Date,
      default: null,
    },
    couponValidUntil: {
      type: Date,
      default: null,
    },
    referralCode: {
      type: String,
      default: null,
    },
    referralOwnerName: {
      type: String,
      default: null,
    },
    referralAttributedAt: {
      type: Date,
      default: null,
    },
    pendingCouponCode: {
      type: String,
      default: null,
    },
    pendingCouponDiscountType: {
      type: String,
      enum: ["percentage", "fixed_usd_reference", null],
      default: null,
    },
    pendingCouponDiscountPercent: {
      type: Number,
      default: null,
      min: 0,
      max: 100,
    },
    pendingCouponDiscountAmountUsdReference: {
      type: Number,
      default: null,
      min: 0,
    },
    pendingCouponBenefitDurationType: {
      type: String,
      enum: ["forever", "one_time", "days", "months", null],
      default: null,
    },
    pendingCouponBenefitDurationValue: {
      type: Number,
      default: null,
      min: 1,
    },
    internalNotes: {
      type: String,
      trim: true,
      default: "",
      maxlength: 400,
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    pendingPlan: {
      type: String,
      enum: ["basic", "pro", "custom", null],
      default: null,
    },
    mercadoPagoPreferenceId: {
      type: String,
      default: null,
    },
    mercadoPagoPreapprovalId: {
      type: String,
      default: null,
    },
    mercadoPagoPreapprovalStatus: {
      type: String,
      default: null,
    },
    mercadoPagoPreapprovalAmountArs: {
      type: Number,
      default: null,
      min: 0,
    },
    mercadoPagoPaymentId: {
      type: String,
      default: null,
    },
    nextBillingAt: {
      type: Date,
      default: null,
    },
    storeProductId: {
      type: String,
      default: null,
    },
    storeCurrentPlanId: {
      type: String,
      default: null,
    },
    storePurchaseToken: {
      type: String,
      default: null,
    },
    storeTransactionId: {
      type: String,
      default: null,
    },
    storeOriginalTransactionId: {
      type: String,
      default: null,
    },
    storeEnvironment: {
      type: String,
      default: null,
    },
    storeLastSyncedAt: {
      type: Date,
      default: null,
    },
    storeAutoRenewing: {
      type: Boolean,
      default: false,
    },
    storeStatus: {
      type: String,
      default: null,
    },
    lastPaymentAt: {
      type: Date,
      default: null,
    },
    renewalReminder7dAt: {
      type: Date,
      default: null,
    },
    renewalReminder3dAt: {
      type: Date,
      default: null,
    },
    renewalReminder1dAt: {
      type: Date,
      default: null,
    },
    pastDueAt: {
      type: Date,
      default: null,
    },
    pastDueReminderSentAt: {
      type: Date,
      default: null,
    },
    graceUntil: {
      type: Date,
      default: null,
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
  },
  {
    _id: false,
  },
);

const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      trim: true,
      required: true,
      minlength: 3,
      maxlength: 120,
    },
    businessType: {
      type: String,
      enum: BUSINESS_TYPE_VALUES,
      default: DEFAULT_BUSINESS_TYPE,
      index: true,
    },
    shopSlug: {
      type: String,
      trim: true,
      lowercase: true,
      unique: true,
      required: true,
      minlength: 3,
      maxlength: 80,
      match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: /^[\w-.]+@([\w-]+\.)+[\w-]{2,4}$/,
    },
    passwordHash: {
      type: String,
      required: true,
      minlength: 10,
    },
    role: {
      type: String,
      enum: ["admin", "barber", "technician", "viewer"],
      default: "admin",
    },
    barberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Barber",
      default: null,
    },
    shopOwnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    pushToken:{
      type:String,
      default:null,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
    passwordResetCodeHash: {
      type: String,
      default: null,
      select: false,
    },
    passwordResetExpiresAt: {
      type: Date,
      default: null,
      select: false,
    },
    themeConfig: {
      type: themeConfigSchema,
      default: () => ({}),
    },
    paymentSettings: {
      type: paymentSettingsSchema,
      default: () => ({}),
    },
    mercadoPagoAuth: {
      type: mercadoPagoAuthSchema,
      default: null,
      select: false,
    },
    notificationSettings: {
      type: notificationSettingsSchema,
      default: () => ({}),
    },
    barberProfileSettings: {
      type: barberProfileSettingsSchema,
      default: () => ({}),
    },
    shopClosedDays: {
      type: [shopClosedDaySchema],
      default: [],
    },
    accountDeletionRequest: {
      type: accountDeletionRequestSchema,
      default: null,
    },
    subscription: {
      type: subscriptionSchema,
      default: () => ({}),
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
 
);

//userSchema.index({ email: 1 }, { unique: true });

userSchema.method("toJSON", function toJSON() {
  const obj = this.toObject();
  delete obj.passwordHash;
  delete obj.passwordResetCodeHash;
  delete obj.passwordResetExpiresAt;
  return obj;
});

export const UserModel = mongoose.models.User ?? mongoose.model("User", userSchema);
