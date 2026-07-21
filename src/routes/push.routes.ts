import { Router } from "express";
import {
  getVapidPublicKeyHandler,
  subscribeHandler,
  unsubscribeHandler,
} from "../controllers/push.controller";
import { requireAuth } from "../middleware/requireAuth";

export const pushRouter = Router();

pushRouter.get("/vapid-public-key", getVapidPublicKeyHandler);
pushRouter.post("/subscribe", requireAuth, subscribeHandler);
pushRouter.post("/unsubscribe", requireAuth, unsubscribeHandler);
