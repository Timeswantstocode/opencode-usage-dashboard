import { NextResponse } from 'next/server';
import { ensureCache, getCache } from '@/lib/db';
import { matchesBuiltInRule } from '@/lib/pricing';
import { PricingValidationError, loadPricing, parsePricingUpdate, savePricing } from '@/lib/pricingFile';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_STORE = { 'cache-control': 'no-store, max-age=0' };

type UnknownRow = {
  provider: string | null;
  model: string | null;
  tokens: number | null;
  messages: number;
};

/**
 * Current pricing state plus every provider/model pair in the cache that has
 * no built-in rule and no override, so the UI can show what is unpriced.
 */
async function pricingState() {
  await ensureCache();
  const db = getCache();
  const pricing = loadPricing();
  const overrides = new Set(Object.keys(pricing.models));

  const rows = db
    .prepare(
      `select provider, model, count(*) as messages,
        sum(coalesce(input, 0) + coalesce(output, 0) + coalesce(reasoning, 0) + coalesce(cache_read, 0) + coalesce(cache_write, 0)) as tokens
      from msg group by provider, model`,
    )
    .all() as UnknownRow[];

  const unknown = rows
    .filter((row) => {
      const model = row.model ?? 'unknown';
      return !matchesBuiltInRule(model) && !overrides.has(model.toLowerCase());
    })
    .map((row) => ({
      provider: row.provider ?? 'unknown',
      model: row.model ?? 'unknown',
      tokens: Math.round(row.tokens ?? 0),
      messages: row.messages,
    }))
    .sort((a, b) => b.tokens - a.tokens);

  return {
    fallback: pricing.fallback,
    fallbackLabel: pricing.fallbackLabel,
    models: pricing.models,
    unknown,
    path: pricing.path,
    warnings: pricing.warnings,
  };
}

export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json(await pricingState(), { headers: NO_STORE });
  } catch (error) {
    console.error('[api/pricing] failed', error);
    return NextResponse.json(
      { error: 'pricing_unavailable', message: error instanceof Error ? error.message : 'unknown error' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json', message: 'body must be JSON' }, { status: 400 });
  }

  try {
    savePricing(parsePricingUpdate(body));
    return NextResponse.json(await pricingState(), { headers: NO_STORE });
  } catch (error) {
    if (error instanceof PricingValidationError) {
      return NextResponse.json({ error: 'invalid_pricing', message: error.message }, { status: 400 });
    }
    console.error('[api/pricing] failed', error);
    return NextResponse.json(
      { error: 'pricing_unavailable', message: error instanceof Error ? error.message : 'unknown error' },
      { status: 500 },
    );
  }
}
