import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultScoutingConfig } from '@fhm/engine';
import { canonicalScoutingConfig, hashScoutingConfig } from '../src/services/scouting-config.js';
import { getRepoRoot } from '../src/initialization/paths.js';

describe('F26 scouting', () => {
  it('ships the F26 migration', () => {
    expect(existsSync(join(getRepoRoot(), 'packages', 'server', 'prisma', 'migrations', '20260716000000_f26_scouting', 'migration.sql'))).toBe(true);
  });

  it('canonicalizes the default calibration deterministically', () => {
    const config = defaultScoutingConfig();
    expect(canonicalScoutingConfig(config)).toBe(canonicalScoutingConfig(config));
    expect(hashScoutingConfig(config)).toBe(hashScoutingConfig(config));
  });
});
