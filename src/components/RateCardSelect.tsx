'use client';

import { isCardId, rateCardMeta } from '@/lib/pricing';
import type { CardId, RateCardMeta } from '@/lib/types';

export function RateCardSelect({
  value,
  onChange,
  cards = rateCardMeta,
}: {
  value: CardId;
  onChange: (card: CardId) => void;
  cards?: RateCardMeta[];
}) {
  return (
    <label className="rate-select">
      <span className="sr-only">Rate card</span>
      <select
        value={value}
        onChange={(event) => {
          const next = event.target.value;
          if (isCardId(next)) onChange(next);
        }}
        aria-label="Rate card"
      >
        {cards.map((card) => (
          <option key={card.id} value={card.id}>
            {card.label}
          </option>
        ))}
      </select>
    </label>
  );
}
