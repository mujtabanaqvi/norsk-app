import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = 'norsk_app_auth_token';
const USER_KEY = 'norsk_app_auth_user';
const CANDIDATE_KEY = 'norsk_app_candidate_user_id';

let cachedToken: string | null = null;
let cachedUserId: string | null = null;

async function storageGet(key: string): Promise<string | null> {
  try {
    if (Platform.OS === 'web') {
      return await AsyncStorage.getItem(key);
    }
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function storageSet(key: string, value: string): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      await AsyncStorage.setItem(key, value);
    } else {
      await SecureStore.setItemAsync(key, value);
    }
  } catch {}
}

async function storageRemove(key: string): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      await AsyncStorage.removeItem(key);
    } else {
      await SecureStore.deleteItemAsync(key);
    }
  } catch {}
}

export async function getAuthToken(): Promise<string | null> {
  if (cachedToken) return cachedToken;
  cachedToken = await storageGet(TOKEN_KEY);
  return cachedToken;
}

export async function setAuthToken(token: string | null): Promise<void> {
  cachedToken = token;
  if (token) {
    await storageSet(TOKEN_KEY, token);
  } else {
    await storageRemove(TOKEN_KEY);
  }
}

export async function getStoredUser(): Promise<any | null> {
  const raw = await storageGet(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function setStoredUser(user: any | null): Promise<void> {
  if (user) {
    cachedUserId = user.id;
    await storageSet(USER_KEY, JSON.stringify(user));
  } else {
    cachedUserId = null;
    await storageRemove(USER_KEY);
  }
}

export async function clearAuthSession(): Promise<void> {
  await setAuthToken(null);
  await setStoredUser(null);
}

function generateCandidateId(): string {
  const randomPart =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 10)}`;
  return `candidate_${randomPart}`;
}

export async function getOrCreateUserId(): Promise<string> {
  // If user is authenticated, use their user ID
  const storedUser = await getStoredUser();
  if (storedUser?.id) {
    cachedUserId = storedUser.id;
    return storedUser.id;
  }

  if (cachedUserId) return cachedUserId;

  const existingCandidate = await storageGet(CANDIDATE_KEY);
  if (existingCandidate) {
    cachedUserId = existingCandidate;
    return existingCandidate;
  }

  const created = generateCandidateId();
  await storageSet(CANDIDATE_KEY, created);
  cachedUserId = created;
  return created;
}
