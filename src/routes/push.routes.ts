import { Router } from "express";
import {
  getSubscriptionStatusHandler,
  getVapidPublicKeyHandler,
  subscribeHandler,
  unsubscribeHandler,
} from "../controllers/push.controller";
import { requireAuth } from "../middleware/requireAuth";

export const pushRouter = Router();

pushRouter.get("/vapid-public-key", getVapidPublicKeyHandler);
pushRouter.get("/subscription-status", requireAuth, getSubscriptionStatusHandler);
pushRouter.post("/subscribe", requireAuth, subscribeHandler);
pushRouter.post("/unsubscribe", requireAuth, unsubscribeHandler);
