/// <reference lib="webworker" />
import { plan } from './lib/pack';
import type { CargoItem, PlanOptions, PlanResult, Vehicle } from './lib/types';

export interface PlanRequest {
  id: number;
  vehicle: Vehicle;
  items: CargoItem[];
  options: PlanOptions;
}

export interface PlanResponse {
  id: number;
  result?: PlanResult;
  error?: string;
}

self.onmessage = (event: MessageEvent<PlanRequest>) => {
  const { id, vehicle, items, options } = event.data;
  try {
    const response: PlanResponse = { id, result: plan(vehicle, items, options) };
    self.postMessage(response);
  } catch (error) {
    const response: PlanResponse = { id, error: String(error) };
    self.postMessage(response);
  }
};
