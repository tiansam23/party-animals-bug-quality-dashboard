export const priorities = ['P0', 'P1', 'P2', 'P3'] as const;
export const statuses = ['待处理', '处理中', '待验证', '已关闭', '不处理'] as const;
export type Priority = typeof priorities[number];
export type Status = string;
export interface StatusEvent { at: string; status: Status }
export interface Bug { id: string; createdAt: string; module: string; defectType?: string; priority: Priority; currentStatus: Status; history: StatusEvent[]; priorityHistory?: { at: string; priority: Priority }[] }
export interface BugSource { load(): Promise<Bug[]> }
export const isOpen = (status: Status | undefined) => !!status && status !== '已关闭' && status !== '不处理';
export function statusAt(bug: Bug, timestamp: string): Status | undefined {
  if (Date.parse(bug.createdAt) > Date.parse(timestamp)) return undefined;
  return bug.history.filter(e => Date.parse(e.at) <= Date.parse(timestamp)).at(-1)?.status;
}
export function snapshot(bugs: Bug[], timestamp: string) {
  return bugs.flatMap(b => { const status = statusAt(b, timestamp); return status ? [{ ...b, currentStatus: status, priority: b.priorityHistory?.filter(e => Date.parse(e.at) <= Date.parse(timestamp)).at(-1)?.priority ?? b.priority }] : []; });
}
export function summarize(bugs: Bug[]) {
  const valid = bugs.filter(b => b.currentStatus !== '不处理');
  const open = valid.filter(b => isOpen(b.currentStatus));
  const p0 = open.filter(b => b.priority === 'P0').length;
  const p1 = open.filter(b => b.priority === 'P1').length;
  return { total: bugs.length, valid: valid.length, open: open.length, closed: valid.length - open.length, p0, p1, p01: p0 + p1 };
}
export function distribution(bugs: Bug[], field: 'module' | 'defectType' | 'priority' | 'currentStatus') {
  const counts = new Map<string, number>();
  bugs.forEach(b => { const value = b[field] ?? '未分类'; counts.set(value, (counts.get(value) ?? 0) + 1); });
  return Array.from(counts, ([name, value]) => ({ name, value, percent: bugs.length ? value / bugs.length * 100 : 0 })).sort((a, b) => b.value - a.value);
}
export function statusBreakdown(bugs: Bug[]) {
  const repairedStatuses = new Set(['主线测试中', '已修复']);
  const preferredOrder = ['待处理', '修复中', '已解决', '已修复', '重新打开', '待复现', '已关闭'];
  const counts = new Map<string, number>();
  bugs.forEach(bug => {
    if (bug.currentStatus === '不处理') return;
    const status = repairedStatuses.has(bug.currentStatus) ? '已修复' : bug.currentStatus;
    counts.set(status, (counts.get(status) ?? 0) + 1);
  });
  const names = [...preferredOrder.filter(status => counts.has(status)), ...Array.from(counts.keys()).filter(status => !preferredOrder.includes(status))];
  const total = Array.from(counts.values()).reduce((sum, value) => sum + value, 0);
  return names.map(name => ({ name, value: counts.get(name) ?? 0, percent: total ? (counts.get(name) ?? 0) / total * 100 : 0 }));
}
export function trend(bugs: Bug[], dates: string[], offset = 'Z', cutoff?: string) {
  return dates.map(date => {
    const dayStart = Date.parse(`${date}T00:00:00.000${offset}`);
    const dayEnd = Date.parse(`${date}T23:59:59.999${offset}`);
    const end = new Date(Math.min(dayEnd, cutoff ? Date.parse(cutoff) : dayEnd)).toISOString();
    const inDay = (at: string) => Date.parse(at) >= dayStart && Date.parse(at) <= Date.parse(end);
    const s = summarize(snapshot(bugs, end));
    return { date, added: bugs.filter(b => inDay(b.createdAt)).length,
      closed: bugs.reduce((n, b) => n + b.history.filter((e, i) => inDay(e.at) && e.status === '已关闭' && b.history[i - 1]?.status !== '已关闭').length, 0),
      open: s.open, p0: s.p0, p1: s.p1, p01: s.p01 };
  });
}
