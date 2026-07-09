import { NextResponse } from 'next/server';
import { env } from '@/env';
import { isAuthorizedToken } from '@/features/classification/lib/authorize';
import { toClaudeParser } from '@/features/classification/lib/classify-item';
import { errorResponse } from '@/features/classification/lib/http';
import { runClassificationBatch } from '@/features/classification/worker';
import { createAnthropicClient } from '@/lib/anthropic/server';
import { parseBearerToken } from '@/lib/http/bearer';
import { createServerSupabaseClient } from '@/lib/supabase/server';

// node:crypto (constant-time compare, via the authorize helper) + the service_role
// and Claude keys — must run on Node, not Edge.
export const runtime = 'nodejs';
// A bounded Claude batch. Kept below the cron cadence (see vercel.json) so a batch
// can never overlap the next scheduled tick.
export const maxDuration = 300;

/**
 * The classification worker endpoint. Authenticates the trigger secret BEFORE any
 * work, then runs one pending batch. Both verbs are supported so the same endpoint
 * serves Vercel Cron (GET, `Authorization: Bearer $CRON_SECRET`) and pg_cron/pg_net
 * or manual calls (POST). Partial per-item failure is a normal 200; a fetch failure
 * or unexpected throw is a 500. Never leaks item content or Claude internals.
 */
async function handle(request: Request): Promise<NextResponse> {
  try {
    const token = parseBearerToken(request.headers.get('authorization'));
    if (token == null || !isAuthorizedToken(token, env.classifyTriggerSecret)) {
      return errorResponse(
        401,
        'unauthorized',
        'Invalid or missing trigger secret',
      );
    }

    const supabase = createServerSupabaseClient();
    const parser = toClaudeParser(createAnthropicClient());
    const summary = await runClassificationBatch({ supabase, parser });
    return NextResponse.json(summary, { status: 200 });
  } catch (error) {
    console.error(
      '[classification] unhandled error:',
      error instanceof Error ? error.message : error,
    );
    return errorResponse(500, 'classify_failed', 'Classification run failed');
  }
}

export const GET = handle;
export const POST = handle;
