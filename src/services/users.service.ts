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

const UNIQUE_VIOLATION_ERROR_NUMBERS = new Set([2601, 2627]);

export async function findUserByEmail(
  email: string
): Promise<UserRecord | null> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("email", sql.NVarChar(320), email)
    .query<UserRecord>("SELECT * FROM dbo.Users WHERE Email = @email");

  return result.recordset[0] ?? null;
}

export async function findUserById(id: string): Promise<UserRecord | null> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("id", sql.UniqueIdentifier, id)
    .query<UserRecord>("SELECT * FROM dbo.Users WHERE Id = @id");

  return result.recordset[0] ?? null;
}

export async function listUsers(): Promise<UserRecord[]> {
  const pool = await getPool();
  const result = await pool
    .request()
    .query<UserRecord>(
      "SELECT * FROM dbo.Users WHERE IsActive = 1 ORDER BY FirstName, LastName"
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
      UPDATE dbo.Users
      SET PasswordHash = @passwordHash, UpdatedAt = SYSUTCDATETIME()
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

  try {
    const result = await pool
      .request()
      .input("firstName", sql.NVarChar(100), input.firstName)
      .input("lastName", sql.NVarChar(150), input.lastName)
      .input("email", sql.NVarChar(320), input.email)
      .input("passwordHash", sql.NVarChar(sql.MAX), input.passwordHash)
      .input("role", sql.VarChar(20), input.role).query<UserRecord>(`
        INSERT INTO dbo.Users (FirstName, LastName, Email, PasswordHash, Role)
        OUTPUT INSERTED.*
        VALUES (@firstName, @lastName, @email, @passwordHash, @role)
      `);

    return result.recordset[0];
  } catch (err) {
    if (
      err instanceof Error &&
      "number" in err &&
      UNIQUE_VIOLATION_ERROR_NUMBERS.has((err as { number: number }).number)
    ) {
      throw new DuplicateEmailError(input.email);
    }
    throw err;
  }
}
