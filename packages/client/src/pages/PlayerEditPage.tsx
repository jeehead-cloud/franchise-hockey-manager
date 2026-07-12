import { useEffect, useMemo, useState } from 'react';
import { Link, useBlocker, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Field, SelectInput, TextInput } from '../components/ui/DataBrowser';
import { Dialog } from '../components/ui/Dialog';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/EmptyState';
import { Panel } from '../components/ui/Panel';
import { BackLink, RecordNotFound } from '../components/ui/RecordStates';
import { Tabs } from '../components/ui/Tabs';
import {
  getCommissionerPlayer,
  getCountries,
  getTeams,
  updateCommissionerPlayer,
  type CommissionerPlayerDetail,
  type CommissionerPlayerEditPayload,
  type CountryItem,
  type TeamListItem,
} from '../lib/api';
import { useCommissioner } from '../lib/commissioner';

const SKATER_KEYS = [
  'stickhandling',
  'shooting',
  'passing',
  'strength',
  'speed',
  'balance',
  'aggression',
  'offensiveAwareness',
  'defensiveAwareness',
] as const;

const GOALIE_KEYS = [
  'reflexes',
  'positioning',
  'reboundControl',
  'glove',
  'blocker',
  'movement',
  'puckHandling',
  'consistency',
  'stamina',
] as const;

const emptySkater = () =>
  Object.fromEntries(SKATER_KEYS.map((k) => [k, 10])) as Record<(typeof SKATER_KEYS)[number], number>;
const emptyGoalie = () =>
  Object.fromEntries(GOALIE_KEYS.map((k) => [k, 10])) as Record<(typeof GOALIE_KEYS)[number], number>;

type TabId = 'identity' | 'attributes' | 'profile' | 'potential' | 'review';

function defaultsFromDetail(item: CommissionerPlayerDetail): CommissionerPlayerEditPayload {
  const e = item.editable;
  const isGoalie = e.identity.primaryPosition === 'G';
  return {
    expectedUpdatedAt: item.updatedAt,
    reason: '',
    identity: {
      firstName: e.identity.firstName,
      lastName: e.identity.lastName,
      dateOfBirth: e.identity.dateOfBirth,
      nationalityCountryId: e.identity.nationalityCountryId,
      currentTeamId: e.identity.currentTeamId,
      primaryPosition: e.identity.primaryPosition,
      secondaryPositions: [...(e.identity.secondaryPositions ?? [])],
      rosterStatus: e.identity.rosterStatus,
    },
    profile: {
      preferredCoachingStyle: e.profile.preferredCoachingStyle ?? 'DEVELOPMENTAL',
      preferredTactics: e.profile.preferredTactics ?? 'SYSTEM',
      personality: e.profile.personality ?? 'PROFESSIONAL',
      heroRating: e.profile.heroRating ?? 10,
      stability: e.profile.stability ?? 10,
      developmentRate: e.profile.developmentRate ?? 1,
      developmentRisk: e.profile.developmentRisk ?? 0.3,
      potentialFloor: e.profile.potentialFloor ?? item.hiddenPotential.potentialFloor ?? 40,
      potentialCeiling: e.profile.potentialCeiling ?? item.hiddenPotential.potentialCeiling ?? 70,
      publicPotentialEstimate: e.profile.publicPotentialEstimate ?? 'UNKNOWN',
    },
    skaterAttributes: isGoalie ? null : { ...(e.skaterAttributes ?? emptySkater()) },
    goalieAttributes: isGoalie ? { ...(e.goalieAttributes ?? emptyGoalie()) } : null,
  };
}

export function PlayerEditPage() {
  const { playerId = '' } = useParams();
  const navigate = useNavigate();
  const { enabled, registerDirtyGuard } = useCommissioner();
  const [tab, setTab] = useState<TabId>('identity');
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [baseline, setBaseline] = useState<string>('');
  const [form, setForm] = useState<CommissionerPlayerEditPayload | null>(null);
  const [originalPosition, setOriginalPosition] = useState('C');
  const [countries, setCountries] = useState<CountryItem[]>([]);
  const [teams, setTeams] = useState<TeamListItem[]>([]);
  const [confirmConvert, setConfirmConvert] = useState(false);
  const [confirmTeam, setConfirmTeam] = useState(false);
  const [pendingSave, setPendingSave] = useState(false);

  const dirty = useMemo(
    () => (form ? JSON.stringify({ ...form, reason: form.reason }) !== baseline : false),
    [form, baseline],
  );

  useEffect(() => {
    registerDirtyGuard(() => dirty);
    return () => registerDirtyGuard(null);
  }, [dirty, registerDirtyGuard]);

  useBlocker(({ currentLocation, nextLocation }) => {
    if (!dirty) return false;
    if (currentLocation.pathname === nextLocation.pathname) return false;
    return !window.confirm('You have unsaved Commissioner edits. Leave this page?');
  });

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setLoading(true);
    Promise.all([
      getCommissionerPlayer(playerId, controller.signal),
      getCountries(controller.signal),
      getTeams({ pageSize: 100, sort: 'name' }, controller.signal),
    ])
      .then(([playerRes, countryRes, teamRes]) => {
        const payload = defaultsFromDetail(playerRes.item);
        setForm(payload);
        setOriginalPosition(playerRes.item.primaryPosition);
        setBaseline(JSON.stringify({ ...payload, reason: payload.reason }));
        setCountries(countryRes.items);
        setTeams(teamRes.items);
        setError(null);
        setNotFound(false);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        const status = (err as { status?: number }).status;
        if (status === 404) setNotFound(true);
        else setError(err instanceof Error ? err.message : 'Failed to load editor');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [playerId, enabled]);

  if (!enabled) {
    return (
      <div style={{ padding: 20 }}>
        <BackLink to={`/players/${playerId}`} label="Player" />
        <EmptyState
          title="Commissioner Mode required"
          description="Enable Commissioner Mode from Settings before editing players."
        />
        <div style={{ marginTop: 12 }}>
          <Link to="/settings">Open Settings</Link>
        </div>
      </div>
    );
  }

  if (loading || !form) {
    return (
      <div style={{ padding: 20 }}>
        <LoadingState label="Loading Commissioner editor…" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div style={{ padding: 20 }}>
        <RecordNotFound entity="Player" listHref="/players" listLabel="Back to Players" />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 20 }}>
        <ErrorState description={error} />
      </div>
    );
  }

  const isGoalie = form.identity.primaryPosition === 'G';
  const modelConverted =
    (originalPosition === 'G') !== (form.identity.primaryPosition === 'G');

  function setPosition(next: string) {
    setForm((prev) => {
      if (!prev) return prev;
      const wasG = prev.identity.primaryPosition === 'G';
      const nextG = next === 'G';
      if (wasG === nextG) {
        return {
          ...prev,
          identity: {
            ...prev.identity,
            primaryPosition: next,
            secondaryPositions: prev.identity.secondaryPositions.filter((p) => p !== next),
          },
        };
      }
      if (nextG) {
        return {
          ...prev,
          identity: { ...prev.identity, primaryPosition: next, secondaryPositions: [] },
          skaterAttributes: null,
          goalieAttributes: emptyGoalie(),
        };
      }
      return {
        ...prev,
        identity: {
          ...prev.identity,
          primaryPosition: next,
          secondaryPositions: prev.identity.secondaryPositions.filter((p) => p !== next),
        },
        goalieAttributes: null,
        skaterAttributes: emptySkater(),
      };
    });
  }

  function toggleSecondary(pos: string) {
    setForm((prev) => {
      if (!prev || prev.identity.primaryPosition === 'G') return prev;
      if (pos === prev.identity.primaryPosition) return prev;
      const has = prev.identity.secondaryPositions.includes(pos);
      return {
        ...prev,
        identity: {
          ...prev.identity,
          secondaryPositions: has
            ? prev.identity.secondaryPositions.filter((p) => p !== pos)
            : [...prev.identity.secondaryPositions, pos].sort(),
        },
      };
    });
  }

  async function doSave() {
    if (!form) return;
    setSaving(true);
    setSaveError(null);
    setSuccess(false);
    try {
      const result = await updateCommissionerPlayer(playerId, {
        ...form,
        reason: form.reason.trim(),
      });
      const next = defaultsFromDetail(result.item);
      next.reason = '';
      setForm(next);
      setOriginalPosition(result.item.primaryPosition);
      setBaseline(JSON.stringify({ ...next, reason: '' }));
      setSuccess(true);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
      setPendingSave(false);
      setConfirmConvert(false);
      setConfirmTeam(false);
    }
  }

  function requestSave() {
    if (!form || !form.reason.trim()) {
      setSaveError('Edit reason is required');
      setTab('review');
      return;
    }
    const teamChanged =
      JSON.parse(baseline).identity.currentTeamId !== form.identity.currentTeamId;
    if (modelConverted) {
      setPendingSave(true);
      setConfirmConvert(true);
      return;
    }
    if (teamChanged) {
      setPendingSave(true);
      setConfirmTeam(true);
      return;
    }
    void doSave();
  }

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <BackLink to={`/players/${playerId}`} label="Player profile" />
      <PageHeader
        title={`Edit ${form.identity.firstName} ${form.identity.lastName}`}
        subtitle="Commissioner editor · server recalculates ratings and role on save"
        actions={<Badge tone="warning">Commissioner Mode</Badge>}
      />

      <Tabs
        items={[
          { value: 'identity', label: 'Identity & Assignment' },
          { value: 'attributes', label: 'Attributes' },
          { value: 'profile', label: 'Profile & Preferences' },
          { value: 'potential', label: 'Potential & Development' },
          { value: 'review', label: 'Review Changes' },
        ]}
        value={tab}
        onChange={(v) => setTab(v as TabId)}
      />

      {tab === 'identity' ? (
        <Panel title="Identity & assignment">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }}>
            <Field label="First name" htmlFor="firstName">
              <TextInput
                id="firstName"
                value={form.identity.firstName}
                onChange={(e) =>
                  setForm({ ...form, identity: { ...form.identity, firstName: e.target.value } })
                }
              />
            </Field>
            <Field label="Last name" htmlFor="lastName">
              <TextInput
                id="lastName"
                value={form.identity.lastName}
                onChange={(e) =>
                  setForm({ ...form, identity: { ...form.identity, lastName: e.target.value } })
                }
              />
            </Field>
            <Field label="Date of birth" htmlFor="dob">
              <TextInput
                id="dob"
                value={form.identity.dateOfBirth}
                onChange={(e) =>
                  setForm({ ...form, identity: { ...form.identity, dateOfBirth: e.target.value } })
                }
              />
            </Field>
            <Field label="Nationality" htmlFor="nat">
              <SelectInput
                id="nat"
                value={form.identity.nationalityCountryId}
                onChange={(e) =>
                  setForm({
                    ...form,
                    identity: { ...form.identity, nationalityCountryId: e.target.value },
                  })
                }
              >
                {countries.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Team" htmlFor="team">
              <SelectInput
                id="team"
                value={form.identity.currentTeamId ?? ''}
                onChange={(e) =>
                  setForm({
                    ...form,
                    identity: {
                      ...form.identity,
                      currentTeamId: e.target.value ? e.target.value : null,
                    },
                  })
                }
              >
                <option value="">Unassigned</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Position" htmlFor="pos">
              <SelectInput
                id="pos"
                value={form.identity.primaryPosition}
                onChange={(e) => setPosition(e.target.value)}
              >
                {['LW', 'RW', 'C', 'LD', 'RD', 'G'].map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Roster status" htmlFor="roster">
              <SelectInput
                id="roster"
                value={form.identity.rosterStatus}
                onChange={(e) =>
                  setForm({
                    ...form,
                    identity: { ...form.identity, rosterStatus: e.target.value },
                  })
                }
              >
                {['ACTIVE', 'RESERVE', 'PROSPECT', 'UNAVAILABLE'].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </SelectInput>
            </Field>
          </div>
          <div style={{ marginTop: 12 }}>
            <div style={{ font: 'var(--text-label)', color: 'var(--text-tertiary)', marginBottom: 6 }}>
              Secondary positions
            </div>
            {isGoalie ? (
              <p style={{ margin: 0, font: 'var(--text-body-sm)', color: 'var(--text-tertiary)' }}>
                Goalies cannot have secondary positions.
              </p>
            ) : (
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {['LW', 'RW', 'C', 'LD', 'RD']
                  .filter((p) => p !== form.identity.primaryPosition)
                  .map((p) => (
                    <label
                      key={p}
                      style={{
                        display: 'inline-flex',
                        gap: 6,
                        alignItems: 'center',
                        font: 'var(--text-body-sm)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={form.identity.secondaryPositions.includes(p)}
                        onChange={() => toggleSecondary(p)}
                      />
                      {p}
                    </label>
                  ))}
              </div>
            )}
          </div>
          {modelConverted ? (
            <p style={{ marginTop: 12, font: 'var(--text-body-sm)', color: 'var(--accent-warning)' }}>
              Changing between skater and goalie replaces the attribute model. Enter a full new
              attribute set before saving.
            </p>
          ) : null}
        </Panel>
      ) : null}

      {tab === 'attributes' ? (
        <Panel title={isGoalie ? 'Goalie attributes (1–20)' : 'Skater attributes (1–20)'}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
            {(isGoalie ? GOALIE_KEYS : SKATER_KEYS).map((key) => (
              <Field key={key} label={key} htmlFor={key}>
                <TextInput
                  id={key}
                  type="number"
                  min={1}
                  max={20}
                  value={String(
                    isGoalie
                      ? form.goalieAttributes?.[key] ?? 10
                      : form.skaterAttributes?.[key] ?? 10,
                  )}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    if (isGoalie) {
                      setForm({
                        ...form,
                        goalieAttributes: { ...form.goalieAttributes!, [key]: value },
                      });
                    } else {
                      setForm({
                        ...form,
                        skaterAttributes: { ...form.skaterAttributes!, [key]: value },
                      });
                    }
                  }}
                />
              </Field>
            ))}
          </div>
          <p style={{ marginTop: 12, font: 'var(--text-body-sm)', color: 'var(--text-tertiary)' }}>
            Current ability, offensive/defensive ratings, and role are derived on the server after
            save — they are not editable here.
          </p>
        </Panel>
      ) : null}

      {tab === 'profile' ? (
        <Panel title="Profile & preferences">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }}>
            <Field label="Preferred coaching" htmlFor="coach">
              <SelectInput
                id="coach"
                value={form.profile.preferredCoachingStyle}
                onChange={(e) =>
                  setForm({
                    ...form,
                    profile: { ...form.profile, preferredCoachingStyle: e.target.value },
                  })
                }
              >
                {['AUTHORITARIAN', 'AUTHORITATIVE', 'DEMOCRATIC', 'DEVELOPMENTAL', 'HANDS_OFF'].map(
                  (v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ),
                )}
              </SelectInput>
            </Field>
            <Field label="Preferred tactics" htmlFor="tactics">
              <SelectInput
                id="tactics"
                value={form.profile.preferredTactics}
                onChange={(e) =>
                  setForm({
                    ...form,
                    profile: { ...form.profile, preferredTactics: e.target.value },
                  })
                }
              >
                {['COMBINATIONAL', 'PHYSICAL', 'SPEED', 'SYSTEM', 'FORECHECKING'].map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Personality" htmlFor="personality">
              <SelectInput
                id="personality"
                value={form.profile.personality}
                onChange={(e) =>
                  setForm({ ...form, profile: { ...form.profile, personality: e.target.value } })
                }
              >
                {['LEADER', 'COMPETITOR', 'PROFESSIONAL', 'CREATIVE', 'GLUE'].map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Hero rating (1–20)" htmlFor="hero">
              <TextInput
                id="hero"
                type="number"
                min={1}
                max={20}
                value={String(form.profile.heroRating)}
                onChange={(e) =>
                  setForm({
                    ...form,
                    profile: { ...form.profile, heroRating: Number(e.target.value) },
                  })
                }
              />
            </Field>
            <Field label="Stability (1–20)" htmlFor="stability">
              <TextInput
                id="stability"
                type="number"
                min={1}
                max={20}
                value={String(form.profile.stability)}
                onChange={(e) =>
                  setForm({
                    ...form,
                    profile: { ...form.profile, stability: Number(e.target.value) },
                  })
                }
              />
            </Field>
          </div>
        </Panel>
      ) : null}

      {tab === 'potential' ? (
        <Panel title="Potential & development (Commissioner-only exact values)">
          <p style={{ marginTop: 0, font: 'var(--text-body-sm)', color: 'var(--accent-warning)' }}>
            Exact floor, ceiling, and development risk are hidden from ordinary public player APIs.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
            <Field label="Development rate" htmlFor="devRate">
              <TextInput
                id="devRate"
                type="number"
                step="0.1"
                min={0.1}
                max={3}
                value={String(form.profile.developmentRate)}
                onChange={(e) =>
                  setForm({
                    ...form,
                    profile: { ...form.profile, developmentRate: Number(e.target.value) },
                  })
                }
              />
            </Field>
            <Field label="Development risk (0–1)" htmlFor="devRisk">
              <TextInput
                id="devRisk"
                type="number"
                step="0.01"
                min={0}
                max={1}
                value={String(form.profile.developmentRisk)}
                onChange={(e) =>
                  setForm({
                    ...form,
                    profile: { ...form.profile, developmentRisk: Number(e.target.value) },
                  })
                }
              />
            </Field>
            <Field label="Potential floor" htmlFor="floor">
              <TextInput
                id="floor"
                type="number"
                min={0}
                max={100}
                value={String(form.profile.potentialFloor)}
                onChange={(e) =>
                  setForm({
                    ...form,
                    profile: { ...form.profile, potentialFloor: Number(e.target.value) },
                  })
                }
              />
            </Field>
            <Field label="Potential ceiling" htmlFor="ceil">
              <TextInput
                id="ceil"
                type="number"
                min={0}
                max={100}
                value={String(form.profile.potentialCeiling)}
                onChange={(e) =>
                  setForm({
                    ...form,
                    profile: { ...form.profile, potentialCeiling: Number(e.target.value) },
                  })
                }
              />
            </Field>
            <Field label="Public potential estimate" htmlFor="pubPot">
              <SelectInput
                id="pubPot"
                value={form.profile.publicPotentialEstimate}
                onChange={(e) =>
                  setForm({
                    ...form,
                    profile: { ...form.profile, publicPotentialEstimate: e.target.value },
                  })
                }
              >
                {['LOW', 'STANDARD', 'HIGH', 'ELITE', 'UNKNOWN'].map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </SelectInput>
            </Field>
          </div>
        </Panel>
      ) : null}

      {tab === 'review' ? (
        <Panel title="Review & save">
          <p style={{ marginTop: 0, font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
            {dirty ? 'Unsaved changes present.' : 'No unsaved changes.'} Role and ratings will
            recalculate on the server.
          </p>
          <Field label="Edit reason (required)" htmlFor="reason">
            <TextInput
              id="reason"
              value={form.reason}
              placeholder="Why is this correction being made?"
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
            />
          </Field>
          {saveError ? <ErrorState description={saveError} /> : null}
          {success ? (
            <EmptyState
              title="Saved"
              description="Player updated. Derived values recalculated. An audit entry was created."
            />
          ) : null}
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <Button onClick={requestSave} disabled={saving || !dirty}>
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
            <Button
              variant="secondary"
              disabled={saving}
              onClick={() => {
                if (dirty && !window.confirm('Discard unsaved edits?')) return;
                navigate(`/players/${playerId}`);
              }}
            >
              Cancel
            </Button>
            {success ? (
              <Button variant="secondary" onClick={() => navigate(`/players/${playerId}`)}>
                Back to profile
              </Button>
            ) : null}
          </div>
        </Panel>
      ) : null}

      <Dialog
        open={confirmConvert}
        title="Convert attribute model?"
        confirmLabel="Convert and save"
        confirmVariant="danger"
        busy={saving}
        onClose={() => {
          setConfirmConvert(false);
          setPendingSave(false);
        }}
        onConfirm={() => {
          if (pendingSave) void doSave();
        }}
      >
        This replaces the {originalPosition === 'G' ? 'goalie' : 'skater'} attribute row with a{' '}
        {isGoalie ? 'goalie' : 'skater'} model. Values are not auto-translated.
      </Dialog>

      <Dialog
        open={confirmTeam}
        title="Change team assignment?"
        confirmLabel="Save assignment"
        busy={saving}
        onClose={() => {
          setConfirmTeam(false);
          setPendingSave(false);
        }}
        onConfirm={() => {
          if (pendingSave) void doSave();
        }}
      >
        This Commissioner correction moves the player between teams (or to unassigned) without
        creating a trade/contract record.
      </Dialog>
    </div>
  );
}
