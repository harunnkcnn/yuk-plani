import type { Dict } from '../i18n';
import { VEHICLE_PRESETS, vehiclePreset } from '../lib/presets';
import type { PlanOptions, Vehicle } from '../lib/types';
import { NumField } from './NumField';

interface Props {
  vehicle: Vehicle;
  onVehicle: (v: Vehicle) => void;
  options: PlanOptions;
  onOptions: (o: PlanOptions) => void;
  t: Dict;
}

export function VehiclePanel({ vehicle, onVehicle, options, onOptions, t }: Props) {
  const edit = (patch: Partial<Vehicle>) => onVehicle({ ...vehicle, ...patch, presetId: 'custom' });
  return (
    <section className="panel-section" aria-labelledby="vehicle-h">
      <h2 id="vehicle-h">{t.vehicle}</h2>
      <label className="field">
        <span className="visually-hidden">{t.vehicle}</span>
        <select
          value={vehicle.presetId}
          onChange={(e) => {
            if (e.target.value !== 'custom') onVehicle(vehiclePreset(e.target.value));
          }}
        >
          {VEHICLE_PRESETS.map((p) => (
            <option key={p.presetId} value={p.presetId}>
              {t.presets[p.presetId]}
            </option>
          ))}
          {vehicle.presetId === 'custom' && <option value="custom">{t.presets.custom}</option>}
        </select>
      </label>
      <div className="grid-3">
        <NumField label={t.length} value={vehicle.length} onChange={(n) => edit({ length: n })} min={500} max={30000} integer suffix="mm" />
        <NumField label={t.width} value={vehicle.width} onChange={(n) => edit({ width: n })} min={500} max={5000} integer suffix="mm" />
        <NumField label={t.height} value={vehicle.height} onChange={(n) => edit({ height: n })} min={500} max={5000} integer suffix="mm" />
      </div>
      <NumField label={t.payload} value={vehicle.payload} onChange={(n) => edit({ payload: n })} min={1} max={100000} integer suffix="kg" className="wide" />
      <p className="hint">{t.presetNote}</p>
      {vehicle.kind === 'semi' && (
        <details className="advanced">
          <summary>{t.advanced}</summary>
          <div className="grid-2">
            <NumField label={t.kingpin} value={vehicle.kingpinX ?? 1600} onChange={(n) => edit({ kingpinX: n })} max={vehicle.length} integer suffix="mm" />
            <NumField label={t.axle} value={vehicle.axleX ?? 9300} onChange={(n) => edit({ axleX: n })} max={vehicle.length} integer suffix="mm" />
          </div>
        </details>
      )}

      <h2 className="sub">{t.options}</h2>
      <label className="check block">
        <input type="checkbox" checked={options.respectStops} onChange={(e) => onOptions({ ...options, respectStops: e.target.checked })} aria-describedby="stops-help" />
        {t.respectStops}
      </label>
      <p className="hint" id="stops-help">
        {t.respectStopsHelp}
      </p>
      <label className="field">
        <span className="field-label">{t.minSupport}</span>
        <select value={options.minSupport} onChange={(e) => onOptions({ ...options, minSupport: Number(e.target.value) })}>
          {[0.6, 0.75, 0.9, 1].map((v) => (
            <option key={v} value={v}>
              %{Math.round(v * 100)}
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}
