import { getPool, sql } from "../db/pool";
import {
  PushPayload,
  PushSubscriptionGoneError,
  sendPushNotification,
} from "../lib/webPush";

export type PushSubscriptionInput = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

export async function subscribe(
  userId: string,
  subscription: PushSubscriptionInput
): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .input("userId", sql.UniqueIdentifier, userId)
    .input("endpoint", sql.NVarChar(1000), subscription.endpoint)
    .input("p256dh", sql.NVarChar(200), subscription.p256dh)
    .input("auth", sql.NVarChar(200), subscription.auth).query(`
      MERGE dbo.PushSubscriptions AS target
      USING (SELECT @endpoint AS Endpoint) AS source
      ON target.Endpoint = source.Endpoint
      WHEN MATCHED THEN
        UPDATE SET UserId = @userId, P256dh = @p256dh, Auth = @auth
      WHEN NOT MATCHED THEN
        INSERT (UserId, Endpoint, P256dh, Auth)
        VALUES (@userId, @endpoint, @p256dh, @auth);
    `);
}

export async function unsubscribe(endpoint: string): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .input("endpoint", sql.NVarChar(1000), endpoint)
    .query("DELETE FROM dbo.PushSubscriptions WHERE Endpoint = @endpoint");
}

/**
 * Sends a push notification to every subscribed device of the given user.
 * Fire-and-forget from the caller's perspective — failures for one device
 * (or all of them) never throw; a stale/expired subscription is deleted.
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload
): Promise<void> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("userId", sql.UniqueIdentifier, userId).query<{
    Endpoint: string;
    P256dh: string;
    Auth: string;
  }>(
    "SELECT Endpoint, P256dh, Auth FROM dbo.PushSubscriptions WHERE UserId = @userId"
  );

  await Promise.all(
    result.recordset.map(async (row) => {
      try {
        await sendPushNotification(
          { endpoint: row.Endpoint, p256dh: row.P256dh, auth: row.Auth },
          payload
        );
      } catch (err) {
        if (err instanceof PushSubscriptionGoneError) {
          await unsubscribe(row.Endpoint);
          return;
        }
        console.error(`Failed to send push notification to user ${userId}:`, err);
      }
    })
  );
}
