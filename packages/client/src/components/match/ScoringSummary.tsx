import { Badge } from '../ui/Badge';
import { Panel } from '../ui/Panel';
import { formatMatchClock } from '../../lib/match-format';
import type { MatchOverviewScoringPlay, MatchOverviewShootoutAttempt } from '../../lib/api';

export function ScoringSummary({
  goals,
  shootout,
}: {
  goals: MatchOverviewScoringPlay[];
  shootout: MatchOverviewShootoutAttempt[];
}) {
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Panel title="Scoring summary">
        {goals.length === 0 ? (
          <p style={{ margin: 0, font: 'var(--text-body-sm)', color: 'var(--text-tertiary)' }}>
            No goals recorded.
          </p>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
            {goals.map((g, i) => {
              const assists = [g.primaryAssistName, g.secondaryAssistName].filter(Boolean).join(', ');
              return (
                <li
                  key={`${g.period}-${g.remainingSeconds}-${g.scorerId}-${i}`}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'auto 1fr auto',
                    gap: 12,
                    alignItems: 'center',
                    padding: '8px 10px',
                    background: 'var(--surface-subtle)',
                    borderRadius: 'var(--radius-sm)',
                    font: 'var(--text-body-sm)',
                  }}
                >
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>
                    P{g.period} {formatMatchClock(g.remainingSeconds)}
                  </span>
                  <span>
                    <strong>{g.scorerName ?? 'Unknown'}</strong>
                    {assists ? ` (${assists})` : ''}
                    <span style={{ color: 'var(--text-tertiary)' }}>
                      {' · '}
                      {g.teamName ?? 'Team'}
                    </span>
                    {g.strength !== 'EV' ? (
                      <span style={{ marginLeft: 8 }}>
                        <Badge tone="info">{g.strength}</Badge>
                      </span>
                    ) : null}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>
                    {g.scoreAfter.away}–{g.scoreAfter.home}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {shootout.length > 0 ? (
        <Panel title="Shootout">
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 6 }}>
            {shootout.map((row, i) => (
              <li
                key={`${row.round}-${row.attemptNumber}-${row.shooterId}-${i}`}
                style={{
                  padding: '8px 10px',
                  background: 'var(--surface-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  font: 'var(--text-body-sm)',
                }}
              >
                {row.round != null ? `R${row.round}` : 'SO'}{' '}
                <strong>{row.shooterName ?? 'Unknown'}</strong>{' '}
                {row.scored ? (
                  <Badge tone="success">Goal</Badge>
                ) : (
                  <Badge tone="neutral">Miss</Badge>
                )}
                {row.goalieName ? (
                  <span style={{ color: 'var(--text-tertiary)' }}> vs {row.goalieName}</span>
                ) : null}
                {row.teamName ? (
                  <span style={{ color: 'var(--text-tertiary)' }}> · {row.teamName}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}
