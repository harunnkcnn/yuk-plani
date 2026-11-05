import type { Dict, Lang } from '../i18n';
import { formatters } from '../i18n';
import { STOP_COLORS } from '../lib/presets';
import type { CargoItem, PlanResult, Vehicle } from '../lib/types';
import type { ColorBy } from './Viewer3D';

interface Props {
  vehicle: Vehicle;
  result: PlanResult;
  items: CargoItem[];
  colorBy: ColorBy;
  step: number;
  t: Dict;
  lang: Lang;
}

/**
 * The cargo floor seen from above, drawn to scale as a ruler: metre ticks,
 * used loading metres, centre of gravity, and kingpin/axles on trailers.
 */
export function LoadStrip({ vehicle, result, items, colorBy, step, t, lang }: Props) {
  const fmt = formatters(lang);
  const L = vehicle.length;
  const W = vehicle.width;
  const byId = new Map(items.map((i) => [i.id, i]));
  const visible = result.placements.filter((p) => p.seq < step).sort((a, b) => a.z - b.z);
  const metres = Math.floor(L / 1000);
  const pct = (x: number) => `${(x / L) * 100}%`;
  const b = result.balance;

  return (
    <section className="strip" aria-label={t.ruler}>
      <div className="ldm" title={t.ldmHelp}>
        <span className="ldm-value">{fmt.dec2(result.ldm)}</span>
        <span className="ldm-unit">{t.ldm}</span>
      </div>
      <div className="strip-body">
        <div className="strip-ends">
          <span>{t.front}</span>
          <span>{t.door}</span>
        </div>
        <div className="strip-floor" style={{ aspectRatio: `${L} / ${W}` }}>
          <svg viewBox={`0 0 ${L} ${W}`} preserveAspectRatio="none" role="img" aria-label={`${t.ruler}: ${fmt.m2(result.usedLength)} / ${fmt.m2(L)} m`}>
            <rect x={0} y={0} width={L} height={W} className="strip-bg" />
            {visible.map((p) => (
              <rect
                key={p.seq}
                x={p.x + 8}
                y={p.y + 8}
                width={Math.max(0, p.l - 16)}
                height={Math.max(0, p.w - 16)}
                fill={colorBy === 'stop' ? STOP_COLORS[(p.stop - 1) % STOP_COLORS.length] : (byId.get(p.itemId)?.color ?? '#888')}
              />
            ))}
            {result.usedLength > 0 && <line x1={result.usedLength} x2={result.usedLength} y1={0} y2={W} className="strip-used" />}
          </svg>
          {b && (
            <span className="marker cog" style={{ left: pct(b.cogX), top: `${(b.cogY / W) * 100}%` }} title={t.cog} aria-hidden="true" />
          )}
        </div>
        <div className={`strip-axis${vehicle.kind === 'semi' ? ' has-axles' : ''}`} aria-hidden="true">
          {Array.from({ length: metres + 1 }, (_, m) => (
            <span key={m} className={m % 2 === 0 ? 'tick major' : 'tick'} style={{ left: pct(m * 1000) }}>
              {m % 2 === 0 ? m : ''}
            </span>
          ))}
          {vehicle.kind === 'semi' && vehicle.kingpinX !== undefined && (
            <span className="axle-mark" style={{ left: pct(vehicle.kingpinX) }}>
              {t.kingpinShort}
            </span>
          )}
          {vehicle.kind === 'semi' && vehicle.axleX !== undefined && (
            <span className="axle-mark" style={{ left: pct(vehicle.axleX) }}>
              {t.axleShort}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
