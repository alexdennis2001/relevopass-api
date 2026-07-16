import { HttpError } from "../middleware/errorHandler";

export class ForbiddenActionError extends Error {}
export class InvalidStateError extends Error {}

export function toHttpError(err: unknown): HttpError | null {
  if (err instanceof ForbiddenActionError) {
    return new HttpError(403, err.message);
  }
  if (err instanceof InvalidStateError) {
    return new HttpError(400, err.message);
  }
  return null;
}
