import type { Dict, Lang } from '../i18n';
import { formatters } from '../i18n';
import { judgeBalance } from '../lib/balance';
import type { CargoItem, PlanResult, Vehicle } from '../lib/types';

interface Props {
  vehicle: Vehicle;
  result: PlanResult;
  items: CargoItem[];
  t: Dict;
  lang: Lang;
}

export function Summary({ vehicle, result, items, t, lang }: Props) {
  const fmt = formatters(lang);
  const capacity = vehicle.length * vehicle.width * vehicle.height;
  const volumeShare = capacity > 0 ? result.loadedVolume / capacity : 0;
  const weightShare = vehicle.payload > 0 ? result.loadedWeight / vehicle.payload : 0;
  const b = result.balance;
  const judged = b ? judgeBalance(vehicle, b) : null;
  const worst = judged ? (['bad', 'watch', 'ok'] as const).find((l) => judged.lateral === l || judged.longitudinal === l)! : null;
  const unplacedUnits = result.unplaced.reduce((s, u) => s + u.count, 0);
  const names = new Map(items.map((i) => [i.id, i.name]));

  return (
    <section className="summary" aria-label={t.stats.units}>
      <dl className="stats">
        <div>
          <dt>{t.stats.units}</dt>
          <dd>
            {fmt.int(result.placements.length)}
            <small> / {fmt.int(result.totalUnits)}</small>
          </dd>
        </div>
        <div>
          <dt>{t.stats.volume}</dt>
          <dd>
            %{fmt.pct(volumeShare)}
            <Meter value={volumeShare} />
          </dd>
        </div>
        <div>
          <dt>{t.stats.weight}</dt>
          <dd>
            {fmt.int(result.loadedWeight)}
            <small> / {fmt.int(vehicle.payload)} kg</small>
            <Meter value={weightShare} />
          </dd>
        </div>
        <div>
          <dt>{t.stats.balance}</dt>
          <dd className={worst ? `level is-${worst}` : 'level'}>{worst ? t.balanceText[worst] : '—'}</dd>
        </div>
      </dl>

      {b && (
        <ul className="notes">
          <li>{t.cogFromFront(fmt.m2(b.cogX), Math.round((b.cogX / vehicle.length) * 100))}</li>
          <li>
            {Math.abs(b.lateralOffset) < 5
              ? `${t.lateral('0', t.center)}`
              : t.lateral(fmt.int(Math.abs(b.lateralOffset)), b.lateralOffset > 0 ? t.right : t.left)}
          </li>
          {b.kingpinLoad !== undefined && b.axleLoad !== undefined && (
            <li>{b.kingpinLoad < 0 ? <strong className="warn">{t.negativeKingpin}</strong> : t.axleSplit(fmt.int(b.kingpinLoad), fmt.int(b.axleLoad))}</li>
          )}
          <li className="fine">{t.estimateNote}</li>
        </ul>
      )}

      {unplacedUnits > 0 ? (
        <div className="unplaced" role="alert">
          <strong>{t.unplacedTitle(unplacedUnits)}</strong>
          <ul>
            {result.unplaced.map((u) => (
              <li key={`${u.itemId}:${u.reason}`}>
                {names.get(u.itemId) ?? '—'}: {u.count} · {t.reasons[u.reason]}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        result.totalUnits > 0 && <p className="all-loaded">{t.allLoaded}</p>
      )}
    </section>
  );
}

function Meter({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(1, value));
  return (
    <span className={`meter${value > 0.95 ? ' is-full' : ''}`} aria-hidden="true">
      <span style={{ width: `${clamped * 100}%` }} />
    </span>
  );
}
