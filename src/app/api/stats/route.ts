import { NextResponse } from 'next/server';
import { buildStats, InvalidRangeError } from '@/lib/stats';
import type { RangeKey } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const RANGES: readonly string[] = ['all', 'today', '7d', '30d', '90d'];

export async function GET(request: Request): Promise<NextResponse> {
  const params = new URL(request.url).searchParams;
  const requested = params.get('range') ?? 'all';
  const range = (RANGES.includes(requested) ? requested : 'all') as RangeKey;
  const card = params.get('card') ?? 'estimated';
  const project = params.get('project') ?? 'all';
  const provider = params.get('provider') ?? 'all';
  // Custom bounds replace `range` when either one is present; buildStats
  // rejects a half-supplied or malformed pair.
  const from = params.get('from');
  const to = params.get('to');

  try {
    // buildStats awaits ensureCache() on every call: no TTL, no route cache.
    const stats = await buildStats({ range, from, to, card, project, provider });
    return NextResponse.json(stats, {
      headers: { 'cache-control': 'no-store, max-age=0' },
    });
  } catch (error) {
    if (error instanceof InvalidRangeError) {
      return NextResponse.json({ error: 'invalid_range', message: error.message }, { status: 400 });
    }
    console.error('[api/stats] failed', error);
    return NextResponse.json(
      {
        error: 'stats_unavailable',
        message: error instanceof Error ? error.message : 'unknown error',
      },
      { status: 500 },
    );
  }
}
