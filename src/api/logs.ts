import { getCephLogs } from './ceph';
import { getSystemJournal } from './maintenance';
import { getNodeJournal } from './host';

export type LogSource = 'system' | 'ceph' | 'service';

export function getLogs({
  node,
  source,
  params,
  service,
}: {
  node: string;
  source: LogSource;
  params: Record<string, unknown>;
  service?: string;
}) {
  if (source === 'system') return getSystemJournal(node, params);
  if (source === 'service') {
    return getNodeJournal(node, {
      service: service || '',
      start: Number(params.start) || 0,
      limit: Number(params.limit) || 510,
    });
  }
  return getCephLogs(node, params);
}
