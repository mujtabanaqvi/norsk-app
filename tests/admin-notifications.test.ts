import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';

const createBroadcastSchema = z.object({
  type: z
    .enum(['DAILY_CREDITS', 'PRACTICE_REMINDER', 'ANNOUNCEMENT', 'PROMOTION', 'SYSTEM'])
    .default('ANNOUNCEMENT'),
  titleNo: z.string().trim().min(1, 'Tittel på norsk er påkrevd'),
  titleEn: z.string().trim().optional(),
  messageNo: z.string().trim().min(1, 'Melding på norsk er påkrevd'),
  messageEn: z.string().trim().optional(),
  actionRoute: z.string().trim().optional(),
  targetAudience: z.enum(['ALL', 'FREE', 'STANDARD', 'PREMIUM', 'CUSTOM']).default('ALL'),
  targetUserId: z.string().trim().optional(),
});

const triggerSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('TRIGGER_DAILY_CREDITS'),
  }),
  z.object({
    action: z.literal('TRIGGER_PRACTICE_REMINDERS'),
    daysThreshold: z.number().int().min(1).max(30).default(2),
  }),
]);

test('Admin Notifications: validate valid broadcast payload', () => {
  const result = createBroadcastSchema.safeParse({
    type: 'DAILY_CREDITS',
    titleNo: 'Nye taleminutter klare!',
    titleEn: 'New speaking minutes ready!',
    messageNo: 'Dine taleminutter er fornyet for i dag.',
    messageEn: 'Your speaking minutes are renewed for today.',
    actionRoute: 'ExamSetup',
    targetAudience: 'FREE',
  });

  assert.ok(result.success);
  assert.equal(result.data.type, 'DAILY_CREDITS');
  assert.equal(result.data.targetAudience, 'FREE');
  assert.equal(result.data.titleNo, 'Nye taleminutter klare!');
});

test('Admin Notifications: require titleNo and messageNo', () => {
  const missingTitle = createBroadcastSchema.safeParse({
    titleNo: '',
    messageNo: 'Melding',
  });
  assert.equal(missingTitle.success, false);

  const missingMessage = createBroadcastSchema.safeParse({
    titleNo: 'Tittel',
    messageNo: '',
  });
  assert.equal(missingMessage.success, false);
});

test('Admin Notifications: default values for optional fields', () => {
  const minimal = createBroadcastSchema.safeParse({
    titleNo: 'Hei',
    messageNo: 'Velkommen',
  });
  assert.ok(minimal.success);
  assert.equal(minimal.data.type, 'ANNOUNCEMENT');
  assert.equal(minimal.data.targetAudience, 'ALL');
});

test('Admin Notifications: validate trigger actions', () => {
  const creditsTrigger = triggerSchema.safeParse({
    action: 'TRIGGER_DAILY_CREDITS',
  });
  assert.ok(creditsTrigger.success);

  const remindersTrigger = triggerSchema.safeParse({
    action: 'TRIGGER_PRACTICE_REMINDERS',
    daysThreshold: 3,
  });
  assert.ok(remindersTrigger.success);
  if (remindersTrigger.data.action === 'TRIGGER_PRACTICE_REMINDERS') {
    assert.equal(remindersTrigger.data.daysThreshold, 3);
  }

  const defaultRemindersTrigger = triggerSchema.safeParse({
    action: 'TRIGGER_PRACTICE_REMINDERS',
  });
  assert.ok(defaultRemindersTrigger.success);
  if (defaultRemindersTrigger.data.action === 'TRIGGER_PRACTICE_REMINDERS') {
    assert.equal(defaultRemindersTrigger.data.daysThreshold, 2);
  }

  const invalidAction = triggerSchema.safeParse({
    action: 'UNKNOWN_TRIGGER',
  });
  assert.equal(invalidAction.success, false);
});

