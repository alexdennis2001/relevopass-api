import { getPool, sql } from "../db/pool";
import { HttpError } from "../middleware/errorHandler";
import { ForbiddenActionError, InvalidStateError } from "../lib/workflowErrors";

export type ProcessRecord = {
  Id: string;
  Name: string;
  Description: string | null;
  Status: "DRAFT" | "ACTIVE" | "COMPLETED";
  CurrentStepId: string | null;
  CreatedByUserId: string;
  CreatedAt: Date;
  UpdatedAt: Date | null;
  StartedAt: Date | null;
  CompletedAt: Date | null;
};

export type ProcessStepRecord = {
  Id: string;
  ProcessId: string;
  Position: number;
  AssigneeUserId: string;
  AssigneeFirstName: string;
  AssigneeLastName: string;
  AssigneeEmail: string;
  Title: string;
  Description: string | null;
  ActionLabel: string;
  Status: "WAITING" | "PENDING" | "COMPLETED";
  CompletionCount: number;
  ActivatedAt: Date | null;
  CompletedAt: Date | null;
  CompletedByUserId: string | null;
  RejectionNote: string | null;
};

export type ProcessSubstepRecord = {
  Id: string;
  ProcessStepId: string;
  AssigneeUserId: string;
  AssigneeFirstName: string;
  AssigneeLastName: string;
  AssigneeEmail: string;
  Title: string;
  Description: string | null;
  ActionLabel: string;
  DisplayOrder: number;
  Status: "WAITING" | "PENDING" | "COMPLETED";
  CompletionCount: number;
  ActivatedAt: Date | null;
  CompletedAt: Date | null;
  CompletedByUserId: string | null;
  RejectionNote: string | null;
};

export type ProcessDetail = {
  process: ProcessRecord;
  steps: (ProcessStepRecord & { substeps: ProcessSubstepRecord[] })[];
};

export class InvalidAssigneeError extends Error {
  constructor() {
    super("Uno o más IDs de usuarios asignados no existen");
  }
}

const FK_VIOLATION_ERROR_NUMBER = 547;
const DEFAULT_ACTION_LABEL = "Completar";

export type CreateSubstepInput = {
  title: string;
  description?: string;
  assigneeUserId: string;
};

export type CreateStepInput = {
  title: string;
  description?: string;
  assigneeUserId: string;
  substeps: CreateSubstepInput[];
};

type CreateProcessInput = {
  name: string;
  description?: string;
  createdByUserId: string;
  steps: CreateStepInput[];
};

async function insertSteps(
  transaction: InstanceType<typeof sql.Transaction>,
  processId: string,
  steps: CreateStepInput[],
  startingPosition: number
) {
  let position = startingPosition;

  for (const step of steps) {
    const stepResult = await new sql.Request(transaction)
      .input("processId", sql.UniqueIdentifier, processId)
      .input("position", sql.Int, position)
      .input("assigneeUserId", sql.UniqueIdentifier, step.assigneeUserId)
      .input("title", sql.NVarChar(150), step.title)
      .input("description", sql.NVarChar(1000), step.description ?? null)
      .input("actionLabel", sql.NVarChar(100), DEFAULT_ACTION_LABEL)
      .input("status", sql.VarChar(20), "WAITING").query<{ Id: string }>(`
        INSERT INTO dbo.ProcessSteps (ProcessId, Position, AssigneeUserId, Title, Description, ActionLabel, Status)
        OUTPUT INSERTED.Id
        VALUES (@processId, @position, @assigneeUserId, @title, @description, @actionLabel, @status)
      `);

    const stepId = stepResult.recordset[0].Id;
    position++;

    for (let j = 0; j < step.substeps.length; j++) {
      const substep = step.substeps[j];
      await new sql.Request(transaction)
        .input("processStepId", sql.UniqueIdentifier, stepId)
        .input("assigneeUserId", sql.UniqueIdentifier, substep.assigneeUserId)
        .input("title", sql.NVarChar(150), substep.title)
        .input("description", sql.NVarChar(1000), substep.description ?? null)
        .input("actionLabel", sql.NVarChar(100), DEFAULT_ACTION_LABEL)
        .input("displayOrder", sql.Int, j)
        .input("status", sql.VarChar(20), "WAITING").query(`
          INSERT INTO dbo.ProcessSubsteps (ProcessStepId, AssigneeUserId, Title, Description, ActionLabel, DisplayOrder, Status)
          VALUES (@processStepId, @assigneeUserId, @title, @description, @actionLabel, @displayOrder, @status)
        `);
    }
  }
}

export async function createProcess(
  input: CreateProcessInput
): Promise<string> {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const processResult = await new sql.Request(transaction)
      .input("name", sql.NVarChar(200), input.name)
      .input("description", sql.NVarChar(2000), input.description ?? null)
      .input("status", sql.VarChar(20), "DRAFT")
      .input("createdByUserId", sql.UniqueIdentifier, input.createdByUserId)
      .query<{ Id: string }>(`
        INSERT INTO dbo.Processes (Name, Description, Status, CreatedByUserId)
        OUTPUT INSERTED.Id
        VALUES (@name, @description, @status, @createdByUserId)
      `);

    const processId = processResult.recordset[0].Id;

    await insertSteps(transaction, processId, input.steps, 1);

    await new sql.Request(transaction)
      .input("processId", sql.UniqueIdentifier, processId)
      .input("actorUserId", sql.UniqueIdentifier, input.createdByUserId)
      .input("eventType", sql.VarChar(50), "PROCESS_CREATED").query(`
        INSERT INTO dbo.ProcessEvents (ProcessId, ActorUserId, EventType)
        VALUES (@processId, @actorUserId, @eventType)
      `);

    await transaction.commit();
    return processId;
  } catch (err) {
    await transaction.rollback();
    if (
      err instanceof Error &&
      "number" in err &&
      (err as { number: number }).number === FK_VIOLATION_ERROR_NUMBER
    ) {
      throw new InvalidAssigneeError();
    }
    throw err;
  }
}

export type SyncSubstepInput = {
  id?: string;
  title: string;
  description?: string;
  assigneeUserId: string;
};

export type SyncStepInput = {
  id?: string;
  title: string;
  description?: string;
  assigneeUserId: string;
  substeps: SyncSubstepInput[];
};

async function syncSubsteps(
  transaction: InstanceType<typeof sql.Transaction>,
  stepId: string,
  desiredSubsteps: SyncSubstepInput[]
) {
  const currentResult = await new sql.Request(transaction)
    .input("stepId", sql.UniqueIdentifier, stepId)
    .query<{ Id: string }>(
      "SELECT Id FROM dbo.ProcessSubsteps WHERE ProcessStepId = @stepId"
    );
  const currentIds = new Set(currentResult.recordset.map((r) => r.Id));
  const desiredIds = new Set(
    desiredSubsteps.filter((s) => s.id).map((s) => s.id!)
  );

  for (const currentId of currentIds) {
    if (!desiredIds.has(currentId)) {
      await new sql.Request(transaction)
        .input("substepId", sql.UniqueIdentifier, currentId)
        .input("stepId", sql.UniqueIdentifier, stepId)
        .query(
          "DELETE FROM dbo.ProcessSubsteps WHERE Id = @substepId AND ProcessStepId = @stepId"
        );
    }
  }

  for (let j = 0; j < desiredSubsteps.length; j++) {
    const substep = desiredSubsteps[j];

    if (substep.id) {
      await new sql.Request(transaction)
        .input("substepId", sql.UniqueIdentifier, substep.id)
        .input("stepId", sql.UniqueIdentifier, stepId)
        .input("assigneeUserId", sql.UniqueIdentifier, substep.assigneeUserId)
        .input("title", sql.NVarChar(150), substep.title)
        .input("description", sql.NVarChar(1000), substep.description ?? null)
        .input("displayOrder", sql.Int, j).query(`
          UPDATE dbo.ProcessSubsteps
          SET AssigneeUserId = @assigneeUserId, Title = @title, Description = @description, DisplayOrder = @displayOrder
          WHERE Id = @substepId AND ProcessStepId = @stepId
        `);
    } else {
      await new sql.Request(transaction)
        .input("processStepId", sql.UniqueIdentifier, stepId)
        .input("assigneeUserId", sql.UniqueIdentifier, substep.assigneeUserId)
        .input("title", sql.NVarChar(150), substep.title)
        .input("description", sql.NVarChar(1000), substep.description ?? null)
        .input("actionLabel", sql.NVarChar(100), DEFAULT_ACTION_LABEL)
        .input("displayOrder", sql.Int, j)
        .input("status", sql.VarChar(20), "WAITING").query(`
          INSERT INTO dbo.ProcessSubsteps (ProcessStepId, AssigneeUserId, Title, Description, ActionLabel, DisplayOrder, Status)
          VALUES (@processStepId, @assigneeUserId, @title, @description, @actionLabel, @displayOrder, @status)
        `);
    }
  }
}

const SCRATCH_POSITION_OFFSET = 100000;

export async function syncProcessSteps(
  processId: string,
  desiredSteps: SyncStepInput[]
): Promise<void> {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const processResult = await new sql.Request(transaction)
      .input("processId", sql.UniqueIdentifier, processId)
      .query<{ Status: string }>(
        "SELECT Status FROM dbo.Processes WHERE Id = @processId"
      );

    const process = processResult.recordset[0];
    if (!process) {
      throw new HttpError(404, "Proceso no encontrado");
    }
    if (process.Status !== "DRAFT") {
      throw new InvalidStateError("Solo se puede editar un proceso en borrador");
    }

    const currentStepsResult = await new sql.Request(transaction)
      .input("processId", sql.UniqueIdentifier, processId)
      .query<{ Id: string }>(
        "SELECT Id FROM dbo.ProcessSteps WHERE ProcessId = @processId"
      );
    const currentStepIds = new Set(
      currentStepsResult.recordset.map((r) => r.Id)
    );
    const desiredStepIds = new Set(
      desiredSteps.filter((s) => s.id).map((s) => s.id!)
    );

    // Remove steps that are no longer in the desired list. Substeps first —
    // no ON DELETE CASCADE on FK_ProcessSubsteps_ProcessStep.
    for (const currentId of currentStepIds) {
      if (!desiredStepIds.has(currentId)) {
        await new sql.Request(transaction)
          .input("stepId", sql.UniqueIdentifier, currentId)
          .query(
            "DELETE FROM dbo.ProcessSubsteps WHERE ProcessStepId = @stepId"
          );
        await new sql.Request(transaction)
          .input("stepId", sql.UniqueIdentifier, currentId)
          .input("processId", sql.UniqueIdentifier, processId)
          .query(
            "DELETE FROM dbo.ProcessSteps WHERE Id = @stepId AND ProcessId = @processId"
          );
      }
    }

    // Move every kept step to a scratch position first. UQ_ProcessSteps_Process_Position
    // is checked per-statement (not deferred to commit), so directly reassigning final
    // positions in one pass risks a transient collision with another row's current position.
    let scratchIndex = 0;
    for (const step of desiredSteps) {
      if (step.id) {
        await new sql.Request(transaction)
          .input("stepId", sql.UniqueIdentifier, step.id)
          .input("processId", sql.UniqueIdentifier, processId)
          .input("position", sql.Int, SCRATCH_POSITION_OFFSET + scratchIndex)
          .query(
            "UPDATE dbo.ProcessSteps SET Position = @position WHERE Id = @stepId AND ProcessId = @processId"
          );
        scratchIndex++;
      }
    }

    for (let i = 0; i < desiredSteps.length; i++) {
      const step = desiredSteps[i];
      const finalPosition = i + 1;
      let stepId: string;

      if (step.id) {
        await new sql.Request(transaction)
          .input("stepId", sql.UniqueIdentifier, step.id)
          .input("processId", sql.UniqueIdentifier, processId)
          .input("position", sql.Int, finalPosition)
          .input("assigneeUserId", sql.UniqueIdentifier, step.assigneeUserId)
          .input("title", sql.NVarChar(150), step.title)
          .input("description", sql.NVarChar(1000), step.description ?? null)
          .query(`
            UPDATE dbo.ProcessSteps
            SET Position = @position, AssigneeUserId = @assigneeUserId, Title = @title, Description = @description
            WHERE Id = @stepId AND ProcessId = @processId
          `);
        stepId = step.id;
      } else {
        const insertResult = await new sql.Request(transaction)
          .input("processId", sql.UniqueIdentifier, processId)
          .input("position", sql.Int, finalPosition)
          .input("assigneeUserId", sql.UniqueIdentifier, step.assigneeUserId)
          .input("title", sql.NVarChar(150), step.title)
          .input("description", sql.NVarChar(1000), step.description ?? null)
          .input("actionLabel", sql.NVarChar(100), DEFAULT_ACTION_LABEL)
          .input("status", sql.VarChar(20), "WAITING").query<{ Id: string }>(`
            INSERT INTO dbo.ProcessSteps (ProcessId, Position, AssigneeUserId, Title, Description, ActionLabel, Status)
            OUTPUT INSERTED.Id
            VALUES (@processId, @position, @assigneeUserId, @title, @description, @actionLabel, @status)
          `);
        stepId = insertResult.recordset[0].Id;
      }

      await syncSubsteps(transaction, stepId, step.substeps);
    }

    await transaction.commit();
  } catch (err) {
    await transaction.rollback();
    if (
      err instanceof Error &&
      "number" in err &&
      (err as { number: number }).number === FK_VIOLATION_ERROR_NUMBER
    ) {
      throw new InvalidAssigneeError();
    }
    throw err;
  }
}

export async function getProcessById(
  id: string
): Promise<ProcessDetail | null> {
  const pool = await getPool();

  const processResult = await pool
    .request()
    .input("id", sql.UniqueIdentifier, id)
    .query<ProcessRecord>("SELECT * FROM dbo.Processes WHERE Id = @id");

  const process = processResult.recordset[0];
  if (!process) {
    return null;
  }

  const stepsResult = await pool.request().input("processId", sql.UniqueIdentifier, id)
    .query<ProcessStepRecord>(`
      SELECT
        s.*,
        u.FirstName AS AssigneeFirstName,
        u.LastName AS AssigneeLastName,
        u.Email AS AssigneeEmail
      FROM dbo.ProcessSteps s
      INNER JOIN dbo.Users u ON u.Id = s.AssigneeUserId
      WHERE s.ProcessId = @processId
      ORDER BY s.Position
    `);

  const substepsResult = await pool
    .request()
    .input("processId", sql.UniqueIdentifier, id)
    .query<ProcessSubstepRecord>(`
      SELECT
        sub.*,
        u.FirstName AS AssigneeFirstName,
        u.LastName AS AssigneeLastName,
        u.Email AS AssigneeEmail
      FROM dbo.ProcessSubsteps sub
      INNER JOIN dbo.ProcessSteps s ON s.Id = sub.ProcessStepId
      INNER JOIN dbo.Users u ON u.Id = sub.AssigneeUserId
      WHERE s.ProcessId = @processId
      ORDER BY s.Position, sub.DisplayOrder
    `);

  const steps = stepsResult.recordset.map((step) => ({
    ...step,
    substeps: substepsResult.recordset.filter(
      (substep) => substep.ProcessStepId === step.Id
    ),
  }));

  return { process, steps };
}

export async function getMyProcesses(
  userId: string
): Promise<ProcessRecord[]> {
  const pool = await getPool();

  const result = await pool
    .request()
    .input("userId", sql.UniqueIdentifier, userId).query<ProcessRecord>(`
      SELECT DISTINCT p.*
      FROM dbo.Processes p
      WHERE p.CreatedByUserId = @userId
         OR EXISTS (
              SELECT 1 FROM dbo.ProcessSteps s
              WHERE s.ProcessId = p.Id AND s.AssigneeUserId = @userId
            )
         OR EXISTS (
              SELECT 1 FROM dbo.ProcessSubsteps sub
              INNER JOIN dbo.ProcessSteps s ON s.Id = sub.ProcessStepId
              WHERE s.ProcessId = p.Id AND sub.AssigneeUserId = @userId
            )
      ORDER BY p.CreatedAt DESC
    `);

  return result.recordset;
}

export type IncompleteSubstepInfo = {
  Title: string;
  AssigneeFirstName: string;
  AssigneeLastName: string;
};

type MyStepTaskRow = {
  Id: string;
  ProcessId: string;
  ProcessName: string;
  Position: number;
  Title: string;
  Description: string | null;
  ActionLabel: string;
  Status: "WAITING" | "PENDING" | "COMPLETED";
  CompletionCount: number;
  ActivatedAt: Date | null;
  CompletedAt: Date | null;
  RejectionNote: string | null;
  TotalSubsteps: number;
};

export type MyStepTask = MyStepTaskRow & {
  incompleteSubsteps: IncompleteSubstepInfo[];
};

export type MySubstepTask = {
  Id: string;
  ProcessStepId: string;
  ProcessId: string;
  ProcessName: string;
  StepTitle: string;
  Title: string;
  Description: string | null;
  ActionLabel: string;
  Status: "WAITING" | "PENDING" | "COMPLETED";
  CompletionCount: number;
  ActivatedAt: Date | null;
  CompletedAt: Date | null;
  RejectionNote: string | null;
};

export async function getMyTasks(userId: string): Promise<{
  steps: MyStepTask[];
  substeps: MySubstepTask[];
}> {
  const pool = await getPool();

  // Only PENDING items — things actually actionable right now, not the
  // full history of everything ever assigned to this user.
  const stepsResult = await pool
    .request()
    .input("userId", sql.UniqueIdentifier, userId).query<MyStepTaskRow>(`
      SELECT
        s.Id, s.ProcessId, p.Name AS ProcessName, s.Position, s.Title,
        s.Description, s.ActionLabel, s.Status, s.CompletionCount,
        s.ActivatedAt, s.CompletedAt, s.RejectionNote,
        (SELECT COUNT(*) FROM dbo.ProcessSubsteps sub WHERE sub.ProcessStepId = s.Id) AS TotalSubsteps
      FROM dbo.ProcessSteps s
      INNER JOIN dbo.Processes p ON p.Id = s.ProcessId
      WHERE s.AssigneeUserId = @userId AND s.Status = 'PENDING'
      ORDER BY p.Name, s.Position
    `);

  const incompleteSubstepsResult = await pool
    .request()
    .input("userId", sql.UniqueIdentifier, userId).query<
      IncompleteSubstepInfo & { ProcessStepId: string }
    >(`
      SELECT
        sub.ProcessStepId, sub.Title,
        u.FirstName AS AssigneeFirstName, u.LastName AS AssigneeLastName
      FROM dbo.ProcessSubsteps sub
      INNER JOIN dbo.ProcessSteps s ON s.Id = sub.ProcessStepId
      INNER JOIN dbo.Users u ON u.Id = sub.AssigneeUserId
      WHERE s.AssigneeUserId = @userId AND s.Status = 'PENDING' AND sub.Status <> 'COMPLETED'
      ORDER BY sub.DisplayOrder
    `);

  const steps = stepsResult.recordset.map((step) => ({
    ...step,
    incompleteSubsteps: incompleteSubstepsResult.recordset
      .filter((sub) => sub.ProcessStepId === step.Id)
      .map(({ Title, AssigneeFirstName, AssigneeLastName }) => ({
        Title,
        AssigneeFirstName,
        AssigneeLastName,
      })),
  }));

  const substepsResult = await pool
    .request()
    .input("userId", sql.UniqueIdentifier, userId).query<MySubstepTask>(`
      SELECT
        sub.Id, sub.ProcessStepId, s.ProcessId, p.Name AS ProcessName,
        s.Title AS StepTitle, sub.Title, sub.Description, sub.ActionLabel,
        sub.Status, sub.CompletionCount, sub.ActivatedAt, sub.CompletedAt,
        sub.RejectionNote
      FROM dbo.ProcessSubsteps sub
      INNER JOIN dbo.ProcessSteps s ON s.Id = sub.ProcessStepId
      INNER JOIN dbo.Processes p ON p.Id = s.ProcessId
      WHERE sub.AssigneeUserId = @userId AND sub.Status = 'PENDING'
      ORDER BY p.Name, s.Position, sub.DisplayOrder
    `);

  return { steps, substeps: substepsResult.recordset };
}

export type ProcessEventRecord = {
  Id: string;
  ProcessId: string;
  ProcessStepId: string | null;
  ProcessSubstepId: string | null;
  ActorUserId: string;
  ActorFirstName: string;
  ActorLastName: string;
  EventType: string;
  Metadata: string | null;
  CreatedAt: Date;
};

export async function getProcessEvents(
  processId: string
): Promise<ProcessEventRecord[]> {
  const pool = await getPool();

  const result = await pool
    .request()
    .input("processId", sql.UniqueIdentifier, processId)
    .query<ProcessEventRecord>(`
      SELECT
        e.*,
        u.FirstName AS ActorFirstName,
        u.LastName AS ActorLastName
      FROM dbo.ProcessEvents e
      INNER JOIN dbo.Users u ON u.Id = e.ActorUserId
      WHERE e.ProcessId = @processId
      ORDER BY e.CreatedAt ASC, e.Id ASC
    `);

  return result.recordset;
}

export type ProcessStakeholderAccess = "not_found" | "forbidden" | "ok";

export async function getProcessStakeholderAccess(
  processId: string,
  userId: string
): Promise<ProcessStakeholderAccess> {
  const pool = await getPool();

  const processResult = await pool
    .request()
    .input("processId", sql.UniqueIdentifier, processId)
    .query<{ CreatedByUserId: string }>(
      "SELECT CreatedByUserId FROM dbo.Processes WHERE Id = @processId"
    );

  const process = processResult.recordset[0];
  if (!process) {
    return "not_found";
  }
  if (process.CreatedByUserId === userId) {
    return "ok";
  }

  const assigneeResult = await pool
    .request()
    .input("processId", sql.UniqueIdentifier, processId)
    .input("userId", sql.UniqueIdentifier, userId).query<{
      IsAssignee: number;
    }>(`
      SELECT CASE WHEN EXISTS (
        SELECT 1 FROM dbo.ProcessSteps WHERE ProcessId = @processId AND AssigneeUserId = @userId
        UNION ALL
        SELECT 1 FROM dbo.ProcessSubsteps sub
          INNER JOIN dbo.ProcessSteps s ON s.Id = sub.ProcessStepId
          WHERE s.ProcessId = @processId AND sub.AssigneeUserId = @userId
      ) THEN 1 ELSE 0 END AS IsAssignee
    `);

  return assigneeResult.recordset[0].IsAssignee === 1 ? "ok" : "forbidden";
}

async function logEvent(
  transaction: InstanceType<typeof sql.Transaction>,
  input: {
    processId: string;
    processStepId?: string;
    processSubstepId?: string;
    actorUserId: string;
    eventType: string;
    metadata?: Record<string, unknown>;
  }
) {
  await new sql.Request(transaction)
    .input("processId", sql.UniqueIdentifier, input.processId)
    .input("processStepId", sql.UniqueIdentifier, input.processStepId ?? null)
    .input(
      "processSubstepId",
      sql.UniqueIdentifier,
      input.processSubstepId ?? null
    )
    .input("actorUserId", sql.UniqueIdentifier, input.actorUserId)
    .input("eventType", sql.VarChar(50), input.eventType)
    .input(
      "metadata",
      sql.NVarChar(sql.MAX),
      input.metadata ? JSON.stringify(input.metadata) : null
    ).query(`
      INSERT INTO dbo.ProcessEvents (ProcessId, ProcessStepId, ProcessSubstepId, ActorUserId, EventType, Metadata)
      VALUES (@processId, @processStepId, @processSubstepId, @actorUserId, @eventType, @metadata)
    `);
}

async function activateStep(
  transaction: InstanceType<typeof sql.Transaction>,
  stepId: string,
  processId: string,
  actorUserId: string,
  rejectionNote: string | null = null
) {
  await new sql.Request(transaction)
    .input("stepId", sql.UniqueIdentifier, stepId)
    .input("rejectionNote", sql.NVarChar(1000), rejectionNote)
    .query(`
      UPDATE dbo.ProcessSteps
      SET Status = 'PENDING', ActivatedAt = SYSUTCDATETIME(), RejectionNote = @rejectionNote
      WHERE Id = @stepId
    `);

  await new sql.Request(transaction).input("stepId", sql.UniqueIdentifier, stepId)
    .query(`
      UPDATE dbo.ProcessSubsteps
      SET Status = 'PENDING', ActivatedAt = SYSUTCDATETIME(), RejectionNote = NULL
      WHERE ProcessStepId = @stepId
    `);

  await logEvent(transaction, {
    processId,
    processStepId: stepId,
    actorUserId,
    eventType: "STEP_ACTIVATED",
  });
}

export async function startProcess(
  processId: string,
  actorUserId: string
): Promise<ProcessDetail> {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const processResult = await new sql.Request(transaction)
      .input("processId", sql.UniqueIdentifier, processId)
      .query<{ Status: string }>(
        "SELECT Status FROM dbo.Processes WHERE Id = @processId"
      );

    const process = processResult.recordset[0];
    if (!process) {
      throw new HttpError(404, "Proceso no encontrado");
    }
    if (process.Status !== "DRAFT") {
      throw new InvalidStateError("Solo se puede iniciar un proceso en borrador");
    }

    const firstStepResult = await new sql.Request(transaction)
      .input("processId", sql.UniqueIdentifier, processId)
      .query<{ Id: string }>(`
        SELECT TOP 1 Id FROM dbo.ProcessSteps
        WHERE ProcessId = @processId
        ORDER BY Position ASC
      `);

    const firstStep = firstStepResult.recordset[0];
    if (!firstStep) {
      throw new InvalidStateError("El proceso no tiene pasos");
    }

    await new sql.Request(transaction)
      .input("processId", sql.UniqueIdentifier, processId)
      .input("stepId", sql.UniqueIdentifier, firstStep.Id).query(`
        UPDATE dbo.Processes
        SET Status = 'ACTIVE', StartedAt = SYSUTCDATETIME(), CurrentStepId = @stepId
        WHERE Id = @processId
      `);

    await logEvent(transaction, {
      processId,
      actorUserId,
      eventType: "PROCESS_STARTED",
    });

    await activateStep(transaction, firstStep.Id, processId, actorUserId);

    await transaction.commit();
    return (await getProcessById(processId))!;
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

export async function completeStep(
  stepId: string,
  actorUserId: string
): Promise<ProcessDetail> {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const stepResult = await new sql.Request(transaction)
      .input("stepId", sql.UniqueIdentifier, stepId)
      .query<{
        Id: string;
        ProcessId: string;
        Position: number;
        AssigneeUserId: string;
      }>(
        "SELECT Id, ProcessId, Position, AssigneeUserId FROM dbo.ProcessSteps WHERE Id = @stepId"
      );

    const step = stepResult.recordset[0];
    if (!step) {
      throw new HttpError(404, "Paso no encontrado");
    }

    if (step.AssigneeUserId !== actorUserId) {
      throw new ForbiddenActionError("No eres el asignado de este paso");
    }

    const processResult = await new sql.Request(transaction)
      .input("processId", sql.UniqueIdentifier, step.ProcessId)
      .query<{ CurrentStepId: string | null }>(
        "SELECT CurrentStepId FROM dbo.Processes WHERE Id = @processId"
      );

    const process = processResult.recordset[0];
    if (!process || process.CurrentStepId !== step.Id) {
      throw new InvalidStateError(
        "Este paso no tiene actualmente el relevo"
      );
    }

    const incompleteSubstepsResult = await new sql.Request(transaction)
      .input("stepId", sql.UniqueIdentifier, stepId)
      .query<{ Count: number }>(
        "SELECT COUNT(*) AS Count FROM dbo.ProcessSubsteps WHERE ProcessStepId = @stepId AND Status <> 'COMPLETED'"
      );

    if (incompleteSubstepsResult.recordset[0].Count > 0) {
      throw new InvalidStateError("Primero deben completarse todos los subprocesos");
    }

    await new sql.Request(transaction)
      .input("stepId", sql.UniqueIdentifier, stepId)
      .input("actorUserId", sql.UniqueIdentifier, actorUserId).query(`
        UPDATE dbo.ProcessSteps
        SET Status = 'COMPLETED', CompletionCount = CompletionCount + 1, CompletedAt = SYSUTCDATETIME(), CompletedByUserId = @actorUserId, RejectionNote = NULL
        WHERE Id = @stepId
      `);

    await logEvent(transaction, {
      processId: step.ProcessId,
      processStepId: stepId,
      actorUserId,
      eventType: "STEP_COMPLETED",
    });

    const nextStepResult = await new sql.Request(transaction)
      .input("processId", sql.UniqueIdentifier, step.ProcessId)
      .input("nextPosition", sql.Int, step.Position + 1)
      .query<{ Id: string }>(
        "SELECT Id FROM dbo.ProcessSteps WHERE ProcessId = @processId AND Position = @nextPosition"
      );

    const nextStep = nextStepResult.recordset[0];

    if (nextStep) {
      await new sql.Request(transaction)
        .input("processId", sql.UniqueIdentifier, step.ProcessId)
        .input("nextStepId", sql.UniqueIdentifier, nextStep.Id)
        .query(
          "UPDATE dbo.Processes SET CurrentStepId = @nextStepId WHERE Id = @processId"
        );

      await activateStep(transaction, nextStep.Id, step.ProcessId, actorUserId);
    } else {
      await new sql.Request(transaction)
        .input("processId", sql.UniqueIdentifier, step.ProcessId)
        .query(
          "UPDATE dbo.Processes SET Status = 'COMPLETED', CompletedAt = SYSUTCDATETIME() WHERE Id = @processId"
        );

      await logEvent(transaction, {
        processId: step.ProcessId,
        actorUserId,
        eventType: "PROCESS_COMPLETED",
      });
    }

    await transaction.commit();
    return (await getProcessById(step.ProcessId))!;
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

export async function rejectStep(
  stepId: string,
  actorUserId: string,
  note: string
): Promise<ProcessDetail> {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const stepResult = await new sql.Request(transaction)
      .input("stepId", sql.UniqueIdentifier, stepId)
      .query<{
        Id: string;
        ProcessId: string;
        Position: number;
        AssigneeUserId: string;
      }>(
        "SELECT Id, ProcessId, Position, AssigneeUserId FROM dbo.ProcessSteps WHERE Id = @stepId"
      );

    const step = stepResult.recordset[0];
    if (!step) {
      throw new HttpError(404, "Paso no encontrado");
    }

    if (step.AssigneeUserId !== actorUserId) {
      throw new ForbiddenActionError("No eres el asignado de este paso");
    }

    const processResult = await new sql.Request(transaction)
      .input("processId", sql.UniqueIdentifier, step.ProcessId)
      .query<{ CurrentStepId: string | null }>(
        "SELECT CurrentStepId FROM dbo.Processes WHERE Id = @processId"
      );

    const process = processResult.recordset[0];
    if (!process || process.CurrentStepId !== step.Id) {
      throw new InvalidStateError(
        "Este paso no tiene actualmente el relevo"
      );
    }

    if (step.Position <= 1) {
      throw new InvalidStateError("El primer paso no se puede rechazar");
    }

    await new sql.Request(transaction).input("stepId", sql.UniqueIdentifier, stepId)
      .query(`
        UPDATE dbo.ProcessSteps
        SET Status = 'WAITING'
        WHERE Id = @stepId
      `);

    await logEvent(transaction, {
      processId: step.ProcessId,
      processStepId: stepId,
      actorUserId,
      eventType: "STEP_REJECTED",
      metadata: { note },
    });

    const previousStepResult = await new sql.Request(transaction)
      .input("processId", sql.UniqueIdentifier, step.ProcessId)
      .input("previousPosition", sql.Int, step.Position - 1)
      .query<{ Id: string }>(
        "SELECT Id FROM dbo.ProcessSteps WHERE ProcessId = @processId AND Position = @previousPosition"
      );

    const previousStep = previousStepResult.recordset[0];
    if (!previousStep) {
      throw new InvalidStateError("No se encontró el paso anterior");
    }

    await new sql.Request(transaction)
      .input("processId", sql.UniqueIdentifier, step.ProcessId)
      .input("previousStepId", sql.UniqueIdentifier, previousStep.Id)
      .query(
        "UPDATE dbo.Processes SET CurrentStepId = @previousStepId WHERE Id = @processId"
      );

    await activateStep(
      transaction,
      previousStep.Id,
      step.ProcessId,
      actorUserId,
      note
    );

    await transaction.commit();
    return (await getProcessById(step.ProcessId))!;
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

export async function completeSubstep(
  substepId: string,
  actorUserId: string
): Promise<ProcessDetail> {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const substepResult = await new sql.Request(transaction)
      .input("substepId", sql.UniqueIdentifier, substepId)
      .query<{
        Id: string;
        ProcessStepId: string;
        AssigneeUserId: string;
        Status: string;
      }>(
        "SELECT Id, ProcessStepId, AssigneeUserId, Status FROM dbo.ProcessSubsteps WHERE Id = @substepId"
      );

    const substep = substepResult.recordset[0];
    if (!substep) {
      throw new HttpError(404, "Subproceso no encontrado");
    }

    if (substep.AssigneeUserId !== actorUserId) {
      throw new ForbiddenActionError(
        "No eres el asignado de este subproceso"
      );
    }

    if (substep.Status === "COMPLETED") {
      throw new InvalidStateError("Este subproceso ya está completado");
    }

    const stepResult = await new sql.Request(transaction)
      .input("stepId", sql.UniqueIdentifier, substep.ProcessStepId)
      .query<{ Id: string; ProcessId: string }>(
        "SELECT Id, ProcessId FROM dbo.ProcessSteps WHERE Id = @stepId"
      );

    const step = stepResult.recordset[0];

    const processResult = await new sql.Request(transaction)
      .input("processId", sql.UniqueIdentifier, step.ProcessId)
      .query<{ CurrentStepId: string | null }>(
        "SELECT CurrentStepId FROM dbo.Processes WHERE Id = @processId"
      );

    const process = processResult.recordset[0];
    if (!process || process.CurrentStepId !== step.Id) {
      throw new InvalidStateError(
        "El paso de este subproceso no tiene actualmente el relevo"
      );
    }

    await new sql.Request(transaction)
      .input("substepId", sql.UniqueIdentifier, substepId)
      .input("actorUserId", sql.UniqueIdentifier, actorUserId).query(`
        UPDATE dbo.ProcessSubsteps
        SET Status = 'COMPLETED', CompletionCount = CompletionCount + 1, CompletedAt = SYSUTCDATETIME(), CompletedByUserId = @actorUserId, RejectionNote = NULL
        WHERE Id = @substepId
      `);

    await logEvent(transaction, {
      processId: step.ProcessId,
      processStepId: step.Id,
      processSubstepId: substepId,
      actorUserId,
      eventType: "SUBSTEP_COMPLETED",
    });

    await transaction.commit();
    return (await getProcessById(step.ProcessId))!;
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

export async function rejectSubstep(
  substepId: string,
  actorUserId: string,
  note: string
): Promise<ProcessDetail> {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const substepResult = await new sql.Request(transaction)
      .input("substepId", sql.UniqueIdentifier, substepId)
      .query<{
        Id: string;
        ProcessStepId: string;
        Status: string;
      }>(
        "SELECT Id, ProcessStepId, Status FROM dbo.ProcessSubsteps WHERE Id = @substepId"
      );

    const substep = substepResult.recordset[0];
    if (!substep) {
      throw new HttpError(404, "Subproceso no encontrado");
    }

    if (substep.Status !== "COMPLETED") {
      throw new InvalidStateError("Solo se puede rechazar un subproceso completado");
    }

    const stepResult = await new sql.Request(transaction)
      .input("stepId", sql.UniqueIdentifier, substep.ProcessStepId)
      .query<{ Id: string; ProcessId: string; AssigneeUserId: string }>(
        "SELECT Id, ProcessId, AssigneeUserId FROM dbo.ProcessSteps WHERE Id = @stepId"
      );

    const step = stepResult.recordset[0];

    if (step.AssigneeUserId !== actorUserId) {
      throw new ForbiddenActionError("No eres el asignado de este paso");
    }

    const processResult = await new sql.Request(transaction)
      .input("processId", sql.UniqueIdentifier, step.ProcessId)
      .query<{ CurrentStepId: string | null }>(
        "SELECT CurrentStepId FROM dbo.Processes WHERE Id = @processId"
      );

    const process = processResult.recordset[0];
    if (!process || process.CurrentStepId !== step.Id) {
      throw new InvalidStateError(
        "El paso de este subproceso no tiene actualmente el relevo"
      );
    }

    await new sql.Request(transaction)
      .input("substepId", sql.UniqueIdentifier, substepId)
      .input("note", sql.NVarChar(1000), note)
      .query(`
        UPDATE dbo.ProcessSubsteps
        SET Status = 'PENDING', ActivatedAt = SYSUTCDATETIME(), CompletedAt = NULL, CompletedByUserId = NULL, RejectionNote = @note
        WHERE Id = @substepId
      `);

    await logEvent(transaction, {
      processId: step.ProcessId,
      processStepId: step.Id,
      processSubstepId: substepId,
      actorUserId,
      eventType: "SUBSTEP_REJECTED",
      metadata: { note },
    });

    await transaction.commit();
    return (await getProcessById(step.ProcessId))!;
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}
