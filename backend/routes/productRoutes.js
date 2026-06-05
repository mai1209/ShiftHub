import { Router } from "express";
import { requireAuth, requireAdminRole } from "../middlewares/authMiddlewares.js";
import {
  listProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  registerSale,
} from "../api/productController.js";

const router = Router();

router.use(requireAuth);

router.get("/", listProducts);
router.post("/sale", registerSale);

// El catálogo lo administra el dueño.
router.post("/", requireAdminRole, createProduct);
router.patch("/:id", requireAdminRole, updateProduct);
router.delete("/:id", requireAdminRole, deleteProduct);

export default router;
