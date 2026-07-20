import { getPool, sql } from "../db/pool";
import { sendEmail } from "../lib/ses";
import { renderStepNotificationEmail } from "../lib/emailTemplates";

const APP_BASE_URL = process.env.APP_BASE_URL ?? "http://localhost:5173";

type StepContext = {
  Title: string;
  Description: string | null;
  Position: number;
  ProcessId: string;
  ProcessName: string;
  ActivatedAt: Date;
  AdminFirstName: string;
  AdminLastName: string;
  AssigneeEmail: string;
  AssigneeFirstName: string;
};

async function getStepContext(
  stepId: string
): Promise<StepContext | undefined> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("stepId", sql.UniqueIdentifier, stepId).query<StepContext>(`
      SELECT
        s.Title, s.Description, s.Position, s.ProcessId, s.ActivatedAt,
        p.Name AS ProcessName,
        admin.FirstName AS AdminFirstName, admin.LastName AS AdminLastName,
        assignee.Email AS AssigneeEmail, assignee.FirstName AS AssigneeFirstName
      FROM dbo.ProcessSteps s
      INNER JOIN dbo.Processes p ON p.Id = s.ProcessId
      INNER JOIN dbo.Users admin ON admin.Id = p.CreatedByUserId
      INNER JOIN dbo.Users assignee ON assignee.Id = s.AssigneeUserId
      WHERE s.Id = @stepId
    `);
  return result.recordset[0];
}

async function getTotalSteps(processId: string): Promise<number> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("processId", sql.UniqueIdentifier, processId)
    .query<{ Total: number }>(
      "SELECT COUNT(*) AS Total FROM dbo.ProcessSteps WHERE ProcessId = @processId"
    );
  return result.recordset[0]?.Total ?? 0;
}

async function send(
  to: string,
  firstName: string,
  headline: string,
  intro: string,
  step: StepContext,
  totalSteps: number,
  pendingSubsteps: string
) {
  const { html, text } = renderStepNotificationEmail({
    recipientFirstName: firstName,
    headline,
    intro,
    processName: step.ProcessName,
    stepTitle: step.Title,
    stepDescription: step.Description,
    stepPosition: step.Position,
    totalSteps,
    adminName: `${step.AdminFirstName} ${step.AdminLastName}`,
    activatedAt: step.ActivatedAt,
    pendingSubsteps,
    processUrl: `${APP_BASE_URL}/processes/${step.ProcessId}`,
  });

  try {
    await sendEmail({ to, subject: headline, html, text });
  } catch (err) {
    console.error(`Failed to send notification email to ${to}:`, err);
  }
}

/**
 * Fires whenever a step becomes the current/active step — on process start
 * (step 1), on advancing to the next step, or on reactivating the previous
 * step after a rejection. If the step has no subprocesses, its assignee is
 * told it's their turn; if it has subprocesses, each subprocess assignee is
 * told they have work to do instead.
 */
export async function notifyStepActivated(stepId: string): Promise<void> {
  const step = await getStepContext(stepId);
  if (!step) return;

  const totalSteps = await getTotalSteps(step.ProcessId);

  const pool = await getPool();
  const substepsResult = await pool
    .request()
    .input("stepId", sql.UniqueIdentifier, stepId).query<{
    Email: string;
    FirstName: string;
    Title: string;
  }>(`
      SELECT u.Email, u.FirstName, sub.Title
      FROM dbo.ProcessSubsteps sub
      INNER JOIN dbo.Users u ON u.Id = sub.AssigneeUserId
      WHERE sub.ProcessStepId = @stepId
    `);

  if (substepsResult.recordset.length === 0) {
    await send(
      step.AssigneeEmail,
      step.AssigneeFirstName,
      "El relevo ha llegado a ti",
      `El proceso "${step.ProcessName}" ha avanzado y ahora tienes un paso pendiente de atención.`,
      step,
      totalSteps,
      "Ninguno"
    );
    return;
  }

  const byRecipient = new Map<
    string,
    { firstName: string; titles: string[] }
  >();
  for (const row of substepsResult.recordset) {
    const existing = byRecipient.get(row.Email);
    if (existing) {
      existing.titles.push(row.Title);
    } else {
      byRecipient.set(row.Email, { firstName: row.FirstName, titles: [row.Title] });
    }
  }

  await Promise.all(
    Array.from(byRecipient.entries()).map(([email, { firstName, titles }]) =>
      send(
        email,
        firstName,
        "Tienes un subproceso pendiente",
        `Dentro del paso "${step.Title}" del proceso "${step.ProcessName}", tienes uno o más subprocesos por completar.`,
        step,
        totalSteps,
        titles.join(", ")
      )
    )
  );
}

/**
 * Fires after a subprocess is completed — checks whether that was the last
 * remaining incomplete subprocess under its step, and if so, tells the
 * step's own assignee it's now their turn.
 */
export async function notifyIfAllSubstepsCompleted(
  stepId: string
): Promise<void> {
  const pool = await getPool();

  const remainingResult = await pool
    .request()
    .input("stepId", sql.UniqueIdentifier, stepId).query<{
    Total: number;
    Remaining: number;
  }>(`
      SELECT
        COUNT(*) AS Total,
        SUM(CASE WHEN Status <> 'COMPLETED' THEN 1 ELSE 0 END) AS Remaining
      FROM dbo.ProcessSubsteps
      WHERE ProcessStepId = @stepId
    `);

  const counts = remainingResult.recordset[0];
  if (!counts || counts.Total === 0 || counts.Remaining > 0) return;

  const step = await getStepContext(stepId);
  if (!step) return;

  const totalSteps = await getTotalSteps(step.ProcessId);

  await send(
    step.AssigneeEmail,
    step.AssigneeFirstName,
    "Todo listo, el relevo es tuyo",
    `Todos los subprocesos del paso "${step.Title}" en el proceso "${step.ProcessName}" han sido completados. Ahora es tu turno.`,
    step,
    totalSteps,
    "Ninguno"
  );
}
