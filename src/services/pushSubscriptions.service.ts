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
      INSERT INTO PushSubscriptions (UserId, Endpoint, P256dh, Auth)
      VALUES (@userId, @endpoint, @p256dh, @auth)
      ON DUPLICATE KEY UPDATE UserId = @userId, P256dh = @p256dh, Auth = @auth
    `);
}

export async function unsubscribe(endpoint: string, userId?: string): Promise<void> {
  const pool = await getPool();
  const request = pool.request().input("endpoint", sql.NVarChar(1000), endpoint);

  if (userId) {
    await request
      .input("userId", sql.UniqueIdentifier, userId)
      .query("DELETE FROM PushSubscriptions WHERE Endpoint = @endpoint AND UserId = @userId");
  } else {
    await request.query("DELETE FROM PushSubscriptions WHERE Endpoint = @endpoint");
  }
}

/**
 * Whether the given browser endpoint is currently registered to this user --
 * used on login to determine the notification bell's initial state, since a
 * browser-level PushManager subscription can exist from a *different*
 * account on a shared device and must not be shown as "on" for this user.
 */
export async function isEndpointSubscribedByUser(
  userId: string,
  endpoint: string
): Promise<boolean> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("userId", sql.UniqueIdentifier, userId)
    .input("endpoint", sql.NVarChar(1000), endpoint)
    .query(
      "SELECT 1 FROM PushSubscriptions WHERE UserId = @userId AND Endpoint = @endpoint"
    );

  return result.recordset.length > 0;
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
    "SELECT Endpoint, P256dh, Auth FROM PushSubscriptions WHERE UserId = @userId"
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
