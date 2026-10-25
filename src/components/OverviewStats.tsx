import type { StatsResponse } from '@/lib/types';
import { formatNumber, formatPercent, formatTokens, formatUsd } from '@/lib/format';
import s from './OverviewStats.module.css';

type Cell = {
  id: string;
  label: string;
  value: string;
  /** Optional qualifier line under the value. */
  sub?: string;
  /** One-line definition shown by the global hover layer. */
  tip: string;
};

/**
 * Twelve key figures in one ruled panel: token composition on the first row,
 * money and activity on the second. Values are set in the display serif; every
 * other number on the page stays mono. Everything here is range-scoped, so the
 * block moves with the global range selector.
 */
export function OverviewStats({ data }: { data: StatsResponse }) {
  const { tokens, sessions, messages } = data.totals;
  const cardLabel = data.rateCards.find((card) => card.id === data.card)?.label ?? data.card;
  const completion = tokens.output + tokens.reasoning;
  const perTurn = completion / Math.max(1, messages);
  const perSession = completion / Math.max(1, sessions);
  const perSessionMessages = messages / Math.max(1, sessions);

  /** Share of all tokens; two decimals while it stays under 0.1%. */
  const tokenShare = (part: number): string => {
    const share = tokens.total > 0 ? part / tokens.total : 0;
    return formatPercent(share, share < 0.001 ? 2 : 1);
  };

  const cells: Cell[] = [
    {
      id: 'total-tokens',
      label: 'Total tokens',
      value: formatTokens(tokens.total),
      sub: `${formatPercent(data.totals.cacheHitRate)} cached`,
      tip: 'Input, output, reasoning, cache read and cache write',
    },
    {
      id: 'input',
      label: 'Input',
      value: formatTokens(tokens.input),
      sub: `${tokenShare(tokens.input)} of tokens`,
      tip: 'Prompt tokens not served from cache',
    },
    {
      id: 'output',
      label: 'Output',
      value: formatTokens(tokens.output),
      sub: `${tokenShare(tokens.output)} of tokens`,
      tip: 'Completion text tokens',
    },
    {
      id: 'reasoning',
      label: 'Reasoning',
      value: formatTokens(tokens.reasoning),
      sub: `${tokenShare(tokens.reasoning)} of tokens`,
      tip: 'Thinking tokens',
    },
    {
      id: 'completion',
      label: 'Output + reasoning',
      value: formatTokens(completion),
      sub: `${tokenShare(completion)} of tokens`,
      tip: 'Billed at the output rate',
    },
    {
      id: 'cache-hit',
      label: 'Cache hit',
      value: formatPercent(data.totals.cacheHitRate),
      sub: `${formatTokens(tokens.cacheRead)} read`,
      tip: 'Share of prompt tokens served from cache',
    },
    {
      id: 'cost',
      label: 'Cost',
      value: formatUsd(data.totals.cost),
      sub: cardLabel,
      tip: 'Spend under the selected rate card',
    },
    {
      id: 'active-days',
      label: 'Active days',
      value: formatNumber(data.totals.activeDays),
      sub: `${formatNumber(data.totals.streak)} day streak`,
      tip: 'Days in the selection with at least one message',
    },
    {
      id: 'sessions',
      label: 'Sessions',
      value: formatNumber(sessions),
      sub: `${formatNumber(data.totals.subagents)} subagents`,
      tip: 'Conversations with at least one message',
    },
    {
      id: 'messages',
      label: 'Messages',
      value: formatNumber(messages),
      sub: `${formatNumber(perSessionMessages)} per session`,
      tip: 'Message rows in the selected range',
    },
    {
      id: 'per-turn',
      label: 'Completion / turn',
      value: formatNumber(perTurn),
      tip: 'Average tokens the model generated per reply in this range',
    },
    {
      id: 'per-session',
      label: 'Completion / session',
      value: formatTokens(perSession),
      tip: 'Average tokens the model generated per session in this range',
    },
  ];

  return (
    <section className={s.strip} aria-label="Key figures for the selected range">
      <dl className={s.list}>
        {cells.map((cell) => (
          <div className={s.cell} key={cell.id} tabIndex={0} data-tip={cell.tip}>
            <dt className={s.label}>{cell.label}</dt>
            <dd className={s.value}>{cell.value}</dd>
            {cell.sub ? <dd className={s.sub}>{cell.sub}</dd> : null}
          </div>
        ))}
      </dl>
    </section>
  );
}
