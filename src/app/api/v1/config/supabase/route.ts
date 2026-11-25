import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

/**
 * GET /api/v1/config/supabase
 * Returns the current database configuration status.
 */
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  return NextResponse.json({
    configured: Boolean(url && anonKey && !url.includes('your-project')),
    url: url ? `${url.slice(0, 16)}...` : '',
    hasKey: Boolean(anonKey),
    environment: process.env.NEXT_PUBLIC_APP_ENV || 'development',
  });
}

/**
 * POST /api/v1/config/supabase
 * Saves Supabase credentials to .env.local and validates PostgreSQL connection.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { supabaseUrl, supabaseAnonKey, supabaseServiceKey } = body;

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        { success: false, error: 'Both Supabase Project URL and Anon Key are required.' },
        { status: 400 }
      );
    }

    const trimmedUrl = supabaseUrl.trim();
    const trimmedAnonKey = supabaseAnonKey.trim();
    const trimmedServiceKey = (supabaseServiceKey || '').trim();

    // Validate URL format
    if (!trimmedUrl.startsWith('https://') || !trimmedUrl.includes('.supabase.co')) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid Supabase Project URL. Expected format: https://<project-ref>.supabase.co',
        },
        { status: 400 }
      );
    }

    // Test connection with Supabase client before saving
    const testClient = createClient(trimmedUrl, trimmedAnonKey, {
      auth: { persistSession: false },
    });

    const start = Date.now();
    const { error: pingError } = await testClient.from('trading_accounts').select('id').limit(1);
    const latencyMs = Date.now() - start;

    // 42P01 means table does not exist yet (schema needs migration), but authentication connected!
    const isConnected = !pingError || pingError.code === '42P01';

    if (!isConnected) {
      return NextResponse.json(
        {
          success: false,
          error: `Connection test failed: ${pingError?.message || 'Invalid URL or API key'}`,
          code: pingError?.code,
          latencyMs,
        },
        { status: 400 }
      );
    }

    // Persist to .env.local
    const envPath = path.resolve(process.cwd(), '.env.local');
    let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';

    const updateEnvVar = (content: string, key: string, value: string) => {
      const regex = new RegExp(`^${key}=.*$`, 'm');
      if (regex.test(content)) {
        return content.replace(regex, `${key}=${value}`);
      }
      return `${content}\n${key}=${value}`;
    };

    envContent = updateEnvVar(envContent, 'NEXT_PUBLIC_SUPABASE_URL', trimmedUrl);
    envContent = updateEnvVar(envContent, 'NEXT_PUBLIC_SUPABASE_ANON_KEY', trimmedAnonKey);
    if (trimmedServiceKey) {
      envContent = updateEnvVar(envContent, 'SUPABASE_SERVICE_ROLE_KEY', trimmedServiceKey);
    }
    // Also disable demo data when connecting a real database
    envContent = updateEnvVar(envContent, 'NEXT_PUBLIC_ENABLE_DEMO_DATA', 'false');

    fs.writeFileSync(envPath, envContent.trim() + '\n', 'utf8');

    // Update current process.env in memory dynamically without triggering DefinePlugin static substitution
    const envObj: Record<string, string | undefined> = process.env as any;
    const keyUrl = ['NEXT_PUBLIC', 'SUPABASE', 'URL'].join('_');
    const keyAnon = ['NEXT_PUBLIC', 'SUPABASE', 'ANON_KEY'].join('_');
    const keyDemo = ['NEXT_PUBLIC', 'ENABLE', 'DEMO', 'DATA'].join('_');
    envObj[keyUrl] = trimmedUrl;
    envObj[keyAnon] = trimmedAnonKey;
    envObj[keyDemo] = 'false';
    if (trimmedServiceKey) {
      envObj['SUPABASE_SERVICE_ROLE_KEY'] = trimmedServiceKey;
    }

    return NextResponse.json({
      success: true,
      message: `Successfully connected to Supabase PostgreSQL (${latencyMs}ms latency). Credentials saved to .env.local.`,
      latencyMs,
      schemaStatus: pingError?.code === '42P01' ? 'needs_migration' : 'ready',
    });
  } catch (error: any) {
    console.error('POST /api/v1/config/supabase error:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to configure Supabase' },
      { status: 500 }
    );
  }
}
