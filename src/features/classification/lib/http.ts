import { NextResponse } from 'next/server';

/** Error codes for the classification worker endpoint. */
export type ClassifyErrorCode = 'unauthorized' | 'classify_failed';

/**
 * Uniform error envelope `{ error: { code, message } }`, matching the sensor API
 * (`ingestion/lib/http.ts`). Kept local to keep the feature self-contained.
 */
export function errorResponse(
  status: number,
  code: ClassifyErrorCode,
  message: string,
): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}
