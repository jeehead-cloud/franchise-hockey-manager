import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BatchLabPanel } from '../components/lab/BatchLabPanel';
import { SingleMatchDebugPanel } from '../components/lab/SingleMatchDebugPanel';
import { PageHeader } from '../components/layout/PageHeader';
import { Tabs } from '../components/ui/Tabs';

type LabTab = 'batch' | 'debug';

function parseTab(raw: string | null): LabTab {
  return raw === 'debug' ? 'debug' : 'batch';
}

export function SimulationLabPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseTab(searchParams.get('tab'));

  const setTab = useCallback(
    (value: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value === 'batch') next.delete('tab');
          else next.set('tab', value);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  return (
    <div className="page-stack" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        title="Simulation Lab"
        subtitle="Batch balance analysis and technical single-match debug. Neither path persists official Match records."
        badge="F16"
      />

      <Tabs
        items={[
          { value: 'batch', label: 'Batch Lab' },
          { value: 'debug', label: 'Single Match Debug' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'batch' ? <BatchLabPanel /> : <SingleMatchDebugPanel />}
    </div>
  );
}
