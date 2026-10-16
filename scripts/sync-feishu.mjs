import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const exec = promisify(execFile);
const project = '66a5b8796b0cb0f9ff324b93', view = 'MiKW6B9vR';
async function cli(args) {
  const { stdout } = await exec('meegle', [...args, '--format', 'json'], { maxBuffer: 20 * 1024 * 1024 });
  const data = JSON.parse(stdout); if (data.error) throw new Error(JSON.stringify(data.error)); return data;
}
const auth = await cli(['auth','status']);
if (!auth.authenticated || auth.host !== 'project.feishu.cn') throw new Error('请先运行 meegle auth login --device-code --host project.feishu.cn');
const cached = false;
const fields = []; let page = 1;
do {
  const result = cached ? JSON.parse(await readFile(`/private/tmp/pa-fields${page === 1 ? '' : page}.json`, 'utf8')) : await cli(['workitem','meta-fields','--project-key',project,'--work-item-type','issue','--params',JSON.stringify({page_num:page})]);
  fields.push(...result.list); if (!result.pagination.has_more) break; page++;
} while (true);
const statusMap = Object.fromEntries(fields.find(f=>f.field_key==='work_item_status').option.map(o=>[o.option_id,o.option_name]));
const priorityMap = Object.fromEntries(fields.find(f=>f.field_key==='priority').option.map(o=>[o.option_id,o.option_name]));
const items=[]; page=1; let expected;
do {
  const result = cached ? JSON.parse(await readFile(`/private/tmp/pa-view${page}.json`, 'utf8')) : await cli(['view','get','--project-key',project,'--view-id',view,'--fields',JSON.stringify(['priority','field_78633d','field_19968c']),'--params',JSON.stringify({page_num:page})]);
  expected ??= result.pagination.total;
  items.push(...result.work_item_list); if (!result.pagination.has_more) break; page++;
} while (true);
if (items.length!==expected || new Set(items.map(i=>i.work_item_attribute.work_item_id)).size!==expected) throw new Error('视图分页不完整或读取期间发生变化，请重新同步');
const result=[]; let next=0; let completed=0;
await mkdir('/private/tmp/pa-history-cache',{recursive:true});
async function worker() {
  while (next<items.length) {
    const item=items[next++], a=item.work_item_attribute, id=a.work_item_id;
    const records=[]; let cursor;
    do {
      const params={project_key:project,work_item_id:id,...(cursor?{start_from:cursor}:{})};
      const data=await cli(['workitem','list-op-records','--params',JSON.stringify(params)]);
      records.push(...data.op_records);
      if(!data.has_more) break;
      if(!data.start_from || data.start_from===cursor) throw new Error(`历史分页不完整: ${id}`);
      cursor=data.start_from;
    } while(true);
    // Store only non-personal fields needed for audit/replay; omit names, email and descriptions.
    const changes=records.flatMap(r=>r.record_contents.map(c=>({time:r.operation_time,module:r.op_record_module,type:r.operation_type,field:c.object?.object_value,property:c.object_property,old:c.old,new:c.new}))).sort((a,b)=>a.time-b.time);
    await writeFile(`/private/tmp/pa-history-cache/${id}.json`,JSON.stringify({attribute:{id,createdAt:a.create_time,currentStatus:a.work_item_status.name},changes}));
    const transitions=changes.filter(c=>c.property==='workitem_status' && c.new?.length && (c.field==='work_item_status'||c.module==='work_item_mod'));
    const unique=transitions.filter((c,i)=>transitions.findIndex(x=>x.time===c.time&&x.new[0]===c.new[0]&&x.old?.[0]===c.old?.[0])===i);
    const initialKey=unique[0]?.old?.[0];
    const history=[{at:new Date(a.create_time).toISOString(),status:initialKey?statusMap[initialKey]:a.work_item_status.name}];
    for(const c of unique) {
      const state=statusMap[c.new[0]]; if(!state) throw new Error(`未知状态 ${c.new[0]}`);
      if(history.at(-1).status!==state) history.push({at:new Date(c.time).toISOString(),status:state});
    }
    if(history.at(-1).status!==a.work_item_status.name) throw new Error(`状态历史与快照不一致 ${id}`);
    const priority=item.work_item_fields.find(f=>f.key==='priority')?.value?.label;
    if(!priorityMap || !['P0','P1','P2','P3'].includes(priority)) throw new Error(`缺少优先级 ${id}`);
    const priorityChanges=changes.filter(c=>c.field==='priority'&&c.new?.length);
    const priorityHistory=[{at:new Date(a.create_time).toISOString(),priority:priorityChanges[0]?.old?.[0] ? priorityMap[priorityChanges[0].old[0]] : priority}];
    for(const c of priorityChanges) {
      const p=priorityMap[c.new[0]]; if(!p) throw new Error(`未知优先级 ${id}`);
      priorityHistory.push({at:new Date(c.time).toISOString(),priority:p});
    }
    if(priorityHistory.some(e=>!e.priority)||priorityHistory.at(-1).priority!==priority) throw new Error(`优先级历史不一致 ${id}`);
    const module=item.work_item_fields.find(f=>f.key==='field_19968c')?.value?.name || '未填写所属项目';
    result.push({id,createdAt:new Date(a.create_time).toISOString(),module,priority,currentStatus:a.work_item_status.name,history,priorityHistory});
    completed++; if(completed%10===0||completed===items.length) console.log(`状态历史 ${completed}/${items.length}`);
  }
}
await Promise.all([worker(),worker(),worker()]);
result.sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id));
const syncedAt=new Date().toISOString();
const localDate=t=>new Date(new Date(t).getTime()+8*3600000).toISOString().slice(0,10);
const data={meta:{source:'feishu',url:`https://project.feishu.cn/heo/issueView/${view}`,project,view,syncedAt,timeZone:'Asia/Shanghai',recordCount:result.length,startDate:localDate(result[0].createdAt),endDate:localDate(syncedAt),moduleMethod:'按飞书字段“所属项目”（field_19968c）归类；空值为未填写所属项目',scope:'当前视图成员的历史回放；不代表整个分支历史',statusLabels:[...new Set(result.map(b=>b.currentStatus))]},bugs:result};
await writeFile(new URL('../src/data/feishu.json',import.meta.url),JSON.stringify(data,null,2)+'\n');
console.log(JSON.stringify({records:result.length,statuses:Object.fromEntries(data.meta.statusLabels.map(s=>[s,result.filter(b=>b.currentStatus===s).length])),startDate:data.meta.startDate,endDate:data.meta.endDate}));
