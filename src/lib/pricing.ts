import type { CardId, Rate, RateCardMeta } from './types';

/** A rate rule matches a model id exactly or by prefix (`mimo-`). */
export type RateRule = {
  match: string;
  mode: 'exact' | 'prefix';
  rate: Rate;
};

/** Per-model and fallback rates from `pricing.local.json`. */
export type RateOverrides = {
  fallback: Rate;
  /** Model id -> rate. Matched case-insensitively. */
  models: Record<string, Rate>;
};

export type RateCard = RateCardMeta & {
  /** First matching rule wins. */
  rules: RateRule[];
  /** Rate for a model that matches no rule and no override. */
  fallback?: Rate;
  /** Lowercase model id -> rate; wins over rules. */
  overrides?: ReadonlyMap<string, Rate>;
};

const ZERO: Rate = { input: 0, output: 0, cacheRead: 0 };

/** Fallback for models that have no known price. */
export const DEFAULT_FALLBACK: Rate = { input: 0.12, output: 0.48, cacheRead: 0.0024 };
export const DEFAULT_FALLBACK_LABEL = 'Default fallback';

/** The one model the metered card bills for. */
const METERED_ID = 'deepseek-ai/DeepSeek-V4.1-Flash-1017';

function exact(match: string, input: number, output: number, cacheRead: number): RateRule {
  return { match, mode: 'exact', rate: { input, output, cacheRead } };
}

/** Known list prices; anything else uses the default fallback. */
const ESTIMATED_RULES: RateRule[] = [
  exact('muse-spark-1.3-contributor-free', 0.1, 0.2, 0.002),
  exact('muse-spark-1.2-contributor-free', 0.1, 0.2, 0.002),
  exact('deepseek-v4.1-flash-free', 0.15, 0.6, 0.003),
  exact('deepseek-v4-flash-free', 0.14, 0.28, 0.028),
  exact('minimax-m3.1-flash-free', 0.15, 0.6, 0.015),
  exact('glm-5.3-flash-free', 0.15, 0.5, 0.03),
  exact('hy3-free', 0.14, 0.58, 0.035),
  exact('mimo-v2.5-free', 0.14, 0.28, 0.0028),
  exact('mimo-v2.6-flash-free', 0.14, 0.28, 0.0028),
  exact('step-5-preview-free', 1, 2.7, 0.1),
  exact(METERED_ID, 0.12, 0.48, 0.0024),
];

/** Only the model a provider actually invoices. */
const METERED_RULES: RateRule[] = [exact(METERED_ID, 0.12, 0.48, 0.0024)];

export const rateCards: RateCard[] = [
  {
    id: 'estimated',
    label: 'Estimated',
    description: 'Every model priced; unknown models use the default fallback.',
    rules: ESTIMATED_RULES,
    fallback: DEFAULT_FALLBACK,
  },
  {
    id: 'metered',
    label: 'Metered only',
    description: 'Only providers that actually bill; free-tier usage is $0.',
    rules: METERED_RULES,
    fallback: ZERO,
  },
];

export const rateCardMeta: RateCardMeta[] = rateCards.map(({ id, label, description }) => ({
  id,
  label,
  description,
}));

export function isCardId(value: string): value is CardId {
  return rateCards.some((card) => card.id === value);
}

export function getRateCard(id: string): RateCard {
  return rateCards.find((card) => card.id === id) ?? rateCards[0];
}

/**
 * Bind the local pricing file to a card. Per-model overrides win over the
 * built-in rules; the file's fallback replaces the estimated card's default;
 * the metered card keeps its zero fallback.
 */
export function applyPricing(card: RateCard, overrides: RateOverrides): RateCard {
  const models = new Map<string, Rate>();
  for (const [model, rate] of Object.entries(overrides.models)) models.set(model.toLowerCase(), rate);
  return {
    ...card,
    fallback: card.id === 'estimated' ? overrides.fallback : card.fallback,
    overrides: models,
  };
}

/** The card rate for a model: override, then rule, then the card fallback. */
export function resolveRate(card: RateCard, model: string): Rate {
  const override = card.overrides?.get(model.toLowerCase());
  if (override) return override;
  for (const rule of card.rules) {
    const hit = rule.mode === 'exact' ? model === rule.match : model.startsWith(rule.match);
    if (hit) return rule.rate;
  }
  return card.fallback ?? ZERO;
}

/** True when any built-in card prices this model (case-insensitive). */
export function matchesBuiltInRule(model: string): boolean {
  const lower = model.toLowerCase();
  return rateCards.some((card) =>
    card.rules.some((rule) =>
      rule.mode === 'exact' ? lower === rule.match.toLowerCase() : lower.startsWith(rule.match.toLowerCase()),
    ),
  );
}

function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function rateExpression(rate: Rate, alias: string): string {
  const col = (name: string) => `${alias}${name}`;
  return `(${col('input')} * ${rate.input} + (${col('output')} + ${col('reasoning')}) * ${rate.output} + ${col('cache_read')} * ${rate.cacheRead}) / 1000000.0`;
}

/**
 * SQL expression that yields the message cost in USD for a card.
 * Reasoning tokens are billed at the output rate.
 */
export function costSql(card: RateCard, alias = ''): string {
  const branches = [...(card.overrides ?? [])].map(
    ([model, rate]) => `when lower(${alias}model) = ${sqlLiteral(model)} then ${rateExpression(rate, alias)}`,
  );
  for (const rule of card.rules) {
    const condition =
      rule.mode === 'exact'
        ? `${alias}model = ${sqlLiteral(rule.match)}`
        : `${alias}model like ${sqlLiteral(`${rule.match}%`)}`;
    branches.push(`when ${condition} then ${rateExpression(rule.rate, alias)}`);
  }

  if (branches.length === 0) return rateExpression(card.fallback ?? ZERO, alias);
  return `case ${branches.join(' ')} else ${rateExpression(card.fallback ?? ZERO, alias)} end`;
}
