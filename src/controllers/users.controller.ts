import { NextFunction, Request, Response } from "express";
import { listUsers, toPublicUser } from "../services/users.service";

export async function listUsersHandler(
  _req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const users = await listUsers();
    res.json(users.map(toPublicUser));
  } catch (err) {
    next(err);
  }
}
