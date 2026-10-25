import type { ReactNode } from 'react';
import styles from './DataTable.module.css';

const costFormat = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const oneDecimal = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
const twoDecimals = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const whole = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/** `$0.00`, `$1.23`, `$1,203.20`. */
export function formatCost(value: number): string {
  return `$${costFormat.format(value)}`;
}

/** `9.96B`, `418.9M`, `12.4K`. */
export function formatTokensShort(value: number): string {
  const magnitude = Math.abs(value);
  if (magnitude >= 1e9) return `${twoDecimals.format(value / 1e9)}B`;
  if (magnitude >= 1e6) return `${oneDecimal.format(value / 1e6)}M`;
  if (magnitude >= 1e3) return `${oneDecimal.format(value / 1e3)}K`;
  return whole.format(value);
}

/** One muted line where a table body would otherwise be an empty grid. */
export function EmptyRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td className={styles.empty} colSpan={colSpan}>
        {children}
      </td>
    </tr>
  );
}
