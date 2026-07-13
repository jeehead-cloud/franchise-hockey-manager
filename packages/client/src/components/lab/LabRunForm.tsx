import { Button } from '../ui/Button';
import { Field, SelectInput, TextInput } from '../ui/DataBrowser';
import { Panel } from '../ui/Panel';
import type {
  LabBalanceVersionOption,
  LabRuntimeSettingsInput,
  LabSideMode,
  LabSimulationCount,
  LabTeamOption,
  SimulationLabOptions,
} from '../../lib/api';

export interface LabRunFormValues {
  teamAId: string;
  teamBId: string;
  baselineBalanceVersionId: string;
  comparisonBalanceVersionId: string;
  simulationCount: LabSimulationCount;
  baseSeed: string;
  sideMode: LabSideMode;
  simulationRandomness: number;
  loggingLevel: LabRuntimeSettingsInput['loggingLevel'];
  includeGameSummaries: boolean;
  includePlayerAggregates: boolean;
  includeLineAggregates: boolean;
}

export function LabRunForm({
  options,
  values,
  onChange,
  onSubmit,
  onNewSeed,
  busy,
  disabled,
}: {
  options: SimulationLabOptions;
  values: LabRunFormValues;
  onChange: (patch: Partial<LabRunFormValues>) => void;
  onSubmit: () => void;
  onNewSeed: () => void;
  busy: boolean;
  disabled?: boolean;
}) {
  const teams = options.teams;
  const versions = options.balanceVersions;
  const counts = options.supportedCounts.length
    ? options.supportedCounts
    : ([1, 10, 100, 1000] as LabSimulationCount[]);
  const sideModes = options.sideModes.length ? options.sideModes : (['FIXED', 'ALTERNATE'] as LabSideMode[]);

  const versionLabel = (v: LabBalanceVersionOption) =>
    `${v.presetName} v${v.versionNumber}${v.isActive ? ' (active)' : ''} · ${v.configHash.slice(0, 8)}…`;

  const teamReadiness = (t: LabTeamOption) => t.readiness ?? t.readinessStatus ?? 'READY';
  const teamLabel = (t: LabTeamOption) => {
    const readiness = teamReadiness(t);
    return `${t.name}${t.shortName ? ` (${t.shortName})` : ''}${readiness !== 'READY' ? ` — ${readiness}` : ''}`;
  };

  const versionId = (v: LabBalanceVersionOption) => v.id ?? v.versionId ?? '';

  const formDisabled = Boolean(disabled || busy || !options.enabled);

  return (
    <Panel title="Batch inputs">
      <div
        className="form-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: 12,
        }}
      >
        <Field label="Team A">
          <SelectInput
            value={values.teamAId}
            disabled={formDisabled}
            onChange={(e) => onChange({ teamAId: e.target.value })}
          >
            {teams.length === 0 ? <option value="">No ready teams</option> : null}
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {teamLabel(t)}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Team B">
          <SelectInput
            value={values.teamBId}
            disabled={formDisabled}
            onChange={(e) => onChange({ teamBId: e.target.value })}
          >
            {teams.length === 0 ? <option value="">No ready teams</option> : null}
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {teamLabel(t)}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Baseline balance">
          <SelectInput
            value={values.baselineBalanceVersionId}
            disabled={formDisabled}
            onChange={(e) => onChange({ baselineBalanceVersionId: e.target.value })}
          >
            <option value="">Active balance</option>
            {versions.map((v) => (
              <option key={versionId(v)} value={versionId(v)}>
                {versionLabel(v)}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Comparison balance (optional)">
          <SelectInput
            value={values.comparisonBalanceVersionId}
            disabled={formDisabled}
            onChange={(e) => onChange({ comparisonBalanceVersionId: e.target.value })}
          >
            <option value="">None</option>
            {versions.map((v) => (
              <option key={versionId(v)} value={versionId(v)}>
                {versionLabel(v)}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Simulations">
          <SelectInput
            value={String(values.simulationCount)}
            disabled={formDisabled}
            onChange={(e) =>
              onChange({ simulationCount: Number(e.target.value) as LabSimulationCount })
            }
          >
            {counts.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Side mode">
          <SelectInput
            value={values.sideMode}
            disabled={formDisabled}
            onChange={(e) => onChange({ sideMode: e.target.value as LabSideMode })}
          >
            {sideModes.map((m) => (
              <option key={m} value={m}>
                {m === 'ALTERNATE' ? 'Alternate home' : 'Fixed (Team A home)'}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Base seed">
          <TextInput
            value={values.baseSeed}
            disabled={formDisabled}
            onChange={(e) => onChange({ baseSeed: e.target.value })}
          />
        </Field>
        <Field label="Randomness (0–1)">
          <TextInput
            type="number"
            min={0}
            max={1}
            step={0.01}
            value={String(values.simulationRandomness)}
            disabled={formDisabled}
            onChange={(e) => onChange({ simulationRandomness: Number(e.target.value) })}
          />
        </Field>
        <Field label="Logging level">
          <SelectInput
            value={values.loggingLevel}
            disabled={formDisabled}
            onChange={(e) =>
              onChange({
                loggingLevel: e.target.value as LabRuntimeSettingsInput['loggingLevel'],
              })
            }
          >
            <option value="MINIMAL">Minimal</option>
            <option value="STANDARD">Standard</option>
            <option value="DETAILED">Detailed</option>
            <option value="DEBUG">Debug</option>
          </SelectInput>
        </Field>
      </div>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '1rem',
          marginTop: 12,
          font: 'var(--text-body-sm)',
          color: 'var(--text-secondary)',
        }}
      >
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <input
            type="checkbox"
            checked={values.includeGameSummaries}
            disabled={formDisabled}
            onChange={(e) => onChange({ includeGameSummaries: e.target.checked })}
          />
          Include game summaries
        </label>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <input
            type="checkbox"
            checked={values.includePlayerAggregates}
            disabled={formDisabled}
            onChange={(e) => onChange({ includePlayerAggregates: e.target.checked })}
          />
          Include player aggregates
        </label>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <input
            type="checkbox"
            checked={values.includeLineAggregates}
            disabled={formDisabled}
            onChange={(e) => onChange({ includeLineAggregates: e.target.checked })}
          />
          Include line aggregates
        </label>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: 16 }}>
        <Button disabled={formDisabled} onClick={onSubmit}>
          Run batch
        </Button>
        <Button disabled={formDisabled} variant="secondary" onClick={onNewSeed}>
          New seed
        </Button>
      </div>
    </Panel>
  );
}
