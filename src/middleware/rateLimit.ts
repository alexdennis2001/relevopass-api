import rateLimit from "express-rate-limit";

export function createAuthRateLimiter() {
  return rateLimit({
    windowMs: 5 * 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Demasiados intentos, inténtalo de nuevo más tarde" },
  });
}
