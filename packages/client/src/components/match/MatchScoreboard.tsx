import { Badge } from '../ui/Badge';
import { Panel } from '../ui/Panel';
import { formatDecisionLabel, formatDisplayScore } from '../../lib/match-format';
import type { MatchOverview, MatchOverviewResult } from '../../lib/api';

export function MatchScoreboard({
  overview,
  result,
}: {
  overview: MatchOverview;
  result: MatchOverviewResult;
}) {
  const scoreboard = formatDisplayScore(result.score.home, result.score.away, result.decisionType);
  const homeName = overview.homeTeam.name;
  const awayName = overview.awayTeam.name;
  const homeCurrent = overview.homeTeam.currentName;
  const awayCurrent = overview.awayTeam.currentName;
  const winnerName =
    result.winnerTeamId === overview.homeTeam.id
      ? homeName
      : result.winnerTeamId === overview.awayTeam.id
        ? awayName
        : null;

  return (
    <Panel>
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 8,
          marginBottom: 12,
          flexWrap: 'wrap',
        }}
      >
        {overview.isCurrent ? (
          <Badge tone="success">Current</Badge>
        ) : (
          <Badge tone="warning">Superseded</Badge>
        )}
        <Badge tone="neutral">Attempt #{result.attemptNumber}</Badge>
        <Badge tone={result.status === 'SUPERSEDED' ? 'warning' : 'info'}>{result.status}</Badge>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          gap: 16,
          alignItems: 'center',
          textAlign: 'center',
        }}
      >
        <div>
          <div style={{ font: 'var(--text-data-sm)', color: 'var(--text-tertiary)' }}>Away</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{awayName}</div>
          {awayCurrent && awayCurrent !== awayName ? (
            <div style={{ font: 'var(--text-data-sm)', color: 'var(--text-tertiary)' }}>
              Now: {awayCurrent}
            </div>
          ) : null}
          <div style={{ fontSize: 36, fontWeight: 800 }}>{result.score.away}</div>
        </div>
        <div>
          <div style={{ fontSize: 28, fontWeight: 800 }}>{scoreboard}</div>
          <Badge tone="success">{formatDecisionLabel(result.decisionType)}</Badge>
          {winnerName ? (
            <div style={{ marginTop: 6, font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
              Winner: {winnerName}
            </div>
          ) : null}
        </div>
        <div>
          <div style={{ font: 'var(--text-data-sm)', color: 'var(--text-tertiary)' }}>Home</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{homeName}</div>
          {homeCurrent && homeCurrent !== homeName ? (
            <div style={{ font: 'var(--text-data-sm)', color: 'var(--text-tertiary)' }}>
              Now: {homeCurrent}
            </div>
          ) : null}
          <div style={{ fontSize: 36, fontWeight: 800 }}>{result.score.home}</div>
        </div>
      </div>

      <div
        style={{
          marginTop: 16,
          display: 'flex',
          gap: 16,
          flexWrap: 'wrap',
          font: 'var(--text-body-sm)',
          color: 'var(--text-secondary)',
          justifyContent: 'center',
        }}
      >
        <span>
          Regulation: {result.score.homeRegulation}–{result.score.awayRegulation}
        </span>
        {(result.score.homeOvertime > 0 || result.score.awayOvertime > 0) && (
          <span>
            OT: {result.score.homeOvertime}–{result.score.awayOvertime}
          </span>
        )}
        {(result.score.homeShootout > 0 ||
          result.score.awayShootout > 0 ||
          result.decisionType === 'SHOOTOUT') && (
          <span>
            Shootout: {result.score.homeShootout}–{result.score.awayShootout}
          </span>
        )}
        {result.completedAt ? <span>Completed {new Date(result.completedAt).toLocaleString()}</span> : null}
        {result.supersededAt ? (
          <span style={{ color: 'var(--accent-warning)' }}>
            Superseded {new Date(result.supersededAt).toLocaleString()}
          </span>
        ) : null}
      </div>
    </Panel>
  );
}
