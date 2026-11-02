import { z } from 'zod';
import { and, asc, count, desc, eq, ilike, isNotNull, isNull, or, sql, type SQL } from 'drizzle-orm';
import { db } from '@/src/db';
import {
  account,
  examSessions,
  learningProfiles,
  promoCodes,
  promoRedemptions,
  session,
  subscriptions,
  usageLedger,
  userQuotas,
  users,
  verification,
} from '@/src/db/schema';
import { verificationIdentifier } from './verification-codes';
import { deleteSubscriber } from './revenuecat';
import type { PaymentProvider } from './entitlements';
import { getUserAudioStatus } from './tier-policy';

// ---------- Request schemas (pure, unit-tested) ----------

const tierFilter = z.enum(['ALL', 'FREE', 'STANDARD', 'PREMIUM']);
const providerFilter = z.enum(['ALL', 'STRIPE', 'APPLE', 'GOOGLE', 'PROMO', 'NONE']);
const statusFilter = z.enum(['ALL', 'ACTIVE', 'DEACTIVATED']);
const verifiedFilter = z.enum(['ALL', 'YES', 'NO']);
const sortOrder = z.enum(['newest', 'oldest', 'lastActive']);

/** Unknown or invalid values fall back to their default instead of failing the whole list request. */
export const userListParamsSchema = z.object({
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(1).max(100).catch(20),
  q: z.string().trim().max(200).catch(''),
  tier: tierFilter.catch('ALL'),
  provider: providerFilter.catch('ALL'),
  status: statusFilter.catch('ALL'),
  verified: verifiedFilter.catch('ALL'),
  sort: sortOrder.catch('newest'),
});

export type UserListParams = z.infer<typeof userListParamsSchema>;

export function parseUserListParams(searchParams: URLSearchParams): UserListParams {
  return userListParamsSchema.parse({
    page: searchParams.get('page') ?? undefined,
    pageSize: searchParams.get('pageSize') ?? undefined,
    q: searchParams.get('q') ?? undefined,
    tier: searchParams.get('tier') ?? undefined,
    provider: searchParams.get('provider') ?? undefined,
    status: searchParams.get('status') ?? undefined,
    verified: searchParams.get('verified') ?? undefined,
    sort: searchParams.get('sort') ?? undefined,
  });
}

export const updateUserSchema = z.object({
  isActive: z.boolean({ required_error: 'isActive må være true eller false.' }),
});

export const deleteUserSchema = z.object({
  confirmEmail: z.string().trim().min(1, 'Skriv inn brukerens e-postadresse for å bekrefte.'),
});

/** Better Auth ids and our own `usr_<uuid>` ids. */
const USER_ID_REGEX = /^[A-Za-z0-9_-]{1,128}$/;

export function isValidUserId(id: string | undefined): id is string {
  return Boolean(id && USER_ID_REGEX.test(id));
}

/** Escape `%`, `_` and `\` so a search for "a_b" matches literally. */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

export function emailsMatch(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

// ---------- List ----------

/** Same rule as isEntitling() in lib/entitlements.ts, in SQL. */
const ENTITLING = sql.raw(`s.status in ('ACTIVE', 'TRIALING') and s.current_period_end > now()`);

function hasEntitlingSubscription(provider?: PaymentProvider): SQL {
  return provider
    ? sql`exists (select 1 from subscriptions s where s.user_id = ${USER_ID} and ${ENTITLING} and s.provider = ${provider})`
    : sql`exists (select 1 from subscriptions s where s.user_id = ${USER_ID} and ${ENTITLING})`;
}

function buildWhere(params: UserListParams): SQL | undefined {
  const conditions: SQL[] = [];
  if (params.q) {
    const pattern = `%${escapeLikePattern(params.q)}%`;
    conditions.push(or(ilike(users.name, pattern), ilike(users.email, pattern))!);
  }
  if (params.tier !== 'ALL') conditions.push(eq(users.subscriptionTier, params.tier));
  if (params.status === 'ACTIVE') conditions.push(isNull(users.deactivatedAt));
  if (params.status === 'DEACTIVATED') conditions.push(isNotNull(users.deactivatedAt));
  if (params.verified !== 'ALL') conditions.push(eq(users.emailVerified, params.verified === 'YES'));
  if (params.provider === 'NONE') conditions.push(sql`not ${hasEntitlingSubscription()}`);
  else if (params.provider !== 'ALL') conditions.push(hasEntitlingSubscription(params.provider));
  return conditions.length ? and(...conditions) : undefined;
}

// Drizzle renders columns unqualified ("id") in a select list, where the subquery's own `id` would
// shadow the user's, so these correlated subqueries name the outer columns explicitly.
const USER_ID = sql.raw('"user"."id"');
const USER_TIER = sql.raw('"user"."subscription_tier"');

// A paid store subscription wins over a promo grant of the same tier, as in pickActiveSubscription()
const activeProviderSql = sql<PaymentProvider | null>`(
  select s.provider from subscriptions s
  where s.user_id = ${USER_ID} and ${ENTITLING} and s.tier = ${USER_TIER}
  order by (s.provider = 'PROMO'), s.current_period_end desc
  limit 1
)`;
const examCountSql = sql<number>`(select count(*) from exam_sessions e where e.user_id = ${USER_ID})`.mapWith(Number);
const lastExamAtSql = sql<Date | null>`(select max(e.started_at) from exam_sessions e where e.user_id = ${USER_ID})`.mapWith(
  examSessions.startedAt
);

export async function listUsers(params: UserListParams) {
  const where = buildWhere(params);
  const orderBy =
    params.sort === 'oldest'
      ? [asc(users.createdAt)]
      : params.sort === 'lastActive'
        ? [sql`${lastExamAtSql} desc nulls last`, desc(users.createdAt)]
        : [desc(users.createdAt)];

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        image: users.image,
        emailVerified: users.emailVerified,
        role: users.role,
        subscriptionTier: users.subscriptionTier,
        deactivatedAt: users.deactivatedAt,
        createdAt: users.createdAt,
        activeProvider: activeProviderSql,
        examCount: examCountSql,
        lastExamAt: lastExamAtSql,
      })
      .from(users)
      .where(where)
      .orderBy(...orderBy)
      .limit(params.pageSize)
      .offset((params.page - 1) * params.pageSize),
    db.select({ total: count() }).from(users).where(where),
  ]);

  return { users: rows, total };
}

// ---------- Detail ----------

export async function getUserDetail(userId: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return null;

  const [subs, accounts, [quota], examsByStatus, [{ referralCount }], redemptions, [referredBy]] = await Promise.all([
    db
      .select({
        id: subscriptions.id,
        provider: subscriptions.provider,
        productId: subscriptions.productId,
        tier: subscriptions.tier,
        status: subscriptions.status,
        environment: subscriptions.environment,
        currentPeriodEnd: subscriptions.currentPeriodEnd,
        cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
      })
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .orderBy(desc(subscriptions.currentPeriodEnd)),
    db.select({ providerId: account.providerId }).from(account).where(eq(account.userId, userId)),
    db.select().from(userQuotas).where(eq(userQuotas.userId, userId)).limit(1),
    db
      .select({ status: examSessions.status, count: count() })
      .from(examSessions)
      .where(eq(examSessions.userId, userId))
      .groupBy(examSessions.status),
    db.select({ referralCount: count() }).from(users).where(eq(users.referredByUserId, userId)),
    db
      .select({ code: promoCodes.code, tier: promoCodes.tier, redeemedAt: promoRedemptions.redeemedAt })
      .from(promoRedemptions)
      .innerJoin(promoCodes, eq(promoRedemptions.promoCodeId, promoCodes.id))
      .where(eq(promoRedemptions.userId, userId))
      .orderBy(desc(promoRedemptions.redeemedAt)),
    user.referredByUserId
      ? db
          .select({ id: users.id, name: users.name, email: users.email })
          .from(users)
          .where(eq(users.id, user.referredByUserId))
          .limit(1)
      : Promise.resolve([]),
  ]);

  const audio = await getUserAudioStatus(userId, user.subscriptionTier);

  const now = Date.now();
  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      emailVerified: user.emailVerified,
      role: user.role,
      subscriptionTier: user.subscriptionTier,
      referralCode: user.referralCode,
      deactivatedAt: user.deactivatedAt,
      createdAt: user.createdAt,
    },
    signInMethods: [...new Set(accounts.map((a) => a.providerId))],
    subscriptions: subs,
    hasActivePaidSubscription: subs.some(
      (s) =>
        s.provider !== 'PROMO' &&
        (s.status === 'ACTIVE' || s.status === 'TRIALING') &&
        s.currentPeriodEnd.getTime() > now &&
        !s.cancelAtPeriodEnd
    ),
    usage: quota
      ? {
          remainingAudioSeconds: audio.remainingAudioSeconds,
          audioUsedTodaySeconds: audio.usedTodaySeconds,
          dailyAudioSeconds: audio.dailyAudioSeconds,
          totalSttSecondsUsed: Number(quota.totalSttSecondsUsed),
          totalLlmTokensUsed: quota.totalLlmTokensUsed,
          totalCostUsd: Number(quota.totalCostUsd),
        }
      : null,
    exams: Object.fromEntries(examsByStatus.map((row) => [row.status, row.count])) as Partial<
      Record<'ACTIVE' | 'COMPLETED' | 'FAILED', number>
    >,
    referralCount,
    referredBy: referredBy ?? null,
    promoRedemptions: redemptions,
  };
}

// ---------- Deactivate / delete ----------

/** Blocks sign-in and signs the user out everywhere (JWTs are rejected in authenticateUser). */
export async function setUserActive(userId: string, isActive: boolean) {
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(users)
      .set({ deactivatedAt: isActive ? null : new Date(), updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning({ id: users.id, deactivatedAt: users.deactivatedAt });
    if (updated && !isActive) {
      await tx.delete(session).where(eq(session.userId, userId));
    }
    return updated ?? null;
  });
}

/**
 * Permanently remove the user and everything stored about them. Tables keyed by user id without a
 * foreign key are cleared explicitly; the rest (session, account, subscriptions, referral_rewards,
 * promo_redemptions) cascade from the user row.
 */
export async function deleteUserAndData(userId: string): Promise<{ revenueCatDeleted: boolean } | null> {
  const result = await db.transaction(async (tx) => {
    const [user] = await tx.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
    if (!user) return null;

    const [storeSubscription] = await tx
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .where(and(eq(subscriptions.userId, userId), sql`${subscriptions.provider} <> 'PROMO'`))
      .limit(1);

    await tx.delete(examSessions).where(eq(examSessions.userId, userId)); // cascades its usage_ledger rows
    await tx.delete(usageLedger).where(eq(usageLedger.userId, userId));
    await tx.delete(userQuotas).where(eq(userQuotas.userId, userId));
    await tx.delete(learningProfiles).where(eq(learningProfiles.userId, userId));
    await tx.delete(verification).where(eq(verification.identifier, verificationIdentifier(user.email)));
    await tx.update(users).set({ referredByUserId: null }).where(eq(users.referredByUserId, userId));
    await tx.delete(users).where(eq(users.id, userId));

    return { hadStoreSubscription: Boolean(storeSubscription) };
  });
  if (!result) return null;

  let revenueCatDeleted = false;
  if (result.hadStoreSubscription) {
    try {
      revenueCatDeleted = await deleteSubscriber(userId);
    } catch (error) {
      // The user is already gone from our database; a later webhook for them is ignored by syncRevenueCatSubscriber
      console.error(`[deleteUserAndData] RevenueCat delete failed for ${userId}:`, error);
    }
  }
  return { revenueCatDeleted };
}
