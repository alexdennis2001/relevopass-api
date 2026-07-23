import { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { VAPID_PUBLIC_KEY } from "../lib/webPush";
import {
  isEndpointSubscribedByUser,
  subscribe,
  unsubscribe,
} from "../services/pushSubscriptions.service";

export function getVapidPublicKeyHandler(req: Request, res: Response) {
  res.json({ publicKey: VAPID_PUBLIC_KEY });
}

const subscribeSchema = z.object({
  endpoint: z.string().min(1),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

export async function subscribeHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const body = subscribeSchema.parse(req.body);
    await subscribe(req.user!.sub, {
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
    });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

const unsubscribeSchema = z.object({
  endpoint: z.string().min(1),
});

export async function unsubscribeHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const body = unsubscribeSchema.parse(req.body);
    await unsubscribe(body.endpoint, req.user!.sub);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

const subscriptionStatusSchema = z.object({
  endpoint: z.string().min(1),
});

export async function getSubscriptionStatusHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const query = subscriptionStatusSchema.parse(req.query);
    const subscribed = await isEndpointSubscribedByUser(
      req.user!.sub,
      query.endpoint
    );
    res.json({ subscribed });
  } catch (err) {
    next(err);
  }
}
