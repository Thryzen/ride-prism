(function(root){
  'use strict';
  const l10n=(s,...values)=>{const t=v=>typeof I18n==='undefined'?v:I18n.t(v);return Array.isArray(s)?s.reduce((out,part,i)=>out+t(part)+(i<values.length?values[i]:''),''):t(s);};
  function bounds(data){
    let start=Infinity,end=-Infinity;
    for(const r of data.records)if(Number.isFinite(r.timestamp)){start=Math.min(start,r.timestamp);end=Math.max(end,r.timestamp);}
    for(const s of data.sessions){if(Number.isFinite(s.startTime))start=Math.min(start,s.startTime);if(Number.isFinite(s.timestamp))end=Math.max(end,s.timestamp);}
    return {start:start===Infinity?null:start,end:end===-Infinity?null:end};
  }
  function ordered(files){return files.slice().sort((a,b)=>(bounds(a.data).start??Infinity)-(bounds(b.data).start??Infinity));}
  function timerSeconds(data,range){
    if(data.sessions.length&&data.sessions.every(s=>Number.isFinite(s.timer)))return data.sessions.reduce((n,s)=>n+s.timer,0);
    if(range.start===null||range.end===null)return null;
    let stop=null,paused=0;
    for(const e of data.events.filter(e=>e.event===0&&Number.isFinite(e.timestamp)).slice().sort((a,b)=>a.timestamp-b.timestamp)){
      if([1,4,6,7,8,9].includes(e.eventType)){if(stop===null)stop=e.timestamp;}
      else if([0,5].includes(e.eventType)&&stop!==null){paused+=Math.max(0,Math.min(e.timestamp,range.end)-Math.max(stop,range.start));stop=null;}
    }
    if(stop!==null)paused+=Math.max(0,range.end-Math.max(stop,range.start));
    return Math.max(0,(range.end-range.start-paused)/1000);
  }
  function merge(files){
    const sorted=ordered(files),result={records:[],sessions:[],laps:[],events:[],devices:[],fileIds:[],counts:{},warnings:[],sources:[],distance:0,timer:0};
    let offset=0,latestEnd=null;
    sorted.forEach((file,index)=>{
      const data=file.data,range=bounds(data),records=data.records.slice().sort((a,b)=>(a.timestamp??Infinity)-(b.timestamp??Infinity));
      const first=records.find(r=>Number.isFinite(r.distance));let delta=0;
      const sourceId=index;
      for(const r of records){const local=Number.isFinite(r.distance)?Math.max(0,r.distance-(first?.distance??0)):null;const distance=sorted.length===1?r.distance:local===null?null:offset+local;if(local!==null)delta=Math.max(delta,local);result.records.push({...r,distance,sourceId});}
      const summaryDistance=data.sessions.length&&data.sessions.every(s=>Number.isFinite(s.distance))?data.sessions.reduce((sum,s)=>sum+s.distance,0):delta;
      const segmentDistance=Math.max(delta,summaryDistance);offset+=segmentDistance;
      for(const s of data.sessions)result.sessions.push({...s,sourceId});
      for(const lap of data.laps)result.laps.push({...lap,sourceId});
      for(const event of data.events)result.events.push({...event,sourceId});
      for(const device of data.devices||[])result.devices.push({...device,sourceId});
      for(const info of data.fileIds||[])result.fileIds.push({...info,sourceId});
      // Timer boundaries prevent a terminal stop in one file swallowing the next file.
      if(sorted.length>1&&range.start!==null){
        if(!data.events.some(e=>e.event===0&&(e.eventType===0||e.eventType===5)&&e.timestamp===range.start))result.events.push({timestamp:range.start,event:0,eventType:0,sourceId,synthetic:true});
        if(range.end!==null&&!data.events.some(e=>e.event===0&&[1,4,6,7,8,9].includes(e.eventType)&&e.timestamp===range.end))result.events.push({timestamp:range.end+1,event:0,eventType:4,sourceId,synthetic:true});
      }
      if(range.start===null)result.warnings.push(file.name+l10n('：缺少可用活动时间，无法准确排序或导出。'));
      if(latestEnd!==null&&range.start!==null&&range.start<latestEnd)result.warnings.push(file.name+l10n('：与之前文件存在重叠时段，所有记录均保留；摘要相加可能重复计入。'));
      if(range.end!==null)latestEnd=Math.max(latestEnd??range.end,range.end);
      for(const warning of data.warnings)result.warnings.push(file.name+': '+l10n(warning));
      for(const [id,count]of Object.entries(data.counts))result.counts[id]=(result.counts[id]||0)+count;
      const timer=timerSeconds(data,range);result.timer=timer===null||result.timer===null?null:result.timer+timer;
      result.sources.push({name:file.name,start:range.start,end:range.end,recordCount:records.length,distance:segmentDistance,timer,data,sourceId});
    });
    result.records.sort((a,b)=>(a.timestamp??Infinity)-(b.timestamp??Infinity)||a.sourceId-b.sourceId);
    result.events.sort((a,b)=>(a.timestamp??Infinity)-(b.timestamp??Infinity)||a.sourceId-b.sourceId);
    result.laps.sort((a,b)=>(a.startTime??a.timestamp??Infinity)-(b.startTime??b.timestamp??Infinity));
    result.sessions.sort((a,b)=>(a.startTime??Infinity)-(b.startTime??Infinity));
    result.distance=offset;return result;
  }
  const api={bounds,ordered,merge};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.FitMerge=api;
})(globalThis);
