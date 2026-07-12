import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Field, TextInput } from '../components/ui/DataBrowser';
import { ErrorState } from '../components/ui/EmptyState';
import { createCommissionerCoach, type CommissionerCoachPayload } from '../lib/api';
import { useCommissioner } from '../lib/commissioner';

export function CoachNewPage() {
  const navigate = useNavigate(); const { enabled } = useCommissioner(); const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<CommissionerCoachPayload>({ reason: '', identity: { firstName: '', lastName: '', nationalityCountryId: null }, styles: { coachingStyle: 'DEVELOPMENTAL', tacticalStyle: 'SYSTEM' }, ratings: { overallCoaching: 10, playerDevelopment: 10, offense: 10, defense: 10 }, currentTeamId: null });
  if (!enabled) return <div style={{ padding: 20 }}><ErrorState description="Enable Commissioner Mode to create coaches." /></div>;
  return <div style={{ padding: 20, display: 'grid', gap: 12 }}><PageHeader title="New coach" />
    {error ? <ErrorState description={error} /> : null}
    <Field label="First name"><TextInput value={form.identity.firstName} onChange={(e) => setForm({ ...form, identity: { ...form.identity, firstName: e.target.value } })} /></Field>
    <Field label="Last name"><TextInput value={form.identity.lastName} onChange={(e) => setForm({ ...form, identity: { ...form.identity, lastName: e.target.value } })} /></Field>
    <Field label="Reason"><TextInput value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></Field>
    <Button onClick={() => createCommissionerCoach(form).then((r) => navigate(`/coaches/${r.item.id}`)).catch((e: unknown) => setError(e instanceof Error ? e.message : 'Create failed'))}>Create coach</Button>
  </div>;
}
