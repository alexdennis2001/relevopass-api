import { getPool, sql } from "../db/pool";
import { HttpError } from "../middleware/errorHandler";
import { ForbiddenActionError } from "../lib/workflowErrors";

export type ProcessTemplateSummary = {
  Id: string;
  Name: string;
  CreatedByUserId: string;
  CreatedAt: Date;
};

export type ProcessTemplateStepRecord = {
  Id: string;
  ProcessTemplateId: string;
  Position: number;
  AssigneeUserId: string;
  AssigneeFirstName: string;
  AssigneeLastName: string;
  AssigneeEmail: string;
  Title: string;
  Description: string | null;
  ActionLabel: string;
};

export type ProcessTemplateSubstepRecord = {
  Id: string;
  ProcessTemplateStepId: string;
  AssigneeUserId: string;
  AssigneeFirstName: string;
  AssigneeLastName: string;
  AssigneeEmail: string;
  Title: string;
  Description: string | null;
  ActionLabel: string;
  DisplayOrder: number;
};

export type ProcessTemplateDetail = {
  template: ProcessTemplateSummary;
  steps: (ProcessTemplateStepRecord & {
    substeps: ProcessTemplateSubstepRecord[];
  })[];
};

export async function createTemplateFromProcess(
  processId: string,
  name: string,
  actorUserId: string
): Promise<ProcessTemplateSummary> {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const processResult = await new sql.Request(transaction)
      .input("processId", sql.UniqueIdentifier, processId)
      .query<{ CreatedByUserId: string }>(
        "SELECT CreatedByUserId FROM dbo.Processes WHERE Id = @processId"
      );

    const process = processResult.recordset[0];
    if (!process) {
      throw new HttpError(404, "Proceso no encontrado");
    }
    if (process.CreatedByUserId !== actorUserId) {
      throw new ForbiddenActionError(
        "Solo quien creó el proceso puede guardarlo como plantilla"
      );
    }

    const templateResult = await new sql.Request(transaction)
      .input("name", sql.NVarChar(200), name)
      .input("createdByUserId", sql.UniqueIdentifier, actorUserId)
      .query<{ Id: string; CreatedAt: Date }>(`
        INSERT INTO dbo.ProcessTemplates (Name, CreatedByUserId)
        OUTPUT INSERTED.Id, INSERTED.CreatedAt
        VALUES (@name, @createdByUserId)
      `);

    const templateId = templateResult.recordset[0].Id;

    const stepsResult = await new sql.Request(transaction)
      .input("processId", sql.UniqueIdentifier, processId)
      .query<{
        Id: string;
        Position: number;
        AssigneeUserId: string;
        Title: string;
        Description: string | null;
        ActionLabel: string;
      }>(`
        SELECT Id, Position, AssigneeUserId, Title, Description, ActionLabel
        FROM dbo.ProcessSteps
        WHERE ProcessId = @processId
        ORDER BY Position
      `);

    for (const step of stepsResult.recordset) {
      const templateStepResult = await new sql.Request(transaction)
        .input("processTemplateId", sql.UniqueIdentifier, templateId)
        .input("position", sql.Int, step.Position)
        .input("assigneeUserId", sql.UniqueIdentifier, step.AssigneeUserId)
        .input("title", sql.NVarChar(150), step.Title)
        .input("description", sql.NVarChar(1000), step.Description)
        .input("actionLabel", sql.NVarChar(100), step.ActionLabel)
        .query<{ Id: string }>(`
          INSERT INTO dbo.ProcessTemplateSteps (ProcessTemplateId, Position, AssigneeUserId, Title, Description, ActionLabel)
          OUTPUT INSERTED.Id
          VALUES (@processTemplateId, @position, @assigneeUserId, @title, @description, @actionLabel)
        `);

      const templateStepId = templateStepResult.recordset[0].Id;

      const substepsResult = await new sql.Request(transaction)
        .input("stepId", sql.UniqueIdentifier, step.Id)
        .query<{
          AssigneeUserId: string;
          Title: string;
          Description: string | null;
          ActionLabel: string;
          DisplayOrder: number;
        }>(`
          SELECT AssigneeUserId, Title, Description, ActionLabel, DisplayOrder
          FROM dbo.ProcessSubsteps
          WHERE ProcessStepId = @stepId
          ORDER BY DisplayOrder
        `);

      for (const substep of substepsResult.recordset) {
        await new sql.Request(transaction)
          .input("processTemplateStepId", sql.UniqueIdentifier, templateStepId)
          .input("assigneeUserId", sql.UniqueIdentifier, substep.AssigneeUserId)
          .input("title", sql.NVarChar(150), substep.Title)
          .input("description", sql.NVarChar(1000), substep.Description)
          .input("actionLabel", sql.NVarChar(100), substep.ActionLabel)
          .input("displayOrder", sql.Int, substep.DisplayOrder).query(`
            INSERT INTO dbo.ProcessTemplateSubsteps (ProcessTemplateStepId, AssigneeUserId, Title, Description, ActionLabel, DisplayOrder)
            VALUES (@processTemplateStepId, @assigneeUserId, @title, @description, @actionLabel, @displayOrder)
          `);
      }
    }

    await transaction.commit();
    return {
      Id: templateId,
      Name: name,
      CreatedByUserId: actorUserId,
      CreatedAt: templateResult.recordset[0].CreatedAt,
    };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

export async function listTemplates(): Promise<ProcessTemplateSummary[]> {
  const pool = await getPool();
  const result = await pool.request().query<ProcessTemplateSummary>(`
    SELECT Id, Name, CreatedByUserId, CreatedAt
    FROM dbo.ProcessTemplates
    ORDER BY CreatedAt DESC
  `);
  return result.recordset;
}

export async function getTemplateById(
  id: string
): Promise<ProcessTemplateDetail | null> {
  const pool = await getPool();

  const templateResult = await pool
    .request()
    .input("id", sql.UniqueIdentifier, id)
    .query<ProcessTemplateSummary>(
      "SELECT Id, Name, CreatedByUserId, CreatedAt FROM dbo.ProcessTemplates WHERE Id = @id"
    );

  const template = templateResult.recordset[0];
  if (!template) {
    return null;
  }

  const stepsResult = await pool
    .request()
    .input("templateId", sql.UniqueIdentifier, id)
    .query<ProcessTemplateStepRecord>(`
      SELECT
        s.*,
        u.FirstName AS AssigneeFirstName,
        u.LastName AS AssigneeLastName,
        u.Email AS AssigneeEmail
      FROM dbo.ProcessTemplateSteps s
      INNER JOIN dbo.Users u ON u.Id = s.AssigneeUserId
      WHERE s.ProcessTemplateId = @templateId
      ORDER BY s.Position
    `);

  const substepsResult = await pool
    .request()
    .input("templateId", sql.UniqueIdentifier, id)
    .query<ProcessTemplateSubstepRecord>(`
      SELECT
        sub.*,
        u.FirstName AS AssigneeFirstName,
        u.LastName AS AssigneeLastName,
        u.Email AS AssigneeEmail
      FROM dbo.ProcessTemplateSubsteps sub
      INNER JOIN dbo.ProcessTemplateSteps s ON s.Id = sub.ProcessTemplateStepId
      INNER JOIN dbo.Users u ON u.Id = sub.AssigneeUserId
      WHERE s.ProcessTemplateId = @templateId
      ORDER BY s.Position, sub.DisplayOrder
    `);

  const steps = stepsResult.recordset.map((step) => ({
    ...step,
    substeps: substepsResult.recordset.filter(
      (substep) => substep.ProcessTemplateStepId === step.Id
    ),
  }));

  return { template, steps };
}
