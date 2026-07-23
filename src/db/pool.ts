import mysql, { Pool, PoolConnection } from "mysql2/promise";

const config = {
  host: process.env.DB_SERVER ?? "localhost",
  port: Number(process.env.DB_PORT ?? 3306),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  waitForConnections: true,
  connectionLimit: 10,
};

let rawPool: Pool | null = null;

function getRawPool(): Pool {
  if (!rawPool) {
    rawPool = mysql.createPool(config);
  }
  return rawPool;
}

interface Executor {
  execute(sql: string, values: unknown[]): Promise<[unknown, unknown]>;
}

/**
 * Thin shim preserving the mssql fluent API (`pool.request().input(...).query()`,
 * `sql.Transaction`/`sql.Request`, `sql.UniqueIdentifier` etc type markers) this
 * project's service layer already uses, backed by mysql2 instead. Keeps the
 * ~160 existing parameterized queries untouched -- only genuinely T-SQL-specific
 * syntax in the query text itself (OUTPUT INSERTED, MERGE, TOP, dbo. prefixes,
 * SYSUTCDATETIME) needed rewriting at the call sites.
 */
export class Transaction {
  connection: PoolConnection | null = null;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_pool?: unknown) {}

  async begin(): Promise<void> {
    this.connection = await getRawPool().getConnection();
    await this.connection.beginTransaction();
  }

  async commit(): Promise<void> {
    await this.connection!.commit();
    this.connection!.release();
  }

  async rollback(): Promise<void> {
    await this.connection!.rollback();
    this.connection!.release();
  }
}

export class Request {
  private inputs = new Map<string, unknown>();

  constructor(private target: Executor | Transaction) {}

  input(name: string, type: unknown, value?: unknown): this {
    this.inputs.set(name, arguments.length >= 3 ? value : type);
    return this;
  }

  async query<T = unknown>(text: string): Promise<{ recordset: T[] }> {
    const params: unknown[] = [];
    const converted = text.replace(
      /@([a-zA-Z_][a-zA-Z0-9_]*)/g,
      (_match: string, name: string) => {
        if (!this.inputs.has(name)) {
          throw new Error(`Missing input parameter: ${name}`);
        }
        params.push(this.inputs.get(name));
        return "?";
      }
    );

    const executor: Executor =
      this.target instanceof Transaction
        ? (this.target.connection! as unknown as Executor)
        : this.target;
    const [rows] = await executor.execute(converted, params);
    return { recordset: rows as T[] };
  }
}

function typeMarker(name: string) {
  const marker = ((..._args: unknown[]) => marker) as unknown as {
    (...args: unknown[]): unknown;
    sqlType: string;
  };
  marker.sqlType = name;
  return marker;
}

export const sql = {
  UniqueIdentifier: typeMarker("UniqueIdentifier"),
  NVarChar: typeMarker("NVarChar"),
  VarChar: typeMarker("VarChar"),
  Char: typeMarker("Char"),
  Int: typeMarker("Int"),
  DateTime2: typeMarker("DateTime2"),
  MAX: Symbol("MAX"),
  Transaction,
  Request,
};

class PoolWrapper {
  request(): Request {
    return new Request(getRawPool() as unknown as Executor);
  }
}

let poolPromise: Promise<PoolWrapper> | null = null;

export function getPool(): Promise<PoolWrapper> {
  if (!poolPromise) {
    poolPromise = getRawPool()
      .getConnection()
      .then((conn) => {
        conn.release();
        return new PoolWrapper();
      });
  }
  return poolPromise;
}
