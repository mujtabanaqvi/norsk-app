import { and, desc, eq, gt, gte, inArray, isNull, lt, sql } from 'drizzle-orm';
import { db } from '@/src/db';
import {
  notifications,
  userNotifications,
  users,
  examSessions,
  type Notification,
  type UserNotification,
} from '@/src/db/schema';
import { getOsloDayKey } from './tier-policy';

export type NotificationType =
  | 'DAILY_CREDITS'
  | 'PRACTICE_REMINDER'
  | 'ANNOUNCEMENT'
  | 'PROMOTION'
  | 'SYSTEM';

export type TargetAudience = 'ALL' | 'FREE' | 'STANDARD' | 'PREMIUM' | 'CUSTOM';

export interface CreateBroadcastParams {
  type?: NotificationType;
  titleNo: string;
  titleEn?: string;
  messageNo: string;
  messageEn?: string;
  actionRoute?: string;
  targetAudience?: TargetAudience;
  targetUserId?: string;
  createdById?: string;
}

export interface NotificationStats {
  id: string;
  type: string;
  titleNo: string;
  titleEn: string;
  messageNo: string;
  messageEn: string;
  actionRoute: string | null;
  targetAudience: string;
  createdAt: Date;
  totalRecipients: number;
  readCount: number;
  readRatePercent: number;
}

/**
 * Creates a broadcast/campaign notification and delivers it to matching active users.
 */
export async function createBroadcastNotification(
  params: CreateBroadcastParams
): Promise<{ notification: Notification; deliveredCount: number }> {
  const type = params.type || 'ANNOUNCEMENT';
  const titleNo = params.titleNo.trim();
  const titleEn = (params.titleEn || params.titleNo).trim();
  const messageNo = params.messageNo.trim();
  const messageEn = (params.messageEn || params.messageNo).trim();
  const targetAudience = params.targetAudience || 'ALL';
  const actionRoute = params.actionRoute?.trim() || null;
  const targetUserId = params.targetUserId?.trim() || null;
  const createdById = params.createdById?.trim() || 'ADMIN';

  // 1. Insert master notification entry
  const [createdNotification] = await db
    .insert(notifications)
    .values({
      type,
      titleNo,
      titleEn,
      messageNo,
      messageEn,
      actionRoute,
      targetAudience,
      targetUserId,
      createdById,
    })
    .returning();

  // 2. Determine target user IDs
  let targetUserQuery = db
    .select({ id: users.id })
    .from(users)
    .where(isNull(users.deactivatedAt));

  if (targetAudience === 'CUSTOM' && targetUserId) {
    targetUserQuery = db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, targetUserId), isNull(users.deactivatedAt)));
  } else if (targetAudience === 'FREE' || targetAudience === 'STANDARD' || targetAudience === 'PREMIUM') {
    targetUserQuery = db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.subscriptionTier, targetAudience), isNull(users.deactivatedAt)));
  }

  const eligibleUsers = await targetUserQuery;

  if (eligibleUsers.length === 0) {
    return { notification: createdNotification, deliveredCount: 0 };
  }

  // 3. Batch deliver to user_notifications (in batches of 500)
  const batchSize = 500;
  let deliveredCount = 0;

  for (let i = 0; i < eligibleUsers.length; i += batchSize) {
    const chunk = eligibleUsers.slice(i, i + batchSize);
    const userRows = chunk.map((u) => ({
      userId: u.id,
      notificationId: createdNotification.id,
      type,
      titleNo,
      titleEn,
      messageNo,
      messageEn,
      actionRoute,
      isRead: false,
    }));

    await db.insert(userNotifications).values(userRows);
    deliveredCount += userRows.length;
  }

  return { notification: createdNotification, deliveredCount };
}

/**
 * Delivers a "Daglige kreditter fornyet" notification for a user on a given Oslo calendar day.
 * Protected by dedupKey so user only receives 1 per day.
 */
export async function sendDailyCreditsNotification(
  userId: string,
  now = new Date()
): Promise<UserNotification | null> {
  const osloDay = getOsloDayKey(now);
  const dedupKey = `daily_credits:${osloDay}:${userId}`;

  // Check if already notified for this day
  const [existing] = await db
    .select()
    .from(userNotifications)
    .where(and(eq(userNotifications.userId, userId), eq(userNotifications.dedupKey, dedupKey)))
    .limit(1);

  if (existing) {
    return existing;
  }

  try {
    const [inserted] = await db
      .insert(userNotifications)
      .values({
        userId,
        type: 'DAILY_CREDITS',
        titleNo: 'Daglige taleminutter er klare! ⚡',
        titleEn: 'Daily speaking minutes refreshed! ⚡',
        messageNo: 'Dine daglige taleminutter og prøver er fornyet for i dag. Ta en muntlig økt nå for å forbedre flyten.',
        messageEn: 'Your daily speaking minutes and exams are renewed for today. Start a practice session now to improve your fluency.',
        actionRoute: 'ExamSetup',
        dedupKey,
        isRead: false,
      })
      .returning();

    return inserted;
  } catch (err: unknown) {
    // Unique violation on dedupKey is safe to ignore
    const isConflict = typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === '23505';
    if (isConflict) {
      const [record] = await db
        .select()
        .from(userNotifications)
        .where(and(eq(userNotifications.userId, userId), eq(userNotifications.dedupKey, dedupKey)))
        .limit(1);
      return record || null;
    }
    throw err;
  }
}

/**
 * Delivers an inactivity practice reminder notification to a user.
 */
export async function sendPracticeReminderNotification(
  userId: string,
  daysInactive: number,
  now = new Date()
): Promise<UserNotification | null> {
  const osloDay = getOsloDayKey(now);
  const dedupKey = `practice_reminder:${osloDay}:${userId}`;

  const [existing] = await db
    .select()
    .from(userNotifications)
    .where(and(eq(userNotifications.userId, userId), eq(userNotifications.dedupKey, dedupKey)))
    .limit(1);

  if (existing) {
    return existing;
  }

  const daysLabelNo = daysInactive === 1 ? '1 dag' : `${daysInactive} dager`;
  const daysLabelEn = daysInactive === 1 ? '1 day' : `${daysInactive} days`;

  try {
    const [inserted] = await db
      .insert(userNotifications)
      .values({
        userId,
        type: 'PRACTICE_REMINDER',
        titleNo: 'Tid for litt norsktrening? 🎯',
        titleEn: 'Time for some Norwegian practice? 🎯',
        messageNo: `Det er ${daysLabelNo} siden din forrige prøve. Jevnlig muntlig øving er nøkkelen til å bestå B1/B2!`,
        messageEn: `It has been ${daysLabelEn} since your last exam. Regular speaking practice is key to passing B1/B2!`,
        actionRoute: 'ExamSetup',
        dedupKey,
        isRead: false,
      })
      .returning();

    return inserted;
  } catch (err: unknown) {
    const isConflict = typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === '23505';
    if (isConflict) return null;
    throw err;
  }
}

/**
 * Triggers daily credits refresh notifications for all active users who have not received one today.
 */
export async function triggerDailyCreditsBroadcast(now = new Date()): Promise<{ sentCount: number; eligibleUsers: number }> {
  const osloDay = getOsloDayKey(now);

  const activeUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(isNull(users.deactivatedAt));

  if (activeUsers.length === 0) {
    return { sentCount: 0, eligibleUsers: 0 };
  }

  // Find users who already got one today
  const alreadyNotified = await db
    .select({ userId: userNotifications.userId })
    .from(userNotifications)
    .where(
      and(
        eq(userNotifications.type, 'DAILY_CREDITS'),
        sql`${userNotifications.dedupKey} LIKE ${`daily_credits:${osloDay}:%`}`
      )
    );

  const notifiedUserIds = new Set(alreadyNotified.map((n) => n.userId));
  const toNotify = activeUsers.filter((u) => !notifiedUserIds.has(u.id));

  let sentCount = 0;
  const batchSize = 250;
  for (let i = 0; i < toNotify.length; i += batchSize) {
    const batch = toNotify.slice(i, i + batchSize);
    const rows = batch.map((u) => ({
      userId: u.id,
      type: 'DAILY_CREDITS' as const,
      titleNo: 'Daglige taleminutter er klare! ⚡',
      titleEn: 'Daily speaking minutes refreshed! ⚡',
      messageNo: 'Dine daglige taleminutter og prøver er fornyet for i dag. Ta en muntlig økt nå for å forbedre flyten.',
      messageEn: 'Your daily speaking minutes and exams are renewed for today. Start a practice session now to improve your fluency.',
      actionRoute: 'ExamSetup',
      dedupKey: `daily_credits:${osloDay}:${u.id}`,
      isRead: false,
    }));

    await db.insert(userNotifications).values(rows);
    sentCount += rows.length;
  }

  return { sentCount, eligibleUsers: activeUsers.length };
}

/**
 * Triggers practice reminders for users who haven't taken a test in `daysThreshold` days.
 */
export async function triggerPracticeRemindersBroadcast(
  daysThreshold = 2,
  now = new Date()
): Promise<{ sentCount: number; evaluatedUsers: number }> {
  const osloDay = getOsloDayKey(now);
  const cutoffDate = new Date(now.getTime() - daysThreshold * 24 * 60 * 60 * 1000);

  // Active users
  const activeUsers = await db
    .select({ id: users.id, createdAt: users.createdAt })
    .from(users)
    .where(isNull(users.deactivatedAt));

  if (activeUsers.length === 0) {
    return { sentCount: 0, evaluatedUsers: 0 };
  }

  // Find users who already received a practice reminder today
  const alreadyNotified = await db
    .select({ userId: userNotifications.userId })
    .from(userNotifications)
    .where(
      and(
        eq(userNotifications.type, 'PRACTICE_REMINDER'),
        sql`${userNotifications.dedupKey} LIKE ${`practice_reminder:${osloDay}:%`}`
      )
    );
  const notifiedSet = new Set(alreadyNotified.map((r) => r.userId));

  // Find users with recent exams (startedAt >= cutoffDate)
  const recentExams = await db
    .select({ userId: examSessions.userId })
    .from(examSessions)
    .where(gte(examSessions.startedAt, cutoffDate));
  const activeExamUserIds = new Set(recentExams.map((e) => e.userId));

  // Eligible users: not notified today, no recent exam, and account created before cutoff
  const eligible = activeUsers.filter(
    (u) => !notifiedSet.has(u.id) && !activeExamUserIds.has(u.id) && u.createdAt <= cutoffDate
  );

  let sentCount = 0;
  const batchSize = 250;
  for (let i = 0; i < eligible.length; i += batchSize) {
    const batch = eligible.slice(i, i + batchSize);
    const rows = batch.map((u) => ({
      userId: u.id,
      type: 'PRACTICE_REMINDER' as const,
      titleNo: 'Tid for litt norsktrening? 🎯',
      titleEn: 'Time for some Norwegian practice? 🎯',
      messageNo: `Det er over ${daysThreshold} dager siden din forrige prøve. Jevnlig muntlig øving er nøkkelen til å bestå B1/B2!`,
      messageEn: `It has been over ${daysThreshold} days since your last exam. Regular speaking practice is key to passing B1/B2!`,
      actionRoute: 'ExamSetup',
      dedupKey: `practice_reminder:${osloDay}:${u.id}`,
      isRead: false,
    }));

    await db.insert(userNotifications).values(rows);
    sentCount += rows.length;
  }

  return { sentCount, evaluatedUsers: activeUsers.length };
}

/**
 * Returns user notifications with pagination and unread count.
 */
export async function getUserNotifications(
  userId: string,
  options: { unreadOnly?: boolean; limit?: number; offset?: number } = {}
): Promise<{ notifications: UserNotification[]; unreadCount: number }> {
  const limit = Math.min(Math.max(options.limit || 20, 1), 100);
  const offset = Math.max(options.offset || 0, 0);

  // 1. Unread count query
  const [unreadResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(userNotifications)
    .where(and(eq(userNotifications.userId, userId), eq(userNotifications.isRead, false)));
  const unreadCount = unreadResult?.count ?? 0;

  // 2. Notifications query
  let conditions = eq(userNotifications.userId, userId);
  if (options.unreadOnly) {
    conditions = and(conditions, eq(userNotifications.isRead, false))!;
  }

  const items = await db
    .select()
    .from(userNotifications)
    .where(conditions)
    .orderBy(desc(userNotifications.createdAt))
    .limit(limit)
    .offset(offset);

  return { notifications: items, unreadCount };
}

/**
 * Marks a single notification as read for a user.
 */
export async function markNotificationAsRead(
  userId: string,
  notificationId: string
): Promise<boolean> {
  const result = await db
    .update(userNotifications)
    .set({ isRead: true, readAt: new Date() })
    .where(and(eq(userNotifications.id, notificationId), eq(userNotifications.userId, userId)))
    .returning({ id: userNotifications.id });

  return result.length > 0;
}

/**
 * Marks all notifications as read for a user.
 */
export async function markAllNotificationsAsRead(userId: string): Promise<number> {
  const result = await db
    .update(userNotifications)
    .set({ isRead: true, readAt: new Date() })
    .where(and(eq(userNotifications.userId, userId), eq(userNotifications.isRead, false)))
    .returning({ id: userNotifications.id });

  return result.length;
}

/**
 * Deletes a notification from a user's inbox.
 */
export async function deleteUserNotification(
  userId: string,
  notificationId: string
): Promise<boolean> {
  const result = await db
    .delete(userNotifications)
    .where(and(eq(userNotifications.id, notificationId), eq(userNotifications.userId, userId)))
    .returning({ id: userNotifications.id });

  return result.length > 0;
}

/**
 * Admin: Get list of sent notifications with delivery & read rates.
 */
export async function getAdminNotificationStats(
  limit = 50,
  offset = 0
): Promise<{ items: NotificationStats[]; total: number }> {
  const [totalCountResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications);
  const total = totalCountResult?.count ?? 0;

  const rows = await db
    .select({
      id: notifications.id,
      type: notifications.type,
      titleNo: notifications.titleNo,
      titleEn: notifications.titleEn,
      messageNo: notifications.messageNo,
      messageEn: notifications.messageEn,
      actionRoute: notifications.actionRoute,
      targetAudience: notifications.targetAudience,
      createdAt: notifications.createdAt,
      totalRecipients: sql<number>`count(${userNotifications.id})::int`,
      readCount: sql<number>`count(case when ${userNotifications.isRead} = true then 1 end)::int`,
    })
    .from(notifications)
    .leftJoin(userNotifications, eq(userNotifications.notificationId, notifications.id))
    .groupBy(notifications.id)
    .orderBy(desc(notifications.createdAt))
    .limit(limit)
    .offset(offset);

  const items: NotificationStats[] = rows.map((r) => {
    const totalRecipients = r.totalRecipients || 0;
    const readCount = r.readCount || 0;
    const readRatePercent =
      totalRecipients > 0 ? Math.round((readCount / totalRecipients) * 100) : 0;
    return {
      ...r,
      totalRecipients,
      readCount,
      readRatePercent,
    };
  });

  return { items, total };
}

