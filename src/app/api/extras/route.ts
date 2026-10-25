import { NextResponse } from 'next/server';
import { getExtras, InvalidRangeError } from '@/lib/extras';
import type { RangeKey } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const RANGES: readonly string[] = ['all', 'today', '7d', '30d', '90d'];

export async function GET(request: Request): Promise<NextResponse> {
  const params = new URL(request.url).searchParams;
  const requested = params.get('range') ?? 'all';
  // Unknown values fall back to lifetime, matching /api/stats.
  const range = (RANGES.includes(requested) ? requested : 'all') as RangeKey;
  // Custom bounds replace `range` when either one is present; getExtras
  // rejects a half-supplied or malformed pair.
  const from = params.get('from');
  const to = params.get('to');

  try {
    const extras = await getExtras(range, from, to);
    return NextResponse.json(extras, {
      headers: { 'cache-control': 'no-store, max-age=0' },
    });
  } catch (error) {
    if (error instanceof InvalidRangeError) {
      return NextResponse.json({ error: 'invalid_range', message: error.message }, { status: 400 });
    }
    console.error('[api/extras] failed', error);
    return NextResponse.json(
      {
        error: 'extras_unavailable',
        message: error instanceof Error ? error.message : 'unknown error',
      },
      { status: 500 },
    );
  }
}
