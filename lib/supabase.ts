/**
 * Supabase client (React Native / Expo Go).
 *
 * - AsyncStorage backs the auth session so it survives app restarts.
 * - detectSessionInUrl is false: there is no browser URL to parse on native.
 * - Token auto-refresh is driven by app focus (AppState), per Supabase's RN guide.
 *
 * Credentials come from EXPO_PUBLIC_* env vars (inlined at build by Expo SDK 54).
 * The publishable key is public by design — security rests on Row Level Security,
 * not on key secrecy. Never ship the secret/service_role key in the app.
 */
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  // Fail fast: an empty-string fallback would build a non-functional client and
  // surface as cryptic runtime errors. Crash at startup with an actionable message.
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY. ' +
      'Copy .env.example to .env and fill in the values from the Supabase dashboard.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Refresh the session while the app is in the foreground, pause it in background.
AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
