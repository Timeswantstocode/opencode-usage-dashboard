import type { Badge } from '@/lib/flexStats';
import s from './Achievements.module.css';

export function Achievements({ badges }: { badges: Badge[] }) {
  const earned = badges.filter((badge) => badge.earned).length;

  return (
    <div className={s.wrap}>
      <div className={s.head}>
        <span className={s.count}>
          {earned} / {badges.length}
        </span>
        <span className={s.caption}>earned</span>
      </div>
      <ul className={s.grid} aria-label="Achievements">
        {badges.map((badge) => (
          <li key={badge.id} className={`${s.badge} ${badge.earned ? s.earned : s.unearned}`}>
            <span className={s.dot} aria-hidden="true" />
            <span className={s.name}>{badge.name}</span>
            <span className={s.detail}>{badge.detail}</span>
            <span className={s.srOnly}>{badge.earned ? 'Earned' : 'Not earned'}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
