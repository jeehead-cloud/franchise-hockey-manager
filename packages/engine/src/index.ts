/**
 * @fhm/engine — pure simulation/generation package (no I/O, no Fastify/Prisma/React).
 *
 * F1 ships a minimal wiring export only. Player generation, chemistry, and match
 * simulation arrive in later foundation milestones.
 */

export const ENGINE_NAME = '@fhm/engine' as const;
export const ENGINE_VERSION = '0.1.0' as const;

/** Smoke-test helper proving the package builds and imports correctly. */
export function getEngineInfo(): { name: typeof ENGINE_NAME; version: typeof ENGINE_VERSION } {
  return { name: ENGINE_NAME, version: ENGINE_VERSION };
}
