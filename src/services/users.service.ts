import { randomUUID } from "node:crypto";
import { getPool, sql } from "../db/pool";

export type UserRecord = {
  Id: string;
  FirstName: string;
  LastName: string;
  Email: string;
  PasswordHash: string;
  Role: "ADMIN" | "USER";
  IsActive: boolean;
  CreatedAt: Date;
  UpdatedAt: Date | null;
};

export class DuplicateEmailError extends Error {
  constructor(email: string) {
    super(`Ya existe un usuario con el correo electrónico "${email}"`);
  }
}

export function toPublicUser(user: UserRecord) {
  return {
    id: user.Id,
    firstName: user.FirstName,
    lastName: user.LastName,
    email: user.Email,
    role: user.Role,
  };
}

const UNIQUE_VIOLATION_ERROR_CODE = "ER_DUP_ENTRY";

export async function findUserByEmail(
  email: string
): Promise<UserRecord | null> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("email", sql.NVarChar(320), email)
    .query<UserRecord>("SELECT * FROM Users WHERE Email = @email");

  return result.recordset[0] ?? null;
}

export async function findUserById(id: string): Promise<UserRecord | null> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("id", sql.UniqueIdentifier, id)
    .query<UserRecord>("SELECT * FROM Users WHERE Id = @id");

  return result.recordset[0] ?? null;
}

export async function listUsers(): Promise<UserRecord[]> {
  const pool = await getPool();
  const result = await pool
    .request()
    .query<UserRecord>(
      "SELECT * FROM Users WHERE IsActive = 1 ORDER BY FirstName, LastName"
    );

  return result.recordset;
}

export async function updatePasswordHash(
  userId: string,
  passwordHash: string
): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .input("id", sql.UniqueIdentifier, userId)
    .input("passwordHash", sql.NVarChar(sql.MAX), passwordHash).query(`
      UPDATE Users
      SET PasswordHash = @passwordHash, UpdatedAt = UTC_TIMESTAMP(3)
      WHERE Id = @id
    `);
}

export async function createUser(input: {
  firstName: string;
  lastName: string;
  email: string;
  passwordHash: string;
  role: "ADMIN" | "USER";
}): Promise<UserRecord> {
  const pool = await getPool();
  const id = randomUUID();

  try {
    await pool
      .request()
      .input("id", sql.UniqueIdentifier, id)
      .input("firstName", sql.NVarChar(100), input.firstName)
      .input("lastName", sql.NVarChar(150), input.lastName)
      .input("email", sql.NVarChar(320), input.email)
      .input("passwordHash", sql.NVarChar(sql.MAX), input.passwordHash)
      .input("role", sql.VarChar(20), input.role).query(`
        INSERT INTO Users (Id, FirstName, LastName, Email, PasswordHash, Role)
        VALUES (@id, @firstName, @lastName, @email, @passwordHash, @role)
      `);
  } catch (err) {
    if (
      err instanceof Error &&
      "code" in err &&
      (err as { code: string }).code === UNIQUE_VIOLATION_ERROR_CODE
    ) {
      throw new DuplicateEmailError(input.email);
    }
    throw err;
  }

  const result = await pool
    .request()
    .input("id", sql.UniqueIdentifier, id)
    .query<UserRecord>("SELECT * FROM Users WHERE Id = @id");

  return result.recordset[0];
}
