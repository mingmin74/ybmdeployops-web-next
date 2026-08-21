import { getCephLogs } from './ceph';
import { getSystemJournal } from './maintenance';

export type LogSource = 'system' | 'ceph';

export function getLogs({
  node,
  source,
  params,
}: {
  node: string;
  source: LogSource;
  params: Record<string, unknown>;
}) {
  return source === 'system' ? getSystemJournal(node, params) : getCephLogs(node, params);
}
