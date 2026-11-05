import type { Dict, Lang } from '../i18n';
import { formatters } from '../i18n';
import type { CargoItem, ItemKind } from '../lib/types';
import { NumField } from './NumField';

interface Props {
  items: CargoItem[];
  placedCount: Map<string, number>;
  onChange: (id: string, patch: Partial<CargoItem>) => void;
  onRemove: (id: string) => void;
  t: Dict;
  lang: Lang;
}

const KINDS: ItemKind[] = ['pallet', 'box', 'long'];

export function CargoList({ items, placedCount, onChange, onRemove, t, lang }: Props) {
  const fmt = formatters(lang);
  if (items.length === 0) return <p className="empty">{t.emptyCargo}</p>;
  return (
    <ul className="cargo">
      {items.map((item) => {
        const placed = placedCount.get(item.id) ?? 0;
        const short = placed < item.quantity;
        const set = (patch: Partial<CargoItem>) => onChange(item.id, patch);
        return (
          <li key={item.id} className="cargo-item" style={{ '--swatch': item.color } as React.CSSProperties}>
            <div className="cargo-head">
              <label className="swatch" title={t.colorItem}>
                <span className="visually-hidden">{`${item.name}: ${t.colorItem}`}</span>
                <input type="color" value={item.color} onChange={(e) => set({ color: e.target.value })} />
              </label>
              <label className="name-field">
                <span className="visually-hidden">{t.itemName}</span>
                <input value={item.name} maxLength={80} onChange={(e) => set({ name: e.target.value })} />
              </label>
              <label className="kind-field">
                <span className="visually-hidden">{`${item.name}: ${t.kindLabel[item.kind]}`}</span>
                <select value={item.kind} onChange={(e) => set({ kind: e.target.value as ItemKind })}>
                  {KINDS.map((k) => (
                    <option key={k} value={k}>
                      {t.kindLabel[k]}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" className="icon-btn" onClick={() => onRemove(item.id)} aria-label={t.remove(item.name || '—')}>
                <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="cargo-dims">
              <NumField label={t.length} value={item.length} onChange={(n) => set({ length: n })} min={1} max={30000} integer suffix="mm" />
              <NumField label={t.width} value={item.width} onChange={(n) => set({ width: n })} min={1} max={5000} integer suffix="mm" />
              <NumField label={t.height} value={item.height} onChange={(n) => set({ height: n })} min={1} max={5000} integer suffix="mm" />
            </div>
            <div className="cargo-dims">
              <NumField label={t.unitWeight} value={item.weight} onChange={(n) => set({ weight: n })} max={100000} suffix="kg" />
              <NumField label={t.qty} value={item.quantity} onChange={(n) => set({ quantity: n })} max={2500} integer />
              <NumField label={t.stop} value={item.stop} onChange={(n) => set({ stop: n })} min={1} max={99} integer />
            </div>
            <div className="cargo-foot">
              <label className="check">
                <input type="checkbox" checked={item.stackable} onChange={(e) => set({ stackable: e.target.checked })} />
                {t.stackable}
              </label>
              <label className="check">
                <input type="checkbox" checked={item.rotatable} onChange={(e) => set({ rotatable: e.target.checked })} />
                {t.rotatable}
              </label>
              <span className={`placed${short ? ' is-short' : ''}`}>
                {t.placedOf(placed, item.quantity)} · {fmt.int(item.weight * item.quantity)} kg
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
