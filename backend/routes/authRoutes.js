import { Router } from "express";
import {
  confirmPasswordRecovery,
  createSubscriptionCheckout,
  createSubscriptionCouponAdmin,
  deleteSubscriptionCouponAdmin,
  disableBarberAccess,
  disconnectMercadoPago,
  getMailDebug,
  getPlanPricingAdmin,
  getCurrentUser,
  getMercadoPagoConnectionStatus,
  getMercadoPagoConnectUrl,
  handleMercadoPagoOAuthCallback,
  loginUser,
  listSubscriptionCouponsAdmin,
  requestPasswordRecovery,
  requestAccountDeletion,
  registerUser,
  runSubscriptionLifecycle,
  sendTestMail,
  syncStoreSubscription,
  listSubscriptionUsers,
  updatePaymentSettings,
  updatePassword,
  updateNotificationSettings,
  updateBarberProfileSettings,
  updatePlanPricingAdmin,
  updateOwnSubscriptionSettings,
  upsertBarberAccess,
  updateShopClosedDays,
  updateSubscriptionCouponAdmin,
  updateSubscriptionUser,
  updateThemeConfig,
} from "../api/authController.js";
import { savePushToken } from "../api/authController.js";
import { requireAdminRole, requireAuth } from "../middlewares/authMiddlewares.js";
import { requireAdminPanelSecret } from "../middlewares/adminPanelMiddleware.js";

const router = Router();


//defino las rutas login y registro
router.post("/register", registerUser);
router.post("/login", loginUser);
router.post("/password/recovery/request", requestPasswordRecovery);
router.post("/password/recovery/confirm", confirmPasswordRecovery);
router.post("/account-deletion-request", requireAuth, requestAccountDeletion);
router.get("/mercadopago/callback", handleMercadoPagoOAuthCallback);
router.get("/subscription/lifecycle/run", runSubscriptionLifecycle);
router.post("/subscription/lifecycle/run", runSubscriptionLifecycle);
router.get("/mail-debug", requireAuth, getMailDebug);
router.get("/me", requireAuth, getCurrentUser);
router.get("/mercadopago/status", requireAuth, getMercadoPagoConnectionStatus);
router.get("/mercadopago/connect", requireAuth, getMercadoPagoConnectUrl);
router.delete("/mercadopago/connect", requireAuth, disconnectMercadoPago);
router.post("/subscription/checkout", requireAuth, createSubscriptionCheckout);
router.post("/subscription/platform/sync", requireAuth, syncStoreSubscription);
router.put("/password", requireAuth, updatePassword);
router.put("/theme", requireAuth, updateThemeConfig);
router.put("/payment-settings", requireAuth, updatePaymentSettings);
router.put("/notification-settings", requireAuth, updateNotificationSettings);
router.put("/barber-profile-settings", requireAuth, requireAdminRole, updateBarberProfileSettings);
router.put("/shop-closed-days", requireAuth, updateShopClosedDays);
router.put("/subscription-settings", requireAuth, updateOwnSubscriptionSettings);
router.post("/barber-access", requireAuth, requireAdminRole, upsertBarberAccess);
router.delete("/barber-access/:barberId", requireAuth, requireAdminRole, disableBarberAccess);
router.post("/test-mail", requireAuth, sendTestMail);
router.post("/save-push-token", requireAuth, savePushToken);
router.get("/admin/subscriptions", requireAdminPanelSecret, listSubscriptionUsers);
router.patch("/admin/subscriptions/:userId", requireAdminPanelSecret, updateSubscriptionUser);
router.get("/admin/plan-pricing", requireAdminPanelSecret, getPlanPricingAdmin);
router.put("/admin/plan-pricing", requireAdminPanelSecret, updatePlanPricingAdmin);
router.get("/admin/subscription-coupons", requireAdminPanelSecret, listSubscriptionCouponsAdmin);
router.post("/admin/subscription-coupons", requireAdminPanelSecret, createSubscriptionCouponAdmin);
router.patch("/admin/subscription-coupons/:couponId", requireAdminPanelSecret, updateSubscriptionCouponAdmin);
router.delete("/admin/subscription-coupons/:couponId", requireAdminPanelSecret, deleteSubscriptionCouponAdmin);
export default router;
