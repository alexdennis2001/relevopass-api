import { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { guid } from "../lib/validators";
import { hashPassword } from "../lib/hash";
import { HttpError } from "../middleware/errorHandler";
import {
  findUserById,
  listUsers,
  toPublicUser,
  updatePasswordHash,
} from "../services/users.service";

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

const idParamSchema = z.object({
  id: guid,
});

const resetPasswordSchema = z.object({
  newPassword: z.string().min(8).max(200),
});

export async function resetPasswordHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { id } = idParamSchema.parse(req.params);
    const { newPassword } = resetPasswordSchema.parse(req.body);

    const user = await findUserById(id);
    if (!user) {
      throw new HttpError(404, "Usuario no encontrado");
    }

    const passwordHash = await hashPassword(newPassword);
    await updatePasswordHash(id, passwordHash);

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}
