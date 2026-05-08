import { Router } from "express";
import {
  handleMercadoPagoWebhook,
  handleSubscriptionMercadoPagoWebhook,
  handleSubscriptionPaymentReturnPage,
} from "../api/paymentController.js";

const router = Router();

router.post("/mercadopago/webhook", handleMercadoPagoWebhook);
router.post("/subscriptions/mercadopago/webhook", handleSubscriptionMercadoPagoWebhook);
router.get("/subscriptions/return", handleSubscriptionPaymentReturnPage);

export default router;
