import { Badge } from './Badge';
import { Panel } from './Panel';
import type { ChemistryFactor, ChemistryUnitResult, LineupChemistrySummary } from '../../lib/api';
import {
  chemistryLabelTone,
  factorDirectionLabel,
  formatFitScore,
  formatModifierPercent,
  formatNullableNumber,
  unitDisplayTitle,
} from '../../lib/chemistryUi';

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        minWidth: 88,
      }}
    >
      <span style={{ font: 'var(--text-label)', color: 'var(--text-tertiary)' }}>{label}</span>
      <span style={{ font: 'var(--text-body-sm)', color: 'var(--text-primary)' }}>{value}</span>
    </div>
  );
}

function FactorList({ factors }: { factors: ChemistryFactor[] }) {
  if (factors.length === 0) {
    return (
      <p style={{ margin: 0, font: 'var(--text-body-sm)', color: 'var(--text-tertiary)' }}>
        No factors to show.
      </p>
    );
  }
  return (
    <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
      {factors.map((factor) => (
        <li key={`${factor.code}-${factor.label}`} style={{ font: 'var(--text-body-sm)' }}>
          <span style={{ color: 'var(--text-primary)' }}>{factor.label}</span>
          <span style={{ color: 'var(--text-tertiary)' }}>
            {' '}
            · {factorDirectionLabel(factor.direction)} · impact {factor.impact}
          </span>
          {factor.details ? (
            <div style={{ color: 'var(--text-secondary)', marginTop: 2 }}>{factor.details}</div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function ChemistryUnitCard({ unit }: { unit: ChemistryUnitResult }) {
  const isGoalie = unit.unitType === 'GOALIE';
  const title = unitDisplayTitle(unit);

  if (unit.status === 'UNAVAILABLE') {
    return (
      <div
        style={{
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-md)',
          padding: '10px 12px',
          background: 'var(--surface-panel)',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ font: 'var(--text-heading-sm)', color: 'var(--text-primary)' }}>{title}</span>
          <Badge tone="neutral">Unavailable</Badge>
        </div>
        {unit.unavailableReasons.length > 0 ? (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {unit.unavailableReasons.map((reason) => (
              <li key={reason} style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
                {reason}
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ margin: 0, font: 'var(--text-body-sm)', color: 'var(--text-tertiary)' }}>
            This unit cannot be evaluated yet.
          </p>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-md)',
        padding: '10px 12px',
        background: 'var(--surface-panel)',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ font: 'var(--text-heading-sm)', color: 'var(--text-primary)' }}>{title}</span>
        {isGoalie ? (
          <Badge tone="info">No line chemistry</Badge>
        ) : unit.label ? (
          <>
            <Badge tone={chemistryLabelTone(unit.label)}>{unit.label}</Badge>
            <span style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
              Chemistry {formatNullableNumber(unit.currentChemistry)}
            </span>
          </>
        ) : (
          <Badge tone="neutral">No chemistry label</Badge>
        )}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
        <Metric label="Effective performance" value={formatNullableNumber(unit.effectivePerformance)} />
        {isGoalie ? (
          <>
            <Metric label="Coach fit" value={formatFitScore(unit.coachFit)} />
            <Metric label="Tactical fit" value={formatFitScore(unit.tacticalFit)} />
            <Metric label="Modifier" value={formatModifierPercent(unit.totalModifier)} />
          </>
        ) : (
          <Metric label="Modifier" value={formatModifierPercent(unit.totalModifier)} />
        )}
      </div>

      {unit.warnings.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {unit.warnings.map((warning) => (
            <div key={warning} style={{ font: 'var(--text-body-sm)', color: 'var(--accent-warning)' }}>
              {warning}
            </div>
          ))}
        </div>
      ) : null}

      <details>
        <summary
          style={{
            cursor: 'pointer',
            font: 'var(--text-label)',
            color: 'var(--text-link)',
            letterSpacing: 'var(--text-tracking-wide)',
            textTransform: 'uppercase',
          }}
        >
          Factors ({unit.factors.length})
        </summary>
        <div style={{ marginTop: 8 }}>
          <FactorList factors={unit.factors} />
        </div>
      </details>
    </div>
  );
}

function UnitSection({ title, units }: { title: string; units: ChemistryUnitResult[] }) {
  return (
    <section>
      <div style={{ font: 'var(--text-heading-sm)', marginBottom: 8, color: 'var(--text-primary)' }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {units.map((unit) => (
          <ChemistryUnitCard key={unit.unitKey} unit={unit} />
        ))}
      </div>
    </section>
  );
}

export function ChemistryOverallPanel({ chemistry }: { chemistry: LineupChemistrySummary }) {
  const { overall } = chemistry;
  return (
    <Panel title="Chemistry overview">
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 12,
        }}
      >
        <Metric
          label="Avg chemistry"
          value={formatNullableNumber(overall.averageChemistry, 1)}
        />
        <Metric
          label="Available units"
          value={`${overall.availableUnits} / ${overall.availableUnits + overall.unavailableUnits}`}
        />
        <Metric label="Good / excellent" value={String(overall.goodOrExcellentUnits)} />
        <Metric label="Weak / poor" value={String(overall.weakOrPoorUnits)} />
        <Metric label="Config version" value={chemistry.chemistryConfigVersion} />
      </div>
      {chemistry.warnings.length > 0 ? (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {chemistry.warnings.map((warning) => (
            <div key={warning} style={{ font: 'var(--text-body-sm)', color: 'var(--accent-warning)' }}>
              {warning}
            </div>
          ))}
        </div>
      ) : null}
    </Panel>
  );
}

export function ChemistryUnitsPanel({ chemistry }: { chemistry: LineupChemistrySummary }) {
  return (
    <Panel title="Unit chemistry">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <UnitSection title="Forward lines" units={chemistry.forwardLines} />
        <UnitSection title="Defense pairs" units={chemistry.defensePairs} />
        <UnitSection
          title="Goalies"
          units={[chemistry.goalies.starter, chemistry.goalies.backup]}
        />
      </div>
    </Panel>
  );
}
