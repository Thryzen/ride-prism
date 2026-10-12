(function(root){
  'use strict';
  const l10n=(s,...values)=>{const t=v=>typeof I18n==='undefined'?v:I18n.t(v);return Array.isArray(s)?s.reduce((out,part,i)=>out+t(part)+(i<values.length?values[i]:''),''):t(s);};
  const stops=new Set([1,4,6,7,8,9]);
  const starts=new Set([0,5]);
  function pauseIntervals(events,min,max){
    const timers=events.filter(e=>e.event===0&&Number.isFinite(e.timestamp)&&(starts.has(e.eventType)||stops.has(e.eventType))).slice().sort((a,b)=>a.timestamp-b.timestamp);
    const intervals=[];let stoppedAt=null;
    for(const event of timers){
      if(stops.has(event.eventType)){if(stoppedAt===null)stoppedAt=event.timestamp;}
      else if(stoppedAt!==null){if(event.timestamp>stoppedAt)intervals.push([stoppedAt,event.timestamp]);stoppedAt=null;}
    }
    if(stoppedAt!==null)intervals.push([stoppedAt,Infinity]);
    return intervals.filter(([start,end])=>start<=max&&end>min).map(([start,end])=>[Math.max(min,start),end]);
  }
  const median=values=>{const a=values.slice().sort((x,y)=>x-y),n=a.length;return n?(a[Math.floor((n-1)/2)]+a[Math.floor(n/2)])/2:null;};
  function orderedRecords(records){const a=records.filter(r=>Number.isFinite(r.timestamp));if(a.some((r,i)=>i&&r.timestamp<a[i-1].timestamp))a.sort((x,y)=>x.timestamp-y.timestamp);return a;}
  function sampleGroups(records,events=[]){
    const ordered=orderedRecords(records),groups=new Map();if(!ordered.length)return groups;
    const pauses=pauseIntervals(events,ordered[0].timestamp,ordered[ordered.length-1].timestamp);let pi=0;
    for(let i=1;i<ordered.length;i++){
      const a=ordered[i-1],b=ordered[i],delta=b.timestamp-a.timestamp;
      if(a.sourceId!==b.sourceId||delta<=0)continue;
      while(pi<pauses.length&&pauses[pi][1]<=a.timestamp)pi++;
      if(pi<pauses.length&&pauses[pi][0]<b.timestamp&&pauses[pi][1]>a.timestamp)continue;
      if(!groups.has(b.sourceId))groups.set(b.sourceId,[]);groups.get(b.sourceId).push(delta);
    }
    return groups;
  }
  // Rank of a one-sided nonparametric upper tolerance bound, under IID sampling.
  // P(F(X_(rank)) >= coverage) = P(Binomial(n, 1-coverage) > n-rank).
  function toleranceRank(n,coverage=.99,target=.95){
    const maximumConfidence=1-Math.pow(coverage,n);
    if(maximumConfidence<target)return {rank:n,confidence:maximumConfidence,supported:false};
    let probability=Math.pow(coverage,n),cdf=probability,j=0;
    while(j<n){const next=probability*(n-j)/(j+1)*(1-coverage)/coverage;if(cdf+next>1-target)break;probability=next;cdf+=next;j++;}
    return {rank:n-j,confidence:1-cdf,supported:true};
  }
  function estimateGaps(records,events=[]){
    const groups=sampleGroups(records,events),details=[];
    if(!groups.size)return {threshold:null,reason:l10n('没有可用的同文件正采样间隔。'),groups:[]};
    const target=1-.05/groups.size;
    for(const [sourceId,all] of groups){
      // Evenly sample the entire source, rather than inspecting only its beginning.
      const sample=all.length<=4096?all: Array.from({length:4096},(_,i)=>all[Math.floor(i*(all.length-1)/4095)]);
      const centre=median(sample),mad=median(sample.map(v=>Math.abs(v-centre)));
      const cutoff=Math.max(6*centre,centre+6*1.4826*mad);
      const normal=sample.filter(v=>v<=cutoff),sorted=normal.slice().sort((a,b)=>a-b),cadence=median(normal);
      const quarter=Math.max(1,Math.floor(normal.length/4)),first=median(normal.slice(0,quarter)),last=median(normal.slice(-quarter));
      const unstable=Math.max(first,last)/Math.min(first,last)>2||mad/centre>.75||normal.length/sample.length<.8;
      const bound=toleranceRank(normal.length,.99,target);
      const upper=sorted[Math.max(0,bound.rank-1)];
      const lower=Math.ceil(Math.max(3*cadence,upper+cadence)/100)/10;
      const high=Math.ceil(Math.max(10*cadence,lower*2000)/100)/10;
      details.push({sourceId,cadence:cadence/1000,hz:1000/cadence,n:normal.length,total:all.length,excluded:sample.length-normal.length,threshold:lower,range:[lower,high],confidence:bound.confidence,supported:bound.supported,unstable});
    }
    if(details.some(d=>d.n<20||d.unstable))return {threshold:null,groups:details,reason:details.some(d=>d.n<20)?l10n('至少一个文件不足 20 个参考间隔，暂不自动填入。'):l10n('采样节奏变化较大，无法可靠区分正常采样与长间隔，请手动设置。')};
    const threshold=Math.max(...details.map(d=>d.threshold)),high=Math.max(...details.map(d=>d.range[1]));
    return {threshold,range:[threshold,high],groups:details,confidence:Math.max(0,1-details.reduce((s,d)=>s+1-d.confidence,0)),supported:details.every(d=>d.supported),reason:''};
  }
  function prepare(records,events=[],options={}){
    const ordered=orderedRecords(records);
    const threshold=(options.gapThresholdSeconds??60)*1000;
    if(options.compressGaps&&(!Number.isFinite(threshold)||threshold<=0))throw new RangeError(l10n('长采样门槛必须为大于 0 的秒数。'));
    if(!ordered.length)return {records:[],removed:0,pausedMs:0,gapMs:0,pauseCount:0,eventPauseCount:0,gapCount:0};
    const min=ordered[0].timestamp,max=ordered[ordered.length-1].timestamp;
    const eventIntervals=pauseIntervals(events,min,max);
    const intervals=options.skipPauses?eventIntervals:[];
    const recordsOut=[];let index=0,offset=0,removed=0;
    for(const r of ordered){
      while(index<intervals.length&&r.timestamp>=intervals[index][1]){offset+=intervals[index][1]-intervals[index][0];index++;}
      if(index<intervals.length&&r.timestamp>=intervals[index][0]){removed++;continue;}
      recordsOut.push({...r,chartTimestamp:r.timestamp-offset});
    }
    const pausedMs=intervals.reduce((total,[start,end])=>total+Math.max(0,Math.min(end,max)-start),0);
    let gapMs=0,gapCount=0;
    if(options.compressGaps){
      const groups=sampleGroups(ordered,events),cadences=new Map();
      for(const [id,samples]of groups)cadences.set(id,median(samples.filter(d=>d<=threshold))??Math.min(1000,threshold));
      let prev=null,source=null;
      for(const r of recordsOut){const original=r.chartTimestamp;if(prev!==null&&source===r.sourceId&&original-prev>threshold){gapMs+=original-prev-(cadences.get(r.sourceId)??Math.min(1000,threshold));gapCount++;}r.chartTimestamp-=gapMs;prev=original;source=r.sourceId;}
    }
    return {records:recordsOut,removed,pausedMs,gapMs,pauseCount:eventIntervals.length,eventPauseCount:eventIntervals.length,gapCount};
  }
  function diagnostics(records,events,sessions=[]){
    const types=new Map();let timerCount=0,missingTime=0,longestGap=0,prev=null;
    for(const e of events){const key=l10n`${e.event??l10n('缺失')}/${e.eventType??l10n('缺失')}`;types.set(key,(types.get(key)||0)+1);if(e.event===0){timerCount++;if(!Number.isFinite(e.timestamp))missingTime++;}}
    for(const r of records)if(Number.isFinite(r.timestamp)){if(prev!==null)longestGap=Math.max(longestGap,r.timestamp-prev);prev=r.timestamp;}
    const summaryPause=sessions.reduce((sum,s)=>sum+(Number.isFinite(s.elapsed)&&Number.isFinite(s.timer)?Math.max(0,s.elapsed-s.timer):0),0);
    return {eventCount:events.length,timerCount,missingTime,longestGap,summaryPause,types:[...types.entries()]};
  }
  const api={prepare,pauseIntervals,diagnostics,estimateGaps,toleranceRank};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ChartTimeline=api;
})(globalThis);
