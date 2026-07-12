import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Field, SelectInput, TextInput } from '../components/ui/DataBrowser';
import { ErrorState, LoadingState } from '../components/ui/EmptyState';
import { PageHeader } from '../components/layout/PageHeader';
import { getCommissionerCoach, type CommissionerCoachPayload, updateCommissionerCoach } from '../lib/api';
import { useCommissioner } from '../lib/commissioner';

export function CoachEditPage() {
  const { coachId = '' } = useParams(); const navigate = useNavigate(); const { enabled } = useCommissioner();
  const [form, setForm] = useState<CommissionerCoachPayload | null>(null); const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (!enabled) return; getCommissionerCoach(coachId).then(({ item }) => setForm({ expectedUpdatedAt: item.updatedAt, reason: '', identity: { firstName: item.firstName, lastName: item.lastName, nationalityCountryId: item.nationalityCountryId }, styles: { coachingStyle: item.coachingStyle, tacticalStyle: item.tacticalStyle }, ratings: { overallCoaching: item.overallCoaching ?? 10, playerDevelopment: item.playerDevelopment ?? 10, offense: item.offense ?? 10, defense: item.defense ?? 10 }, currentTeamId: item.currentTeamId })).catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load coach')); }, [coachId, enabled]);
  if (!enabled) return <div style={{ padding: 20 }}><ErrorState description="Enable Commissioner Mode to edit coaches." /></div>;
  if (!form) return <div style={{ padding: 20 }}><LoadingState label="Loading coach…" /></div>;
  const set = (key: 'firstName' | 'lastName', value: string) => setForm({ ...form, identity: { ...form.identity, [key]: value } });
  return <div style={{ padding: 20, display: 'grid', gap: 12 }}><PageHeader title="Edit coach" />
    {error ? <ErrorState description={error} /> : null}
    <Field label="First name"><TextInput value={form.identity.firstName} onChange={(e) => set('firstName', e.target.value)} /></Field>
    <Field label="Last name"><TextInput value={form.identity.lastName} onChange={(e) => set('lastName', e.target.value)} /></Field>
    <Field label="Reason"><TextInput value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></Field>
    {(['overallCoaching', 'playerDevelopment', 'offense', 'defense'] as const).map((key) => <Field key={key} label={key}><TextInput type="number" min="1" max="20" value={form.ratings[key]} onChange={(e) => setForm({ ...form, ratings: { ...form.ratings, [key]: Number(e.target.value) } })} /></Field>)}
    <Button onClick={() => updateCommissionerCoach(coachId, form).then(() => navigate(`/coaches/${coachId}`)).catch((e: unknown) => setError(e instanceof Error ? e.message : 'Save failed'))}>Save coach</Button>
  </div>;
}
