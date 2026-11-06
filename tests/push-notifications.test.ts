import test from 'node:test';
import assert from 'node:assert/strict';
import { sendExpoPushNotifications, type ExpoPushMessage } from '../lib/notification-service';

test('Push Notifications: validates Expo push token format regex', () => {
  const tokenRegex = /^(?:ExponentPushToken|ExpoPushToken)\[.+\]$/;

  assert.equal(tokenRegex.test('ExponentPushToken[xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx]'), true);
  assert.equal(tokenRegex.test('ExpoPushToken[abc123456789]'), true);
  assert.equal(tokenRegex.test('ExponentPushToken[AbCdEf12345]'), true);

  // Invalid formats
  assert.equal(tokenRegex.test(''), false);
  assert.equal(tokenRegex.test('random-string-token'), false);
  assert.equal(tokenRegex.test('ExponentPushToken[]'), false);
  assert.equal(tokenRegex.test('ExpoPushToken[]'), false);
  assert.equal(tokenRegex.test('fcm_token_12345'), false);
});

test('Push Notifications: sendExpoPushNotifications returns 0 when messages array is empty', async () => {
  const result = await sendExpoPushNotifications([]);
  assert.deepEqual(result, { sent: 0, failed: 0 });
});

test('Push Notifications: sendExpoPushNotifications rejects invalid token shapes early', async () => {
  const invalidMessages: ExpoPushMessage[] = [
    {
      to: 'invalid-device-token',
      title: 'Test',
      body: 'Test body',
    },
    {
      to: 'another_invalid_token',
      title: 'Test 2',
      body: 'Test body 2',
    },
  ];

  const result = await sendExpoPushNotifications(invalidMessages);
  assert.equal(result.sent, 0);
  assert.equal(result.failed, 2);
});

test('Push Notifications: correctly dispatches valid tokens to Expo push REST API and parses tickets', async () => {
  const originalFetch = global.fetch;

  let capturedUrl = '';
  let capturedBody: any = null;

  global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    capturedUrl = String(input);
    capturedBody = JSON.parse(init?.body as string);

    return {
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          { status: 'ok', id: 'ticket-1' },
          { status: 'error', message: 'The recipient is not registered', details: { error: 'DeviceNotRegistered' } },
        ],
      }),
    } as Response;
  };

  try {
    const messages: ExpoPushMessage[] = [
      {
        to: 'ExponentPushToken[valid-token-1]',
        title: 'Daglige taleminutter er klare! ⚡',
        body: 'Dine daglige taleminutter og prøver er fornyet for i dag.',
        data: { actionRoute: 'ExamSetup', type: 'DAILY_CREDITS' },
      },
      {
        to: 'ExpoPushToken[unregistered-device-token]',
        title: 'Tid for litt norsktrening? 🎯',
        body: 'Øv på norsk i dag.',
        data: { actionRoute: 'ExamSetup', type: 'PRACTICE_REMINDER' },
      },
    ];

    const result = await sendExpoPushNotifications(messages);

    assert.equal(capturedUrl, 'https://exp.host/--/api/v2/push/send');
    assert.equal(Array.isArray(capturedBody), true);
    assert.equal(capturedBody.length, 2);
    assert.equal(capturedBody[0].to, 'ExponentPushToken[valid-token-1]');
    assert.equal(result.sent, 1);
    assert.equal(result.failed, 1);
  } finally {
    global.fetch = originalFetch;
  }
});

