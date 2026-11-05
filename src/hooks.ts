import { useEffect, useRef, useState } from 'react';
import type { PlanRequest, PlanResponse } from './plan.worker';
import type { CargoItem, PlanOptions, PlanResult, Vehicle } from './lib/types';

/**
 * Re-plans in a Web Worker whenever inputs change (debounced), so typing in
 * the cargo list never freezes the 3D view. Stale answers are discarded.
 */
export function usePlan(vehicle: Vehicle, items: CargoItem[], options: PlanOptions) {
  const [result, setResult] = useState<PlanResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const worker = useRef<Worker | null>(null);
  const latest = useRef(0);

  useEffect(() => {
    const w = new Worker(new URL('./plan.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (event: MessageEvent<PlanResponse>) => {
      if (event.data.id !== latest.current) return;
      setBusy(false);
      if (event.data.result) {
        setResult(event.data.result);
        setError(null);
      } else {
        setError(event.data.error ?? 'Unknown error');
      }
    };
    worker.current = w;
    return () => w.terminate();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!worker.current) return;
      latest.current += 1;
      setBusy(true);
      const request: PlanRequest = { id: latest.current, vehicle, items, options };
      worker.current.postMessage(request);
    }, 250);
    return () => clearTimeout(timer);
  }, [vehicle, items, options]);

  return { result, busy, error };
}

/** useState mirrored to localStorage; storage failures (private mode, blocked) are ignored. */
export function useStored<T>(key: string, initial: () => T, validate: (v: unknown) => v is T): [T, (v: T | ((p: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) {
        const parsed: unknown = JSON.parse(raw);
        if (validate(parsed)) return parsed;
      }
    } catch {
      /* storage unavailable */
    }
    return initial();
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage unavailable */
    }
  }, [key, value]);
  return [value, setValue];
}
