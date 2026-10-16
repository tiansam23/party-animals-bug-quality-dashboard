import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { EChartsOption } from 'echarts';
import Chart from './components/Chart';
import { distribution, isOpen, priorities, snapshot, statusBreakdown, summarize, trend, type Bug } from './data/model';
import { activityDates, allDates, source, periodEnd, sourceMeta, syncLabel } from './data/source';
const C = { blue: '#568bed', green: '#52bd9b', yellow: '#edc46b', red: '#ec707b', orange: '#e79d66', muted: '#6d7c93' };
const priorityColors = [C.red, C.orange, C.blue, '#65738b'];
const textStyle = { color: '#8190a6', fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', fontSize: 11 };
const tooltip = { backgroundColor: '#1c2636', borderColor: '#354259', textStyle: { color: '#e5eaf2', fontSize: 12 }, padding: 14 };
const axis = { axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: '#74839a', fontSize: 11 }, splitLine: { lineStyle: { color: '#252e3d', type: 'dashed' as const } } };
function Panel({ title, eyebrow, children, className = '', action }: { title: string; eyebrow: string; children: ReactNode; className?: string; action?: ReactNode }) {
  return <section className={`panel ${className}`}><div className="panel-head"><div><h2>{title}</h2><p>{eyebrow}</p></div>{action}</div>{children}</section>;
}
function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return <div className="toggle" role="group" aria-label="统计视角"><button aria-pressed={!value} className={!value ? 'active' : ''} onClick={() => onChange(false)}>全部有效</button><button aria-pressed={value} className={value ? 'active' : ''} onClick={() => onChange(true)}>未关闭</button></div>;
}
export default function App() {
  const [bugs, setBugs] = useState<Bug[]>([]);
  const [moduleOpen, setModuleOpen] = useState(false);
  const [priorityOpen, setPriorityOpen] = useState(false);
  const [rangeStart, setRangeStart] = useState(allDates[0]);
  const [rangeEnd, setRangeEnd] = useState(allDates.at(-1) ?? allDates[0]);
  const [hideInactiveDates, setHideInactiveDates] = useState(true);
  const [rangePreset, setRangePreset] = useState('all');
  const [rangeOpen, setRangeOpen] = useState(false);
  useEffect(() => { source.load().then(setBugs); }, []);
  const calendarDates = useMemo(() => allDates.filter(date => date >= rangeStart && date <= rangeEnd), [rangeStart, rangeEnd]);
  const dataDates = useMemo(() => activityDates.filter(date => date >= rangeStart && date <= rangeEnd), [rangeStart, rangeEnd]);
  const rangeDates = hideInactiveDates ? dataDates : calendarDates;
  const rangeEndTimestamp = rangeEnd === allDates.at(-1) ? periodEnd : new Date(`${rangeEnd}T23:59:59.999+08:00`).toISOString();
  const beforeRangeStart = new Date(Date.parse(`${rangeStart}T00:00:00+08:00`) - 1).toISOString();
  const cutoffLabel = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(rangeEndTimestamp));
  const current = useMemo(() => snapshot(bugs, rangeEndTimestamp), [bugs, rangeEndTimestamp]);
  const summary = useMemo(() => summarize(current), [current]);
  const start = useMemo(() => summarize(snapshot(bugs, beforeRangeStart)), [bugs, beforeRangeStart]);
  const points = useMemo(() => trend(bugs, rangeDates, '+08:00', rangeEndTimestamp), [bugs, rangeDates, rangeEndTimestamp]);
  const valid = current.filter(b => b.currentStatus !== '不处理');
  const moduleBugs = moduleOpen ? valid.filter(b => isOpen(b.currentStatus)) : valid;
  const priorityBugs = priorityOpen ? valid.filter(b => isOpen(b.currentStatus)) : valid;
  const modules = distribution(moduleBugs, 'module');
  const priorityData = priorities.map((name, i) => ({ name, value: priorityBugs.filter(b => b.priority === name).length, itemStyle: { color: priorityColors[i] } }));
  const statusData = statusBreakdown(current);
  const statusTotal = statusData.reduce((sum, status) => sum + status.value, 0);
  const desktopDateInterval = rangeDates.length <= 10 ? 0 : Math.max(0, Math.ceil(rangeDates.length / 8) - 1);
  const change = summary.open - start.open;
  const updateStart = (value: string) => { setRangeStart(value); if (value > rangeEnd) setRangeEnd(value); setRangePreset('custom'); };
  const updateEnd = (value: string) => { setRangeEnd(value); if (value < rangeStart) setRangeStart(value); setRangePreset('custom'); };
  const applyPreset = (value: string) => {
    setRangePreset(value);
    if (value === 'custom') return;
    const dayCount = value === 'all' ? allDates.length : Number(value);
    setRangeStart(allDates[Math.max(0, allDates.length - dayCount)]);
    setRangeEnd(allDates.at(-1) ?? allDates[0]);
  };
  const trendOption = useMemo<EChartsOption>(() => ({
    animation: false, textStyle, media: [{ query: { maxWidth: 500 }, option: { grid: { top: 94 }, xAxis: { axisLabel: { interval: Math.max(0, Math.ceil(rangeDates.length / 4) - 1) } } } }, { option: { grid: { top: 66 }, xAxis: { axisLabel: { interval: desktopDateInterval } } } }], tooltip: { ...tooltip, trigger: 'axis', axisPointer: { type: 'cross', label: { backgroundColor: '#334259' } } },
    legend: { top: 0, left: 0, itemWidth: 13, itemHeight: 8, itemGap: 22, textStyle: { color: '#a5b1c3', fontSize: 11 }, data: ['每日新增', '每日关闭', '未关闭存量', '未关闭 P0/P1'] },
    grid: { left: 43, right: 45, top: 66, bottom: 70 },
    xAxis: { ...axis, type: 'category', data: rangeDates.map(d => d.slice(5).replace('-', '/')), axisLabel: { color: '#74839a', interval: desktopDateInterval }, splitLine: { show: false } },
    yAxis: [{ ...axis, type: 'value', name: '每日数量', nameTextStyle: { color: '#74839a', padding: [0, 0, 8, 0] }, min: 0 }, { ...axis, type: 'value', name: '未关闭存量', nameTextStyle: { color: '#74839a', padding: [0, 0, 8, 0] }, min: 0, splitLine: { show: false } }],
    dataZoom: [{ type: 'inside', start: 0, end: 100 }, { type: 'slider', bottom: 5, height: 22, borderColor: '#2b3545', backgroundColor: '#111925', fillerColor: '#526b9322', handleStyle: { color: '#74849b', borderWidth: 0 }, moveHandleSize: 0, textStyle, dataBackground: { lineStyle: { color: '#526078' }, areaStyle: { color: '#26334a' } }, selectedDataBackground: { lineStyle: { color: '#8393ac' }, areaStyle: { color: '#374b6b' } } }],
    series: [
      { name: '每日新增', type: 'bar', data: points.map(p => p.added), itemStyle: { color: C.blue, opacity: .78, borderRadius: [2, 2, 0, 0] }, barMaxWidth: 8, barGap: '25%' },
      { name: '每日关闭', type: 'bar', data: points.map(p => p.closed), itemStyle: { color: C.green, opacity: .72, borderRadius: [2, 2, 0, 0] }, barMaxWidth: 8 },
      ...([{ name: '未关闭存量', key: 'open', color: C.yellow, width: 3 }, { name: '未关闭 P0/P1', key: 'p01', color: C.red, width: 1.8 }] as const).map(s => ({ name: s.name, type: 'line' as const, yAxisIndex: 1, data: points.map(p => p[s.key]), symbol: 'none', smooth: false, lineStyle: { width: s.width, color: s.color }, itemStyle: { color: s.color }, z: 5 }))
    ]
  }), [desktopDateInterval, points, rangeDates]);
  const moduleOption: EChartsOption = { animation: false, textStyle, tooltip: { ...tooltip, trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: v => `${v} 个` }, grid: { top: 1, bottom: 1, left: 100, right: 78 }, xAxis: { type: 'value', show: false, max: Math.max(...modules.map(m => m.value), 1) * 1.1 }, yAxis: { type: 'category', inverse: true, data: modules.map(m => m.name), ...axis, axisLabel: { color: '#a2aec0', fontSize: 9, margin: 8 }, splitLine: { show: false } }, series: [{ type: 'bar', barWidth: 5, data: modules.map((m, i) => ({ value: m.value, itemStyle: { color: i === 0 ? '#7295c5' : '#496384', borderRadius: 3 } })), label: { show: true, position: 'right', distance: 8, color: '#bdc7d6', fontSize: 9, formatter: p => `${p.value}  ${modules[p.dataIndex].percent.toFixed(1)}%` } }] };
  const pieOption: EChartsOption = { animation: false, textStyle, tooltip: { ...tooltip, trigger: 'item', formatter: '{b}：{c}（{d}%）' }, series: [{ type: 'pie', radius: ['66%', '84%'], center: ['50%', '50%'], avoidLabelOverlap: true, label: { show: false }, itemStyle: { borderColor: '#141c28', borderWidth: 4, borderRadius: 3 }, data: priorityData }] };
  const statusOption: EChartsOption = { animation: false, textStyle, tooltip: { ...tooltip, trigger: 'axis', axisPointer: { type: 'shadow' } }, grid: { top: 22, left: 34, right: 8, bottom: 28 }, xAxis: { ...axis, type: 'category', data: statusData.map(status => status.name), axisLabel: { color: '#8c9bb0', interval: 0, fontSize: 10, formatter: (value: string) => value.length > 3 ? value.slice(0, 2) + '\n' + value.slice(2) : value }, splitLine: { show: false } }, yAxis: { ...axis, type: 'value', splitNumber: 3 }, series: [{ type: 'bar', barMaxWidth: 31, label: { show: true, position: 'top', color: '#b7c3d4', fontSize: 11 }, data: statusData.map((status, i) => ({ value: status.value, itemStyle: { color: status.name === '已关闭' ? '#4f9d86' : status.name === '已修复' ? '#4e91a7' : ['#6586b4', '#7787bd', '#b49d69'][i % 3], borderRadius: [3, 3, 0, 0] } })) }] };
  return <main className="app-shell mx-auto w-full"><header className="header flex items-center justify-between"><div className="brand flex items-center"><img className="game-icon" src="/party-animals-icon.png" alt="猛兽派对游戏图标"/><div><div className="brand-line"><h1>PARTY ANIMALS</h1><span className="slash">/</span><span>QUALITY INSIGHTS</span></div><p>猛兽派对 · 游戏测试质量看板</p></div></div><div className="header-meta flex items-center"><a className="demo real-data" href={sourceMeta.url} target="_blank" rel="noreferrer"><i/>飞书视图快照</a><span className="version">V1.0</span></div></header>
    <div className="page-heading flex items-center justify-between"><div><div className="context"><span>TRUNK 2025</span><b>/</b><span>视图范围</span><b>/</b><span>BUG QUALITY</span></div></div><div className="date-block date-filter"><button className="range-trigger" aria-expanded={rangeOpen} aria-controls="range-popover" onClick={() => setRangeOpen(open => !open)}><span className="range-icon">▦</span><span className="range-trigger-copy"><small>统计范围 · {dataDates.length} 个数据日</small><strong>{rangeStart.slice(5).replace('-', '/')}<i>→</i>{rangeEnd.slice(5).replace('-', '/')}</strong></span>{hideInactiveDates && <span className="range-status"><i/>已隐藏空白日</span>}<span className={`range-chevron ${rangeOpen ? 'open' : ''}`}>⌄</span></button>{rangeOpen && <div className="range-popover" id="range-popover" role="dialog" aria-label="时间范围设置"><div className="range-popover-head"><div><strong>时间范围</strong><span>{calendarDates.length} 个自然日 · {dataDates.length} 个数据日</span></div><button aria-label="关闭时间范围设置" onClick={() => setRangeOpen(false)}>×</button></div><div className="range-presets" aria-label="快捷时间范围">{[['7', '最近 7 天'], ['14', '最近 14 天'], ['all', '全部']] .map(([value, label]) => <button key={value} className={rangePreset === value ? 'active' : ''} onClick={() => applyPreset(value)}>{label}</button>)}</div><div className="range-date-row"><label><span>开始日期</span><input aria-label="开始日期" type="date" min={allDates[0]} max={allDates.at(-1)} value={rangeStart} onChange={event => updateStart(event.target.value)}/></label><span className="range-arrow">→</span><label><span>结束日期</span><input aria-label="结束日期" type="date" min={allDates[0]} max={allDates.at(-1)} value={rangeEnd} onChange={event => updateEnd(event.target.value)}/></label></div><label className="range-toggle"><span><strong>隐藏无数据日</strong><small>趋势图自动省略没有任何活动的日期</small></span><input type="checkbox" checked={hideInactiveDates} onChange={event => setHideInactiveDates(event.target.checked)}/><i aria-hidden="true"/></label></div>}</div></div>
    <div className="dashboard-grid">
      <Panel className="trend-panel" title="Bug 收敛趋势" eyebrow="BUG CONVERGENCE" action={<span className="subtle-badge"><i/>北京时间</span>}>
        <div className="trend-stats"><div><span>期末未关闭</span><strong>{summary.open}<small>个</small></strong></div><div className="stat-divider"/><div><span>周期存量变化</span><strong className={change <= 0 ? 'positive small-stat' : 'negative small-stat'}>{change <= 0 ? '↘' : '↗'} {Math.abs(change)}<small>个</small></strong></div><span className="trend-note">历史日取日末 · 当日截至同步时刻</span></div>
        <Chart option={trendOption} label="当前视图缺陷的每日新增、关闭及未关闭总量、P0/P1合并存量趋势"/>
        <div className="panel-foot"><span><i className="hint-dot"/>点击图例显示 / 隐藏数据</span><span>拖动滑块缩放时间范围</span></div>
      </Panel>
      <Panel className="module-panel" title="Bug 模块分布" eyebrow="MODULE DISTRIBUTION" action={<Toggle value={moduleOpen} onChange={setModuleOpen}/>}><div className="mini-caption"><span>{moduleOpen ? '未关闭' : '有效'} Bug · {moduleBugs.length} 个</span><span title={sourceMeta.moduleMethod}>所属项目 · {modules.length} 项 · 完整显示</span></div><div className="module-chart"><Chart option={moduleOption} label="按所属项目归类，数量降序排列的Bug模块分布"/></div></Panel>
      <Panel className="priority-panel" title="Bug 优先级占比" eyebrow="PRIORITY BREAKDOWN" action={<Toggle value={priorityOpen} onChange={setPriorityOpen}/>}><div className="priority-content"><div className="donut"><Chart option={pieOption} label="P0、P1、P2、P3优先级占比"/><div className="donut-center"><strong>{priorityBugs.length}</strong><span>{priorityOpen ? '未关闭 BUG' : '有效 BUG'}</span></div></div><div className="priority-legend"><div className="legend-heading"><span>优先级</span><span>数量</span><span>占比</span></div>{priorityData.map((p, i) => <div className="priority-row" key={p.name}><span><i style={{ background: priorityColors[i] }}/>{p.name}</span><strong>{p.value}</strong><span>{(priorityBugs.length ? p.value / priorityBugs.length * 100 : 0).toFixed(1)}%</span></div>)}</div></div><div className="priority-foot">{priorityOpen ? '仅统计当前未关闭的有效 Bug' : '排除“不处理”状态的 Bug'}</div></Panel>
      <Panel className="status-panel" title="Bug 状态分布" eyebrow="STATUS DISTRIBUTION" action={<span className="mini-total">有效 {statusTotal}</span>}><Chart option={statusOption} label="有效Bug状态分布，已修复包含主线测试中和已修复状态"/><div className="bottom-note">排除“不处理” · “已修复”包含主线测试中和已修复状态</div></Panel>
      <Panel className="change-panel" title="Bug 净变化值" eyebrow="NET BACKLOG CHANGE"><div className={`net-value ${change <= 0 ? 'positive' : 'negative'}`}><span>{change <= 0 ? '↘' : '↗'}</span>{change > 0 ? '+' : ''}{change}<small>个</small></div><div className={`net-badge ${change <= 0 ? 'positive' : 'negative'}`}>{change <= 0 ? '净减少' : '净增加'} <span>·</span> {start.open ? `${(Math.abs(change) / start.open * 100).toFixed(1)}%` : '期初为 0，不计算比例'}</div><p className="net-description">{change <= 0 ? '未关闭存量下降，缺陷持续收敛' : '未关闭存量上升，关注缺陷消化进度'}</p><div className="net-comparison"><div><span>期初存量</span><strong>{start.open}</strong></div><span className="arrow">→</span><div><span>期末存量</span><strong>{summary.open}</strong></div></div></Panel>
      <Panel className="summary-panel" title="Bug 数据摘要" eyebrow="QUALITY SNAPSHOT" action={<span className="mini-total">截至 {cutoffLabel}</span>}><div className="summary-primary"><span>有效 Bug 总数</span><strong>{summary.valid.toLocaleString()}<small>个</small></strong></div><div className="summary-grid summary-grid-combined">{[{ label: '未关闭 Bug', value: summary.open, color: C.yellow }, { label: '已关闭 Bug', value: summary.closed, color: C.green }, { label: '未关闭 P0/P1', value: summary.p01, color: C.red }].map(x => <div key={x.label}><span><i style={{ background: x.color }}/>{x.label}</span><strong>{x.value}</strong></div>)}</div></Panel>
    </div><footer className="footer"><span><i/>飞书视图 · {summary.total} 条 · 同步于 {syncLabel} · 非实时</span><span>PARTY ANIMALS <b>/</b> QA ANALYTICS <b>·</b> V1</span></footer>
  </main>;
}
