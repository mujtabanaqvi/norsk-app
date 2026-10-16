import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'norsk_app_candidate_user_id';
let cachedUserId: string | null = null;

function generateCandidateId(): string {
  const randomPart =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 10)}`;
  return `candidate_${randomPart}`;
}

export async function getOrCreateUserId(): Promise<string> {
  if (cachedUserId) return cachedUserId;

  try {
    if (Platform.OS === 'web') {
      const existing = await AsyncStorage.getItem(STORAGE_KEY);
      if (existing) {
        cachedUserId = existing;
        return existing;
      }
      const created = generateCandidateId();
      await AsyncStorage.setItem(STORAGE_KEY, created);
      cachedUserId = created;
      return created;
    }

    const existing = await SecureStore.getItemAsync(STORAGE_KEY);
    if (existing) {
      cachedUserId = existing;
      return existing;
    }
    const created = generateCandidateId();
    await SecureStore.setItemAsync(STORAGE_KEY, created);
    cachedUserId = created;
    return created;
  } catch {
    // Fallback if storage is unavailable
    if (!cachedUserId) {
      cachedUserId = 'candidate_mobile_user';
    }
    return cachedUserId;
  }
}

