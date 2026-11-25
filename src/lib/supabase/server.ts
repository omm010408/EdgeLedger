import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getAppConfig } from '../config/env';

/**
 * Creates a server-side Supabase client for API routes and Server Actions.
 * Utilizes the SUPABASE_SERVICE_ROLE_KEY when available to bypass RLS policies for backend administrative tasks,
 * or gracefully falls back to the public anonymous key.
 */
export function createServerSupabaseClient(): SupabaseClient | null {
  const config = getAppConfig();
  if (!config.supabase.isConfigured) {
    return null;
  }

  const key = config.supabase.serviceRoleKey || config.supabase.anonKey;
  return createClient(config.supabase.url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
