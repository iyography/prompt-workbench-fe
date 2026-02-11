import React from 'react'

interface ApiTimingProps {
  timingJson?: string;
}

export default function ApiTiming({ timingJson }: ApiTimingProps) {
  if (!timingJson) return null as any;

  let data: any = null;
  try {
    data = JSON.parse(timingJson);
  } catch {
    return null as any;
  }
  if (!data || !data.startedAt || !data.endpoints) return null as any;

  const entries = Object.entries<any>(data.endpoints) as Array<[string, { ms?: number }]>;
  if (entries.length === 0) return null as any;

  const sorted = entries
    .filter(([, v]) => typeof v?.ms === 'number')
    .sort((a, b) => (a[1].ms || 0) - (b[1].ms || 0));

  const totalMs = Math.max(...sorted.map(([, v]) => v.ms || 0), 0);

  const label = (k: string) => k.replace(/_/g, ' ');
  const fmt = (ms?: number) => {
    if (typeof ms !== 'number' || !isFinite(ms)) return '—';
    return ms >= 1000 ? `${(ms/1000).toFixed(2)}s` : `${ms}ms`;
  };

  return (
    <div className="mt-2 p-2 border rounded text-xs text-gray-700 bg-white">
      <div className="font-semibold mb-2">API Timings</div>
      <div className="mb-1 flex justify-between text-[11px] uppercase tracking-wide text-gray-500">
        <span>Endpoint</span>
        <span>Duration</span>
      </div>
      <div className="space-y-1">
        {sorted.map(([k, v]) => (
          <div key={k} className="flex justify-between">
            <span className="truncate mr-4">{label(k)}</span>
            <span className="font-mono">{fmt(v.ms)}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-xs">
        <span className="text-gray-600">Total (last endpoint)</span>
        <span className="font-mono font-medium">{fmt(totalMs)}</span>
      </div>
    </div>
  );
} 