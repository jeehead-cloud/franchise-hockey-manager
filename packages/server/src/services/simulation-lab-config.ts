import { SimulationHttpError } from './simulation-input.js';

export const SIMULATION_LAB_LIMITS = {
  maxCount: 1000,
  maxConcurrent: 2,
  maxRetained: 20,
  retentionMs: 30 * 60 * 1000,
  chunkSize: 25,
} as const;

export function isSimulationLabEnabled(): boolean {
  if (process.env.NODE_ENV === 'test') return true;
  if (process.env.NODE_ENV === 'development') {
    return process.env.FHM_SIMULATION_LAB_ENABLED !== 'false';
  }
  return process.env.FHM_SIMULATION_LAB_ENABLED === 'true';
}

export function assertSimulationLabEnabled(): void {
  if (!isSimulationLabEnabled()) {
    throw new SimulationHttpError(
      503,
      'SimulationLabDisabled',
      'Simulation Lab endpoints are disabled in this environment',
    );
  }
}
