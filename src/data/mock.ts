import { type Bug, type BugSource, type Status, isOpen } from './model';
export const dates = Array.from({ length: 60 }, (_, i) => new Date(Date.UTC(2025, 7, 1 + i)).toISOString().slice(0, 10));
export const periodStart = '2025-08-01T00:00:00.000Z';
export const beforePeriod = '2025-07-31T23:59:59.999Z';
export const periodEnd = `${dates.at(-1)}T23:59:59.999Z`;
const modules = ['角色与操作', '联机与网络', '地图与场景', 'UI / UX', '物理与交互', '音效与表现', '其他'];
function generate(): Bug[] {
  let seed = 2025;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const bugs: Bug[] = [];
  const create = (at: string) => {
    const r = random(); const m = random();
    bugs.push({ id: `PA-${String(bugs.length + 1).padStart(4, '0')}`, createdAt: at, module: modules[m < .25 ? 0 : m < .46 ? 1 : m < .64 ? 2 : m < .78 ? 3 : m < .89 ? 4 : m < .96 ? 5 : 6], priority: r < .045 ? 'P0' : r < .25 ? 'P1' : r < .77 ? 'P2' : 'P3', currentStatus: '待处理', history: [{ at, status: '待处理' }] });
  };
  const change = (b: Bug, at: string, status: Status) => { b.history.push({ at, status }); b.currentStatus = status; };
  // Existing backlog is represented by real records, not a chart offset.
  for (let i = 0; i < 480; i++) create(new Date(Date.UTC(2025, 6, 1 + i % 30, 8)).toISOString());
  dates.forEach((date, day) => {
    const added = Math.round((day < 20 ? 16 : day < 40 ? 11 : 5) + random() * 8 - 4);
    for (let i = 0; i < added; i++) create(`${date}T08:${String(i).padStart(2, '0')}:00.000Z`);
    const select = (fn: (b: Bug) => boolean) => bugs.filter(fn); // Stable source ordering.
    if (day % 5 === 0) select(b => b.currentStatus === '已关闭').slice(0, 2).forEach(b => change(b, `${date}T09:00:00.000Z`, '处理中'));
    if (day % 4 === 0) select(b => isOpen(b.currentStatus) && b.priority === 'P3').slice(0, 3).forEach(b => change(b, `${date}T10:00:00.000Z`, '不处理'));
    if (day % 9 === 0) select(b => b.currentStatus === '不处理').slice(0, 1).forEach(b => change(b, `${date}T11:00:00.000Z`, '待处理'));
    const closeCount = Math.round((day < 20 ? 14 : day < 40 ? 16 : 15) + random() * 8 - 4);
    const candidates = select(b => isOpen(b.currentStatus)).sort((a, b) => a.priority.localeCompare(b.priority));
    candidates.slice(0, closeCount).forEach(b => change(b, `${date}T16:00:00.000Z`, '已关闭'));
    select(b => isOpen(b.currentStatus)).slice(0, 50).forEach((b, i) => {
      const status = i < 18 ? '待验证' : '处理中';
      if (b.currentStatus !== status) change(b, `${date}T17:00:00.000Z`, status);
    });
  });
  return bugs;
}
export const mockBugs = generate();
export const mockSource: BugSource = { load: async () => mockBugs };
