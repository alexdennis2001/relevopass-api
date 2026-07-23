import crypto from "crypto";
import { getPool, sql } from "../db/pool";
import { sendEmail } from "../lib/ses";
import { renderAuthEmail } from "../lib/emailTemplates";

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const APP_BASE_URL = process.env.APP_BASE_URL ?? "http://localhost:5173";

function hashToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

export async function requestPasswordReset(email: string): Promise<void> {
  const pool = await getPool();

  const userResult = await pool
    .request()
    .input("email", sql.NVarChar(320), email).query<{
    Id: string;
    FirstName: string;
    IsActive: boolean;
  }>("SELECT Id, FirstName, IsActive FROM Users WHERE Email = @email");

  const user = userResult.recordset[0];
  if (!user || !user.IsActive) {
    return;
  }

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

  await pool
    .request()
    .input("userId", sql.UniqueIdentifier, user.Id)
    .query(
      "DELETE FROM PasswordResetTokens WHERE UserId = @userId AND UsedAt IS NULL"
    );

  await pool
    .request()
    .input("userId", sql.UniqueIdentifier, user.Id)
    .input("tokenHash", sql.Char(64), tokenHash)
    .input("expiresAt", sql.DateTime2, expiresAt).query(`
      INSERT INTO PasswordResetTokens (UserId, TokenHash, ExpiresAt)
      VALUES (@userId, @tokenHash, @expiresAt)
    `);

  const resetUrl = `${APP_BASE_URL}/reset-password?token=${rawToken}`;
  const { html, text } = renderAuthEmail({
    recipientFirstName: user.FirstName,
    headline: "Restablece tu contraseña",
    intro:
      "Recibimos una solicitud para restablecer la contraseña de tu cuenta de Relevo App. Este enlace es válido por 1 hora.",
    ctaLabel: "Restablecer contraseña",
    ctaUrl: resetUrl,
    disclaimer: "Si tú no solicitaste esto, puedes ignorar este correo.",
  });

  try {
    await sendEmail({
      to: email,
      subject: "Restablece tu contraseña de Relevo App",
      html,
      text,
    });
  } catch (err) {
    console.error(`Failed to send password reset email to ${email}:`, err);
  }
}

export async function consumePasswordResetToken(
  rawToken: string
): Promise<{ userId: string } | null> {
  const pool = await getPool();
  const tokenHash = hashToken(rawToken);

  const result = await pool
    .request()
    .input("tokenHash", sql.Char(64), tokenHash).query<{
    Id: string;
    UserId: string;
  }>(`
      SELECT Id, UserId FROM PasswordResetTokens
      WHERE TokenHash = @tokenHash AND UsedAt IS NULL AND ExpiresAt > UTC_TIMESTAMP(3)
    `);

  const row = result.recordset[0];
  if (!row) {
    return null;
  }

  await pool
    .request()
    .input("id", sql.UniqueIdentifier, row.Id)
    .query(
      "UPDATE PasswordResetTokens SET UsedAt = UTC_TIMESTAMP(3) WHERE Id = @id"
    );

  return { userId: row.UserId };
}
