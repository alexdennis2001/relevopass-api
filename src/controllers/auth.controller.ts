import { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { hashPassword, verifyPassword } from "../lib/hash";
import { signAuthToken } from "../lib/jwt";
import { HttpError } from "../middleware/errorHandler";
import {
  createUser,
  DuplicateEmailError,
  findUserByEmail,
  findUserById,
  toPublicUser,
  updatePasswordHash,
} from "../services/users.service";
import {
  consumePasswordResetToken,
  requestPasswordReset,
} from "../services/passwordReset.service";

const COOKIE_NAME = "token";
const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function setAuthCookie(res: Response, token: string) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE_MS,
  });
}

const registerSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(150),
  email: z.string().email().max(320),
  password: z.string().min(8).max(200),
});

async function registerWithRole(
  req: Request,
  res: Response,
  next: NextFunction,
  role: "ADMIN" | "USER"
) {
  try {
    const body = registerSchema.parse(req.body);
    const passwordHash = await hashPassword(body.password);

    const user = await createUser({
      firstName: body.firstName,
      lastName: body.lastName,
      email: body.email,
      passwordHash,
      role,
    });

    const token = signAuthToken({ sub: user.Id, role: user.Role });
    setAuthCookie(res, token);

    res.status(201).json(toPublicUser(user));
  } catch (err) {
    if (err instanceof DuplicateEmailError) {
      return next(new HttpError(409, err.message));
    }
    next(err);
  }
}

export function register(req: Request, res: Response, next: NextFunction) {
  return registerWithRole(req, res, next, "USER");
}

export function registerAdmin(req: Request, res: Response, next: NextFunction) {
  return registerWithRole(req, res, next, "ADMIN");
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const body = loginSchema.parse(req.body);
    const user = await findUserByEmail(body.email);

    if (!user || !user.IsActive) {
      return next(new HttpError(401, "Correo electrónico o contraseña incorrectos"));
    }

    const passwordMatches = await verifyPassword(
      body.password,
      user.PasswordHash
    );
    if (!passwordMatches) {
      return next(new HttpError(401, "Correo electrónico o contraseña incorrectos"));
    }

    const token = signAuthToken({ sub: user.Id, role: user.Role });
    setAuthCookie(res, token);

    res.json(toPublicUser(user));
  } catch (err) {
    next(err);
  }
}

export function logout(_req: Request, res: Response) {
  res.clearCookie(COOKIE_NAME);
  res.status(204).send();
}

export async function me(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await findUserById(req.user!.sub);
    if (!user) {
      return next(new HttpError(401, "No autenticado"));
    }
    res.json(toPublicUser(user));
  } catch (err) {
    next(err);
  }
}

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export async function forgotPassword(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { email } = forgotPasswordSchema.parse(req.body);
    await requestPasswordReset(email);
    // Always the same response, whether or not the email exists —
    // don't let this endpoint be used to enumerate registered accounts.
    res.json({
      message:
        "Si el correo existe en nuestro sistema, se ha enviado un enlace para restablecer la contraseña.",
    });
  } catch (err) {
    next(err);
  }
}

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8).max(200),
});

export async function resetPassword(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { token, newPassword } = resetPasswordSchema.parse(req.body);

    const consumed = await consumePasswordResetToken(token);
    if (!consumed) {
      throw new HttpError(400, "El enlace no es válido o ya expiró");
    }

    const passwordHash = await hashPassword(newPassword);
    await updatePasswordHash(consumed.userId, passwordHash);

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}
