import { useMemo, useState } from 'react';
import type { BalanceConfig } from '@fhm/engine';
import { Button } from '../ui/Button';
import { Field, TextInput } from '../ui/DataBrowser';
import { Panel } from '../ui/Panel';
import type { BalanceValidationPreview } from '../../lib/api';

function hashPrefix(hash: string): string {
  return hash.length >= 8 ? hash.slice(0, 8) : hash;
}

function NumField({
  label,
  value,
  onChange,
  readOnly,
  min,
  max,
  step = 0.01,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  readOnly: boolean;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <Field label={label}>
      <TextInput
        type="number"
        value={String(value)}
        readOnly={readOnly}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (!Number.isNaN(n)) onChange(n);
        }}
      />
    </Field>
  );
}

export function BalanceConfigEditor({
  config,
  baselineConfig,
  readOnly,
  validation,
  validating,
  onChange,
  onValidate,
  onSaveVersion,
  saving,
}: {
  config: BalanceConfig;
  baselineConfig: BalanceConfig;
  readOnly: boolean;
  validation: BalanceValidationPreview | null;
  validating: boolean;
  onChange: (config: BalanceConfig) => void;
  onValidate: () => void;
  onSaveVersion: () => void;
  saving: boolean;
}) {
  const [showJson, setShowJson] = useState(false);

  const dirty = useMemo(
    () => JSON.stringify(config) !== JSON.stringify(baselineConfig),
    [config, baselineConfig],
  );

  const patchRandomness = (key: keyof BalanceConfig['randomness'], value: number) => {
    onChange({
      ...config,
      randomness: { ...config.randomness, [key]: value },
    });
  };

  const patchChemistryCap = (key: keyof BalanceConfig['chemistry']['weights']['caps'], value: number) => {
    onChange({
      ...config,
      chemistry: {
        ...config.chemistry,
        weights: {
          ...config.chemistry.weights,
          caps: { ...config.chemistry.weights.caps, [key]: value },
        },
      },
    });
  };

  const patchChemistryWeight = (
    key: keyof BalanceConfig['chemistry']['weights']['weights'],
    value: number,
  ) => {
    onChange({
      ...config,
      chemistry: {
        ...config.chemistry,
        weights: {
          ...config.chemistry.weights,
          weights: { ...config.chemistry.weights.weights, [key]: value },
        },
      },
    });
  };

  return (
    <Panel title="Configuration">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <section>
          <div
            style={{
              font: 'var(--text-heading-sm)',
              color: 'var(--text-primary)',
              marginBottom: 10,
            }}
          >
            Randomness
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <NumField
              label="Simulation randomness"
              value={config.randomness.simulationRandomness}
              onChange={(v) => patchRandomness('simulationRandomness', v)}
              readOnly={readOnly}
              min={0}
              max={1}
            />
            <NumField
              label="Event variance"
              value={config.randomness.eventVariance}
              onChange={(v) => patchRandomness('eventVariance', v)}
              readOnly={readOnly}
              min={0}
              max={1}
            />
            <NumField
              label="Finishing variance"
              value={config.randomness.finishingVariance}
              onChange={(v) => patchRandomness('finishingVariance', v)}
              readOnly={readOnly}
              min={0}
              max={1}
            />
            <NumField
              label="Goalie variance"
              value={config.randomness.goalieVariance}
              onChange={(v) => patchRandomness('goalieVariance', v)}
              readOnly={readOnly}
              min={0}
              max={1}
            />
            <NumField
              label="Penalty variance"
              value={config.randomness.penaltyVariance}
              onChange={(v) => patchRandomness('penaltyVariance', v)}
              readOnly={readOnly}
              min={0}
              max={1}
            />
            <NumField
              label="Upset strength"
              value={config.randomness.upsetStrength}
              onChange={(v) => patchRandomness('upsetStrength', v)}
              readOnly={readOnly}
              min={0}
              max={1}
            />
          </div>
        </section>

        <section>
          <div
            style={{
              font: 'var(--text-heading-sm)',
              color: 'var(--text-primary)',
              marginBottom: 10,
            }}
          >
            Chemistry caps &amp; weights
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <NumField
              label="Chemistry cap"
              value={config.chemistry.weights.caps.chemistry}
              onChange={(v) => patchChemistryCap('chemistry', v)}
              readOnly={readOnly}
              min={0}
              max={100}
              step={1}
            />
            <NumField
              label="Coach fit cap"
              value={config.chemistry.weights.caps.coachFit}
              onChange={(v) => patchChemistryCap('coachFit', v)}
              readOnly={readOnly}
              min={0}
              max={100}
              step={1}
            />
            <NumField
              label="Tactical fit cap"
              value={config.chemistry.weights.caps.tacticalFit}
              onChange={(v) => patchChemistryCap('tacticalFit', v)}
              readOnly={readOnly}
              min={0}
              max={100}
              step={1}
            />
            <NumField
              label="Total min"
              value={config.chemistry.weights.caps.totalMin}
              onChange={(v) => patchChemistryCap('totalMin', v)}
              readOnly={readOnly}
              min={0}
              max={100}
              step={1}
            />
            <NumField
              label="Total max"
              value={config.chemistry.weights.caps.totalMax}
              onChange={(v) => patchChemistryCap('totalMax', v)}
              readOnly={readOnly}
              min={0}
              max={100}
              step={1}
            />
            <NumField
              label="Role compatibility weight"
              value={config.chemistry.weights.weights.roleCompatibility}
              onChange={(v) => patchChemistryWeight('roleCompatibility', v)}
              readOnly={readOnly}
              min={0}
              max={1}
            />
            <NumField
              label="Personality compatibility weight"
              value={config.chemistry.weights.weights.personalityCompatibility}
              onChange={(v) => patchChemistryWeight('personalityCompatibility', v)}
              readOnly={readOnly}
              min={0}
              max={1}
            />
          </div>
          <p style={{ margin: '8px 0 0', font: 'var(--text-body-sm)', color: 'var(--text-tertiary)' }}>
            Config version: {config.chemistry.weights.version}
          </p>
        </section>

        {validation && !validation.valid ? (
          <div
            style={{
              border: '1px solid var(--accent-danger, #b91c1c)',
              borderRadius: 'var(--radius-md)',
              padding: 12,
              background: 'var(--surface-panel)',
            }}
          >
            <div style={{ font: 'var(--text-label)', color: 'var(--accent-danger, #b91c1c)', marginBottom: 8 }}>
              Validation errors
            </div>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {validation.errors.map((err) => (
                <li key={`${err.path}-${err.message}`} style={{ font: 'var(--text-body-sm)' }}>
                  <code>{err.path}</code>: {err.message}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {validation?.valid && validation.changedPaths.length > 0 ? (
          <div>
            <div style={{ font: 'var(--text-label)', color: 'var(--text-tertiary)', marginBottom: 6 }}>
              Changed paths ({validation.changedPaths.length})
              {validation.hash ? ` · hash ${hashPrefix(validation.hash)}` : null}
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, maxHeight: 120, overflow: 'auto' }}>
              {validation.changedPaths.map((path) => (
                <li key={path} style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
                  {path}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {!readOnly ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button variant="secondary" onClick={onValidate} disabled={!dirty || validating || saving}>
              {validating ? 'Validating…' : 'Validate preview'}
            </Button>
            <Button
              variant="primary"
              onClick={onSaveVersion}
              disabled={!dirty || !validation?.valid || validating || saving}
            >
              {saving ? 'Saving…' : 'Create new version'}
            </Button>
          </div>
        ) : null}

        <details open={showJson} onToggle={(e) => setShowJson((e.target as HTMLDetailsElement).open)}>
          <summary
            style={{
              cursor: 'pointer',
              font: 'var(--text-label)',
              color: 'var(--text-link)',
              letterSpacing: 'var(--text-tracking-wide)',
              textTransform: 'uppercase',
            }}
          >
            Advanced JSON (read-only)
          </summary>
          <pre
            style={{
              marginTop: 8,
              padding: 12,
              overflow: 'auto',
              maxHeight: 280,
              font: 'var(--text-body-sm)',
              background: 'var(--surface-inset, var(--surface-panel))',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-secondary)',
            }}
          >
            {JSON.stringify(config, null, 2)}
          </pre>
        </details>
      </div>
    </Panel>
  );
}

export { hashPrefix };
