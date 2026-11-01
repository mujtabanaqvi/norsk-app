import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deleteUserSchema,
  emailsMatch,
  escapeLikePattern,
  isValidUserId,
  parseUserListParams,
  updateUserSchema,
} from '../lib/user-admin';

test('Admin users: list params fall back to defaults', () => {
  assert.deepEqual(parseUserListParams(new URLSearchParams()), {
    page: 1,
    pageSize: 20,
    q: '',
    tier: 'ALL',
    provider: 'ALL',
    status: 'ALL',
    verified: 'ALL',
    sort: 'newest',
  });
});

test('Admin users: list params parse valid values', () => {
  const params = parseUserListParams(
    new URLSearchParams('page=3&pageSize=50&q=%20ola%20&tier=PREMIUM&provider=NONE&status=DEACTIVATED&verified=NO&sort=lastActive')
  );
  assert.deepEqual(params, {
    page: 3,
    pageSize: 50,
    q: 'ola',
    tier: 'PREMIUM',
    provider: 'NONE',
    status: 'DEACTIVATED',
    verified: 'NO',
    sort: 'lastActive',
  });
});

test('Admin users: invalid list params are ignored instead of failing the request', () => {
  const params = parseUserListParams(
    new URLSearchParams('page=0&pageSize=1000&tier=GOLD&provider=PAYPAL&status=x&verified=maybe&sort=random')
  );
  assert.equal(params.page, 1);
  assert.equal(params.pageSize, 20);
  assert.equal(params.tier, 'ALL');
  assert.equal(params.provider, 'ALL');
  assert.equal(params.status, 'ALL');
  assert.equal(params.verified, 'ALL');
  assert.equal(params.sort, 'newest');
});

test('Admin users: search escapes LIKE wildcards', () => {
  assert.equal(escapeLikePattern('ola_nordmann%'), 'ola\\_nordmann\\%');
  assert.equal(escapeLikePattern('a\\b'), 'a\\\\b');
  assert.equal(escapeLikePattern('vanlig@epost.no'), 'vanlig@epost.no');
});

test('Admin users: user id validation', () => {
  assert.equal(isValidUserId('usr_3f1c2b9e-1234-4abc-9def-0123456789ab'), true);
  assert.equal(isValidUserId('Xy7kP2qLmN9'), true);
  assert.equal(isValidUserId(''), false);
  assert.equal(isValidUserId(undefined), false);
  assert.equal(isValidUserId('../etc/passwd'), false);
  assert.equal(isValidUserId('a'.repeat(129)), false);
});

test('Admin users: update and delete bodies', () => {
  assert.equal(updateUserSchema.safeParse({ isActive: false }).success, true);
  assert.equal(updateUserSchema.safeParse({}).success, false);
  assert.equal(updateUserSchema.safeParse({ isActive: 'no' }).success, false);

  assert.equal(deleteUserSchema.safeParse({ confirmEmail: 'ola@example.no' }).success, true);
  assert.equal(deleteUserSchema.safeParse({ confirmEmail: '  ' }).success, false);
  assert.equal(deleteUserSchema.safeParse({}).success, false);
});

test('Admin users: delete confirmation compares emails case-insensitively', () => {
  assert.equal(emailsMatch(' Ola@Example.no ', 'ola@example.no'), true);
  assert.equal(emailsMatch('ola@example.no', 'kari@example.no'), false);
});
