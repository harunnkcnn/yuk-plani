import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CargoList } from './components/CargoList';
import { ImportDialog } from './components/ImportDialog';
import { LoadStrip } from './components/LoadStrip';
import { PrintPlan } from './components/PrintPlan';
import { Summary } from './components/Summary';
import { VehiclePanel } from './components/VehiclePanel';
import type { ColorBy, Look, ViewName } from './components/Viewer3D';
import { download } from './download';
import { usePlan, useStored } from './hooks';
import { detectLang, dictionaries, type Lang } from './i18n';
import { DEFAULT_OPTIONS } from './lib/pack';
import { itemFromTemplate, sampleItems, vehiclePreset } from './lib/presets';
import { decodeState, encodeState } from './lib/share';
import { toCsv } from './lib/table';
import type { CargoItem, PlanOptions, Vehicle } from './lib/types';

type Theme = 'system' | 'light' | 'dark';

// three.js is most of the bundle; the sidebar and plan work before it arrives.
const Viewer3D = lazy(() => import('./components/Viewer3D').then((m) => ({ default: m.Viewer3D })));

const isLang = (v: unknown): v is Lang => v === 'tr' || v === 'en';
const isTheme = (v: unknown): v is Theme => v === 'system' || v === 'light' || v === 'dark';
const isString = (v: unknown): v is string => typeof v === 'string';
const isVehicle = (v: unknown): v is Vehicle =>
  !!v && typeof v === 'object' && ['length', 'width', 'height', 'payload'].every((k) => typeof (v as Record<string, unknown>)[k] === 'number');
const isItems = (v: unknown): v is CargoItem[] =>
  Array.isArray(v) && v.every((i) => i && typeof i === 'object' && typeof i.id === 'string' && typeof i.length === 'number' && typeof i.quantity === 'number');
const isOptions = (v: unknown): v is PlanOptions => !!v && typeof v === 'object' && typeof (v as PlanOptions).respectStops === 'boolean' && typeof (v as PlanOptions).minSupport === 'number';

/** A shared link wins over local storage; it is read once and removed from the address bar. */
function readSharedLink() {
  const match = /^#p=([\w-]+)$/.exec(location.hash);
  if (!match) return null;
  const state = decodeState(match[1]!);
  history.replaceState(null, '', location.pathname + location.search);
  return state;
}
const shared = typeof location !== 'undefined' ? readSharedLink() : null;
if (shared) {
  try {
    localStorage.setItem('yp.vehicle', JSON.stringify(shared.vehicle));
    localStorage.setItem('yp.items', JSON.stringify(shared.items));
    localStorage.setItem('yp.options', JSON.stringify(shared.options));
    localStorage.setItem('yp.title', JSON.stringify(shared.title));
  } catch {
    /* storage unavailable: the state below still uses the shared plan */
  }
}

export default function App() {
  const [lang, setLang] = useStored<Lang>('yp.lang', detectLang, isLang);
  const [theme, setTheme] = useStored<Theme>('yp.theme', () => 'system', isTheme);
  const [vehicle, setVehicle] = useStored<Vehicle>('yp.vehicle', () => shared?.vehicle ?? vehiclePreset('tir'), isVehicle);
  const [items, setItems] = useStored<CargoItem[]>('yp.items', () => shared?.items ?? sampleItems(detectLang()), isItems);
  const [options, setOptions] = useStored<PlanOptions>('yp.options', () => shared?.options ?? DEFAULT_OPTIONS, isOptions);
  const [title, setTitle] = useStored<string>('yp.title', () => shared?.title ?? '', isString);
  const t = dictionaries[lang];

  const [view, setView] = useState<ViewName>('iso');
  const [colorBy, setColorBy] = useState<ColorBy>('item');
  const [look, setLook] = useStored<Look>('yp.look', () => 'real', (v): v is Look => v === 'real' || v === 'schematic');
  const [importOpen, setImportOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(shared ? dictionaries[lang].sharedLoaded : null);
  const [systemDark, setSystemDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches);

  const { result, busy } = usePlan(vehicle, items, options);
  const total = result?.placements.length ?? 0;
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const playTimer = useRef<number | null>(null);

  useEffect(() => {
    setPlaying(false);
    setStep(result?.placements.length ?? 0);
  }, [result]);

  // Playback is started by the user, so it runs even with "reduce motion" on
  // (Windows "Show animations: off" sets that); it only adds boxes, nothing slides.
  useEffect(() => {
    if (!playing) return;
    const delay = Math.max(25, Math.min(220, 6000 / Math.max(1, total)));
    playTimer.current = window.setInterval(() => setStep((s) => Math.min(total, s + 1)), delay);
    return () => {
      if (playTimer.current) clearInterval(playTimer.current);
    };
  }, [playing, total]);

  useEffect(() => {
    if (playing && step >= total) setPlaying(false);
  }, [playing, step, total]);

  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const on = () => setSystemDark(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const resolvedTheme = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;
  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = `${t.appName}: ${t.tagline}`;
    if (theme === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
  }, [lang, theme, t]);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(id);
  }, [notice]);

  const placedCount = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of result?.placements ?? []) map.set(p.itemId, (map.get(p.itemId) ?? 0) + 1);
    return map;
  }, [result]);

  const updateItem = useCallback((id: string, patch: Partial<CargoItem>) => setItems((list) => list.map((i) => (i.id === id ? { ...i, ...patch } : i))), [setItems]);
  const removeItem = useCallback((id: string) => setItems((list) => list.filter((i) => i.id !== id)), [setItems]);
  const addTemplate = (templateId: string, name: string) => setItems((list) => [...list, itemFromTemplate(templateId, `${name} ${list.length + 1}`, list.length)]);

  const share = async () => {
    const url = `${location.origin}${location.pathname}#p=${encodeState({ vehicle, items, options, title })}`;
    try {
      await navigator.clipboard.writeText(url);
      setNotice(t.copied);
    } catch {
      history.replaceState(null, '', url);
      setNotice(t.shareFailed);
    }
  };

  const fileSlug = (title || t.appName).toLocaleLowerCase('tr').replace(/[^a-z0-9ğüşıöç]+/gi, '-').replace(/^-|-$/g, '') || 'yuk-plani';

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="./" aria-label={t.appName}>
          <Logo />
          <span>
            <strong>{t.appName}</strong>
            <small>{t.tagline}</small>
          </span>
        </a>
        <div className="top-actions">
          <button type="button" className="btn" onClick={() => window.print()} disabled={!result}>
            {t.print}
          </button>
          <button type="button" className="btn btn-primary" onClick={share}>
            {t.share}
          </button>
          <div className="seg" role="group" aria-label={t.language}>
            {(['tr', 'en'] as const).map((l) => (
              <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)} lang={l}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>
          <label>
            <span className="visually-hidden">{t.theme}</span>
            <select className="compact" value={theme} onChange={(e) => setTheme(e.target.value as Theme)} aria-label={t.theme}>
              {(['system', 'light', 'dark'] as const).map((v) => (
                <option key={v} value={v}>
                  {t.themes[v]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <div className="workspace">
        <aside className="sidebar">
          <label className="field title-field">
            <span className="field-label">{t.planTitle}</span>
            <input value={title} maxLength={120} placeholder={t.planTitlePlaceholder} onChange={(e) => setTitle(e.target.value)} />
          </label>

          <VehiclePanel vehicle={vehicle} onVehicle={setVehicle} options={options} onOptions={setOptions} t={t} />

          <section className="panel-section" aria-labelledby="cargo-h">
            <div className="section-head">
              <h2 id="cargo-h">{t.cargo}</h2>
              <span className="count">{items.reduce((s, i) => s + i.quantity, 0)}</span>
            </div>
            <div className="add-row" role="group" aria-label={t.addFrom}>
              <button type="button" className="chip" onClick={() => addTemplate('euro', t.addPallet)}>
                + {t.addPallet}
              </button>
              <button type="button" className="chip" onClick={() => addTemplate('industrial', t.addIndustrial)}>
                + {t.addIndustrial}
              </button>
              <button type="button" className="chip" onClick={() => addTemplate('box', t.addBox)}>
                + {t.addBox}
              </button>
              <button type="button" className="chip" onClick={() => addTemplate('long', t.addLong)}>
                + {t.addLong}
              </button>
            </div>
            <div className="add-row">
              <button type="button" className="btn btn-small" onClick={() => setImportOpen(true)}>
                {t.importPaste}
              </button>
              <button type="button" className="btn btn-small btn-quiet" onClick={() => download(toCsv(items, lang), `${fileSlug}.csv`, 'text/csv;charset=utf-8')} disabled={items.length === 0}>
                {t.exportCsv}
              </button>
            </div>
            <CargoList items={items} placedCount={placedCount} onChange={updateItem} onRemove={removeItem} t={t} lang={lang} />
            <div className="add-row end">
              <button type="button" className="btn btn-small btn-quiet" onClick={() => setItems(sampleItems(lang))}>
                {t.loadSample}
              </button>
              <button type="button" className="btn btn-small btn-quiet" onClick={() => setItems([])} disabled={items.length === 0}>
                {t.clearCargo}
              </button>
            </div>
          </section>
          <p className="privacy">{t.privacy}</p>
        </aside>

        <main className="stage">
          <div className="stage-view">
            <Suspense fallback={<span className="busy">{t.planning}</span>}>
              <Viewer3D vehicle={vehicle} placements={result?.placements ?? []} items={items} colorBy={colorBy} look={look} step={step} view={view} theme={resolvedTheme} t={t} lang={lang} />
            </Suspense>
            <div className="view-controls">
              <div className="seg" role="group" aria-label={t.viewLabel}>
                {(['iso', 'top', 'side', 'rear'] as const).map((v) => (
                  <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>
                    {t.views[v]}
                  </button>
                ))}
              </div>
              <div className="seg" role="group" aria-label={t.lookLabel}>
                <button type="button" aria-pressed={look === 'real'} onClick={() => setLook('real')}>
                  {t.lookReal}
                </button>
                <button type="button" aria-pressed={look === 'schematic'} onClick={() => setLook('schematic')}>
                  {t.lookSchematic}
                </button>
              </div>
              <div className="seg" role="group" aria-label={t.colorBy}>
                <button type="button" aria-pressed={colorBy === 'item'} onClick={() => setColorBy('item')}>
                  {t.colorItem}
                </button>
                <button type="button" aria-pressed={colorBy === 'stop'} onClick={() => setColorBy('stop')}>
                  {t.colorStop}
                </button>
              </div>
            </div>
            {busy && (
              <span className="busy" role="status">
                {t.planning}
              </span>
            )}
            {notice && (
              <span className="toast" role="status">
                {notice}
              </span>
            )}
            <div className="stepper">
              <button
                type="button"
                className="icon-btn play"
                onClick={() => {
                  if (!playing && step >= total) setStep(0);
                  setPlaying((p) => !p);
                }}
                aria-label={playing ? t.pause : t.play}
                disabled={total === 0}
              >
                {playing ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M7 5h3v14H7zM14 5h3v14h-3z" fill="currentColor" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M7 4.5v15l12-7.5z" fill="currentColor" />
                  </svg>
                )}
              </button>
              <label className="step-range">
                <span className="visually-hidden">{t.step}</span>
                <input
                  type="range"
                  min={0}
                  max={total}
                  value={Math.min(step, total)}
                  onChange={(e) => {
                    setPlaying(false);
                    setStep(Number(e.target.value));
                  }}
                  aria-valuetext={t.stepOf(Math.min(step, total), total)}
                />
              </label>
              <span className="step-text">
                {t.step} {t.stepOf(Math.min(step, total), total)}
              </span>
            </div>
          </div>

          {result && <LoadStrip vehicle={vehicle} result={result} items={items} colorBy={colorBy} step={step} t={t} lang={lang} />}
          {result && <Summary vehicle={vehicle} result={result} items={items} t={t} lang={lang} />}
          <footer className="site-foot">
            <span>{t.footer}</span>
            <a href="https://github.com/harunnkcnn/yuk-plani">GitHub</a>
          </footer>
        </main>
      </div>

      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImport={(list, mode) => setItems((current) => (mode === 'replace' ? list : [...current, ...list]))}
        colorOffset={items.length}
        t={t}
        lang={lang}
      />
      {result && <PrintPlan title={title} vehicle={vehicle} result={result} items={items} t={t} lang={lang} />}
    </div>
  );
}

function Logo() {
  return (
    <svg width="34" height="34" viewBox="0 0 32 32" aria-hidden="true">
      <rect x="1.5" y="7" width="22" height="14" rx="1.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="4.5" y="13" width="6" height="5" fill="var(--signal)" />
      <rect x="11.5" y="13" width="6" height="5" fill="var(--signal)" />
      <rect x="4.5" y="10" width="6" height="2.4" fill="var(--signal)" opacity="0.6" />
      <path d="M23.5 11h4l3 4v6h-7z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="7" cy="24.5" r="2.5" fill="currentColor" />
      <circle cx="26" cy="24.5" r="2.5" fill="currentColor" />
    </svg>
  );
}
