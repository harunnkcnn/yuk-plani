import type { Dict, Lang } from '../i18n';
import { formatters } from '../i18n';
import { STOP_COLORS } from '../lib/presets';
import type { CargoItem, Placement, PlanResult, Vehicle } from '../lib/types';

interface Props {
  title: string;
  vehicle: Vehicle;
  result: PlanResult;
  items: CargoItem[];
  t: Dict;
  lang: Lang;
}

interface Group {
  from: number;
  to: number;
  itemId: string;
  stop: number;
  count: number;
  xMin: number;
  xMax: number;
  zMax: number;
}

/** Consecutive units of the same item and stop become one line, so 600 cartons don't print 600 rows. */
function groupSequence(placements: Placement[]): Group[] {
  const groups: Group[] = [];
  for (const p of [...placements].sort((a, b) => a.seq - b.seq)) {
    const last = groups[groups.length - 1];
    if (last && last.itemId === p.itemId && last.stop === p.stop) {
      last.to = p.seq;
      last.count += 1;
      last.xMin = Math.min(last.xMin, p.x);
      last.xMax = Math.max(last.xMax, p.x + p.l);
      last.zMax = Math.max(last.zMax, p.z);
    } else {
      groups.push({ from: p.seq, to: p.seq, itemId: p.itemId, stop: p.stop, count: 1, xMin: p.x, xMax: p.x + p.l, zMax: p.z });
    }
  }
  return groups;
}

const stopColor = (stop: number) => STOP_COLORS[(stop - 1) % STOP_COLORS.length]!;

export function PrintPlan({ title, vehicle, result, items, t, lang }: Props) {
  const fmt = formatters(lang);
  const names = new Map(items.map((i) => [i.id, i.name]));
  const groups = groupSequence(result.placements);
  const stops = [...new Set(result.placements.map((p) => p.stop))].sort((a, b) => a - b);
  const L = vehicle.length;
  const today = new Date().toLocaleDateString(lang === 'tr' ? 'tr-TR' : 'en-GB');

  return (
    <article className="print-plan" aria-hidden="true">
      <header>
        <h1>
          {t.printPlan.title}
          {title && `: ${title}`}
        </h1>
        <p>
          {t.printPlan.date}: {today} · {t.printPlan.vehicle}: {t.presets[vehicle.presetId] ?? t.presets.custom}, {fmt.m2(vehicle.length)} × {fmt.m2(vehicle.width)} × {fmt.m2(vehicle.height)} m
        </p>
        <p>
          {t.stats.units}: {result.placements.length}/{result.totalUnits} · {t.stats.weight}: {fmt.int(result.loadedWeight)} kg · {fmt.dec2(result.ldm)} {t.ldm}
        </p>
      </header>

      <h2>{t.printPlan.topView}</h2>
      <svg className="print-view" viewBox={`-20 -20 ${L + 40} ${vehicle.width + 40}`}>
        <rect x={0} y={0} width={L} height={vehicle.width} fill="none" stroke="#000" strokeWidth={20} />
        {[...result.placements].sort((a, b) => a.z - b.z).map((p) => (
          <rect key={p.seq} x={p.x + 10} y={p.y + 10} width={p.l - 20} height={p.w - 20} fill={stopColor(p.stop)} stroke="#000" strokeWidth={8} fillOpacity={0.85} />
        ))}
      </svg>

      <h2>{t.printPlan.sideView}</h2>
      <svg className="print-view" viewBox={`-20 -20 ${L + 40} ${vehicle.height + 40}`}>
        <rect x={0} y={0} width={L} height={vehicle.height} fill="none" stroke="#000" strokeWidth={20} />
        {[...result.placements].sort((a, b) => b.y - a.y).map((p) => (
          <rect key={p.seq} x={p.x + 10} y={vehicle.height - p.z - p.h + 10} width={p.l - 20} height={p.h - 20} fill={stopColor(p.stop)} stroke="#000" strokeWidth={8} fillOpacity={0.85} />
        ))}
      </svg>

      <p className="legend">
        {stops.map((s) => (
          <span key={s}>
            <i style={{ background: stopColor(s) }} /> {t.stop} {s}
          </span>
        ))}
        <span>{t.printPlan.unloadOrder}</span>
      </p>

      <h2>{t.printPlan.sequence}</h2>
      <table>
        <thead>
          <tr>
            <th>{t.printPlan.order}</th>
            <th>{t.printPlan.item}</th>
            <th>{t.qty}</th>
            <th>{t.stop}</th>
            <th>{t.printPlan.position}</th>
            <th aria-label="✓" />
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <tr key={g.from}>
              <td>{g.from === g.to ? g.from + 1 : `${g.from + 1}–${g.to + 1}`}</td>
              <td>{names.get(g.itemId) ?? '—'}</td>
              <td>{g.count}</td>
              <td>{g.stop}</td>
              <td>
                {fmt.m1(g.xMin)}–{fmt.m1(g.xMax)} m
                {g.zMax > 0 ? ` · ↑ ${fmt.m1(g.zMax)} m` : ''}
              </td>
              <td className="tick-box" />
            </tr>
          ))}
        </tbody>
      </table>

      <footer>
        <span>{t.printPlan.signature}: ____________________</span>
        <span>{t.printPlan.generated}</span>
      </footer>
    </article>
  );
}
