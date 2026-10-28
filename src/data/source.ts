import data from './feishu.json';
import defectTypeData from './defect-types.json';
import type { Bug, BugSource } from './model';
const defectTypeById = defectTypeData.byId as Record<string, string>;
export function prepareDashboardBugs(bugs: Bug[]): Bug[] {
  return bugs
    .filter(bug => bug.module !== '手机版本')
    .map(bug => {
      const module = bug.module.startsWith('斜坡')
        ? '老地图'
        : bug.module === '未填写所属项目'
          ? '奶吧'
          : bug.module;
      return { ...bug, module, defectType: defectTypeById[bug.id] ?? '未分类' };
    });
}
export const dashboardBugs = prepareDashboardBugs(data.bugs as Bug[]);
export const sourceMeta = {
  ...data.meta,
  recordCount: dashboardBugs.length,
  moduleMethod: `${data.meta.moduleMethod}；排除“手机版本”，斜坡项目并入“老地图”，未填写所属项目并入“奶吧”`,
  defectTypeMethod: `按 ${defectTypeData.meta.source} 的“${defectTypeData.meta.sheet}”工作表“缺陷类型”字段归类；工作项 7142154216 按内容补为音频；其他未匹配记录显示为“未分类”`
};
export const allDates = Array.from({ length: Math.round((Date.parse(data.meta.endDate) - Date.parse(data.meta.startDate)) / 86400000) + 1 }, (_, i) => new Date(Date.parse(data.meta.startDate) + i * 86400000).toISOString().slice(0, 10));
const dateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' });
const activityDateSet = new Set(dashboardBugs.flatMap(bug => [bug.createdAt, ...bug.history.map(event => event.at), ...(bug.priorityHistory ?? []).map(event => event.at)]).map(at => dateFormatter.format(new Date(at))));
export const activityDates = allDates.filter(date => activityDateSet.has(date));
export const dates = activityDates;
const formatDate = (date: string) => date.replaceAll('-', '.');
const periodSegments: string[] = [];
for (let start = 0; start < dates.length;) {
  let end = start;
  while (end + 1 < dates.length && Date.parse(dates[end + 1]) - Date.parse(dates[end]) === 86400000) end += 1;
  periodSegments.push(start === end ? formatDate(dates[start]) : `${formatDate(dates[start])} — ${formatDate(dates[end])}`);
  start = end + 1;
}
export const periodLabel = periodSegments.join(' / ');
export const beforePeriod = new Date(Date.parse(`${data.meta.startDate}T00:00:00+08:00`) - 1).toISOString();
export const periodEnd = data.meta.syncedAt;
export const source: BugSource = { load: async () => dashboardBugs };
export const statusLabels = ['待处理', '修复中', '已解决', '主线测试中', '重新打开', '待复现', '已关闭', '不处理', ...data.meta.statusLabels].filter((s, i, a) => a.indexOf(s) === i && (s === '不处理' || dashboardBugs.some(b => b.currentStatus === s)));
export const syncLabel = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(periodEnd));
