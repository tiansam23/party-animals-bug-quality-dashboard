import test from 'node:test';
import assert from 'node:assert/strict';
import { type Bug, statusAt, summarize, snapshot, trend, distribution, isOpen, statusBreakdown } from './model';
import { mockBugs, dates, beforePeriod, periodEnd } from './mock';
const bug: Bug = { id: 'test', createdAt: '2025-08-01T08:00:00.000Z', module: '网络', priority: 'P0', currentStatus: '处理中', history: [
  { at: '2025-08-01T08:00:00.000Z', status: '待处理' },
  { at: '2025-08-02T12:00:00.000Z', status: '已关闭' },
  { at: '2025-08-03T12:00:00.000Z', status: '处理中' },
  { at: '2025-08-04T12:00:00.000Z', status: '不处理' },
  { at: '2025-08-05T12:00:00.000Z', status: '处理中' }
] };
test('history replays closure, reopening, exclusion, and restoration', () => {
  const rows = trend([bug], dates.slice(0, 5));
  assert.deepEqual(rows.map(p => p.open), [1, 0, 1, 0, 1]);
  assert.deepEqual(rows.map(p => p.p0), [1, 0, 1, 0, 1]);
  assert.deepEqual(rows.map(p => p.p01), [1, 0, 1, 0, 1]);
  assert.deepEqual(rows.map(p => p.closed), [0, 1, 0, 0, 0]);
  assert.equal(statusAt(bug, beforePeriod), undefined);
  assert.equal(summarize(snapshot([bug], '2025-08-04T23:59:59.999Z')).valid, 0);
});
test('all distributions reconcile to the same period-end snapshot', () => {
  const current = snapshot(mockBugs, periodEnd); const s = summarize(current);
  assert.equal(s.valid, s.open + s.closed);
  assert.equal(s.total, mockBugs.length);
  for (const openOnly of [false, true]) {
    const filtered = current.filter(b => openOnly ? isOpen(b.currentStatus) : b.currentStatus !== '不处理');
    for (const field of ['module', 'priority'] as const) assert.equal(distribution(filtered, field).reduce((n, x) => n + x.value, 0), openOnly ? s.open : s.valid);
  }
  const series = trend(mockBugs, dates);
  assert.equal(series.at(-1)?.open, s.open);
  assert.equal(series.at(-1)?.p0, s.p0);
  assert.equal(series.at(-1)?.p1, s.p1);
  assert.equal(series.at(-1)?.p01, s.p0 + s.p1);
  assert.equal(s.p01, s.p0 + s.p1);
  assert.ok(s.open < summarize(snapshot(mockBugs, beforePeriod)).open);
  assert.equal(dates.length, 60);
  assert.ok(series.slice(-20).reduce((n, p) => n + p.closed - p.added, 0) > 0);
});
test('source events are chronological and current states match final events', () => {
  assert.equal(new Set(mockBugs.map(b => b.id)).size, mockBugs.length);
  for (const b of mockBugs) {
    assert.equal(b.currentStatus, b.history.at(-1)?.status);
    assert.equal(b.createdAt, b.history[0].at);
    assert.deepEqual(b.history.map(e => e.at), b.history.map(e => e.at).sort());
  }
  assert.ok(mockBugs.some(b => b.history.some((e, i) => i > 0 && b.history[i - 1].status === '已关闭' && isOpen(e.status))));
  assert.ok(mockBugs.some(b => b.history.some((e, i) => i > 0 && b.history[i - 1].status === '不处理' && isOpen(e.status))));
});

import realData from './feishu.json';
import defectTypeData from './defect-types.json';
import { beforePeriod as realStart, periodEnd as realEnd, dates as realDates, periodLabel, statusLabels, dashboardBugs, prepareDashboardBugs, sourceMeta } from './source';
test('Feishu snapshot is complete and all historical states reconcile', () => {
  const bugs = realData.bugs as Bug[];
  assert.equal(new Set(bugs.map(b => b.id)).size, realData.meta.recordCount);
  const s = summarize(snapshot(bugs, realEnd));
  assert.equal(s.total, realData.meta.recordCount);
  assert.equal(s.open + s.closed, s.valid);
  assert.equal(trend(bugs, realDates, '+08:00', realEnd).at(-1)?.open, s.open);
  assert.equal(trend(bugs, realDates, '+08:00', realEnd).at(-1)?.p01, s.p01);
  assert.equal(statusLabels.reduce((n, status) => n + bugs.filter(b => b.currentStatus === status).length, 0), s.total);
  for (const b of bugs) {
    assert.equal(b.history.at(-1)?.status, b.currentStatus);
    assert.equal(b.priorityHistory?.at(-1)?.priority, b.priority);
    assert.equal(b.history[0].at, b.createdAt);
    assert.deepEqual(b.history.map(e => e.at), b.history.map(e => e.at).sort());
  }
  assert.equal(summarize(snapshot(bugs, realStart)).open, 0);
});
test('Shanghai day boundary, priority history and partial-day cutoff are respected', () => {
  const b: Bug = { ...bug, createdAt: '2025-08-01T17:00:00.000Z', priority: 'P1', history: [{at:'2025-08-01T17:00:00.000Z',status:'待处理'},{at:'2025-08-02T02:00:00.000Z',status:'已关闭'}], priorityHistory:[{at:'2025-08-01T17:00:00.000Z',priority:'P0'},{at:'2025-08-02T01:00:00.000Z',priority:'P1'}] };
  const rows = trend([b], ['2025-08-01','2025-08-02'], '+08:00', '2025-08-02T00:00:00.000Z');
  assert.deepEqual(rows.map(r=>r.added),[0,1]);
  assert.deepEqual(rows.map(r=>r.open),[0,1]);
  assert.deepEqual(rows.map(r=>r.p0),[0,1]);
  assert.deepEqual(rows.map(r=>r.p01),[0,1]);
  assert.deepEqual(rows.map(r=>r.closed),[0,0]);
});
test('dashboard scope removes mobile bugs and groups slope and unassigned modules', () => {
  const sourceBugs = realData.bugs as Bug[];
  const mobileCount = sourceBugs.filter(b => b.module === '手机版本').length;
  const slopeCount = sourceBugs.filter(b => b.module.startsWith('斜坡')).length;
  const oldMapCount = sourceBugs.filter(b => b.module === '老地图').length;
  const unassignedCount = sourceBugs.filter(b => b.module === '未填写所属项目').length;
  const milkBarCount = sourceBugs.filter(b => b.module === '奶吧').length;
  const prepared = prepareDashboardBugs(sourceBugs);
  assert.equal(prepared.length, sourceBugs.length - mobileCount);
  assert.equal(prepared.some(b => b.module === '手机版本' || b.module.startsWith('斜坡')), false);
  assert.equal(prepared.filter(b => b.module === '老地图').length, oldMapCount + slopeCount);
  assert.equal(prepared.some(b => b.module === '未填写所属项目'), false);
  assert.equal(prepared.filter(b => b.module === '奶吧').length, milkBarCount + unassignedCount);
  assert.deepEqual(prepared, dashboardBugs);
  assert.equal(sourceMeta.recordCount, prepared.length);
});
test('defect types reproduce the Excel source distribution and cover the dashboard', () => {
  const byId = defectTypeData.byId as Record<string, string>;
  const supplementalIds = new Set(defectTypeData.meta.supplementalIds);
  const workbookValues = Object.entries(byId).filter(([id]) => !supplementalIds.has(id)).map(([, value]) => value);
  const sourceCounts = workbookValues.reduce<Record<string, number>>((counts, type) => ({ ...counts, [type]: (counts[type] ?? 0) + 1 }), {});
  assert.equal(workbookValues.length, defectTypeData.meta.recordCount);
  assert.equal(Object.keys(byId).length, defectTypeData.meta.recordCount + defectTypeData.meta.supplementalRecordCount);
  assert.deepEqual(sourceCounts, { '画面/渲染': 157, 'UI/交互': 32, '功能/逻辑': 19, '兼容性/适配': 9, '崩溃/卡死': 3, '音频': 1 });
  assert.equal(byId['7142154216'], '音频');
  assert.equal(dashboardBugs.every(bug => !!bug.defectType), true);
  assert.equal(dashboardBugs.filter(bug => bug.defectType === '未分类').length, dashboardBugs.filter(bug => !byId[bug.id]).length);
  assert.equal(distribution(dashboardBugs, 'defectType').reduce((sum, row) => sum + row.value, 0), dashboardBugs.length);
});
test('status breakdown excludes ignored bugs and combines repaired states', () => {
  const sample = [
    { ...bug, id: 'mainline', currentStatus: '主线测试中' },
    { ...bug, id: 'fixed', currentStatus: '已修复' },
    { ...bug, id: 'ignored', currentStatus: '不处理' },
    { ...bug, id: 'closed', currentStatus: '已关闭' }
  ];
  const rows = statusBreakdown(sample);
  assert.equal(rows.find(row => row.name === '已修复')?.value, 2);
  assert.equal(rows.find(row => row.name === '已关闭')?.value, 1);
  assert.equal(rows.some(row => row.name === '主线测试中' || row.name === '不处理'), false);
  assert.equal(rows.reduce((sum, row) => sum + row.value, 0), 3);
});
test('trend dates omit inactive days including the September 30 to October 7 gap', () => {
  const inactiveGap = Array.from({ length: 8 }, (_, i) => `2026-${i === 0 ? '09-30' : `10-0${i}`}`);
  assert.equal(realDates.includes('2026-09-29'), true);
  assert.equal(realDates.includes('2026-10-08'), true);
  assert.equal(inactiveGap.some(date => realDates.includes(date)), false);
  assert.ok(realDates.length > 0);
  assert.equal(realDates.every(date => date <= realData.meta.endDate), true);
  assert.match(periodLabel, /^2026\.09\.29 \/ 2026\.10\.08/);
});
