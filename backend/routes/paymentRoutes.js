import { Router } from "express";
import {
  handleMercadoPagoWebhook,
  handleSubscriptionAstroPayWebhook,
  handleSubscriptionMercadoPagoWebhook,
  handleSubscriptionPaymentReturnPage,
} from "../api/paymentController.js";

const router = Router();

router.post("/mercadopago/webhook", handleMercadoPagoWebhook);
router.post("/subscriptions/mercadopago/webhook", handleSubscriptionMercadoPagoWebhook);
router.post("/subscriptions/astropay/webhook", handleSubscriptionAstroPayWebhook);
router.get("/subscriptions/return", handleSubscriptionPaymentReturnPage);
router.get("/subscriptions/astropay/return", handleSubscriptionPaymentReturnPage);

export default router;
