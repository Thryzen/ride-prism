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
  function cadenceCycles(records,events=[]){
    const groups=new Map();for(const r of orderedRecords(records)){if(!groups.has(r.sourceId))groups.set(r.sourceId,[]);groups.get(r.sourceId).push(r);}
    let cycles=0,seconds=0;
    for(const [sourceId,rows]of groups){
      if(rows.length<2)continue;
      const intervals=rows.slice(1).map((r,i)=>(r.timestamp-rows[i].timestamp)/1000).filter(dt=>dt>0&&dt<=60);
      const limit=Math.min(60,Math.max(10,3*(median(intervals)||1)));
      const pauses=pauseIntervals(events.filter(e=>e.sourceId===sourceId),rows[0].timestamp,rows[rows.length-1].timestamp);let pi=0;
      for(let i=1;i<rows.length;i++){
        const a=rows[i-1],b=rows[i],dt=(b.timestamp-a.timestamp)/1000;
        if(dt<=0||dt>limit||![a.cadence,b.cadence].every(c=>Number.isFinite(c)&&c>=0))continue;
        function integrate(start,end){
          if(end<=start)return;
          const c=t=>a.cadence+(b.cadence-a.cadence)*(t-a.timestamp)/(b.timestamp-a.timestamp),s=(end-start)/1000;
          cycles+=(c(start)+c(end))/2*s/60;seconds+=s;
        }
        let cursor=a.timestamp;while(pi<pauses.length&&pauses[pi][1]<=cursor)pi++;
        for(let j=pi;j<pauses.length&&pauses[j][0]<b.timestamp;j++){
          integrate(cursor,Math.min(b.timestamp,pauses[j][0]));cursor=Math.max(cursor,pauses[j][1]);if(cursor>=b.timestamp)break;
        }
        integrate(cursor,b.timestamp);
      }
    }
    return seconds>0?cycles:null;
  }
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
  function heartRateZones(records,events=[],bounds,options={}){
    if(!Array.isArray(bounds)||bounds.length!==4||bounds.some((v,i)=>!Number.isFinite(v)||v<=0||(i&&v<=bounds[i-1])))throw new RangeError('Invalid heart-rate boundaries');
    return durationDistribution(records,events,bounds,'heartRate',options);
  }
  function gradeDurations(records,events=[],options={}){
    const result=durationDistribution(records,events,[-1,1],'grade',options);
    return {flat:result.total?result.seconds[1]:null,uphill:result.total?result.seconds[2]:null,downhill:result.total?result.seconds[0]:null,total:result.total};
  }
  function durationDistribution(records,events,bounds,key,options){
    const seconds=Array(bounds.length+1).fill(0),groups=new Map();
    for(const r of orderedRecords(records)){if(!groups.has(r.sourceId))groups.set(r.sourceId,[]);groups.get(r.sourceId).push(r);}
    for(const [sourceId,rows]of groups){
      if(rows.length<2)continue;
      const samples=rows.slice(1).map((r,i)=>(r.timestamp-rows[i].timestamp)/1000).filter(dt=>dt>0&&dt<=60);
      const limit=options.gapThresholdSeconds??Math.min(60,Math.max(10,3*(median(samples)||1)));
      const pauses=pauseIntervals(events.filter(e=>e.sourceId===sourceId),rows[0].timestamp,rows[rows.length-1].timestamp);let pi=0;
      for(let i=1;i<rows.length;i++){
        const a=rows[i-1],b=rows[i],dt=(b.timestamp-a.timestamp)/1000;
        if(dt<=0||dt>limit||![a[key],b[key]].every(v=>Number.isFinite(v)&&(key!=='heartRate'||v>0)))continue;
        const cuts=[a.timestamp,b.timestamp],delta=b[key]-a[key];
        if(delta)for(const boundary of bounds){const fraction=(boundary-a[key])/delta;if(fraction>0&&fraction<1)cuts.push(a.timestamp+fraction*dt*1000);}
        cuts.sort((x,y)=>x-y);
        while(pi<pauses.length&&pauses[pi][1]<=a.timestamp)pi++;
        for(let k=1;k<cuts.length;k++){
          const start=cuts[k-1],end=cuts[k],value=a[key]+delta*((start+end)/2-a.timestamp)/(dt*1000);
          let active=end-start;
          for(let j=pi;j<pauses.length&&pauses[j][0]<end;j++)active-=Math.max(0,Math.min(end,pauses[j][1])-Math.max(start,pauses[j][0]));
          seconds[bounds.filter((v,index)=>value>v||(value===v&&(key!=='grade'||index===0))).length]+=Math.max(0,active)/1000;
        }
      }
    }
    return {seconds,total:seconds.reduce((a,b)=>a+b,0)};
  }
  const climbAnalysis=(function(){
  const timeline={pauseIntervals};
  const median=values=>{const sorted=values.slice().sort((a,b)=>a-b),n=sorted.length;return n?(sorted[Math.floor((n-1)/2)]+sorted[Math.floor(n/2)])/2:null;};
  function category(score){return score>80000?'HC':score>64000?'Cat 1':score>32000?'Cat 2':score>16000?'Cat 3':score>8000?'Cat 4':null;}
  function profile(rows){
    if(rows.some((row,i)=>i&&row.gapBefore)){
      const parts=[];let part=[];
      for(const row of rows){if(row.gapBefore&&part.length){parts.push(...profile(part));part=[];}part.push(row);}
      return parts.concat(profile(part));
    }
    const unique=[];
    for(const row of rows){if(unique.length&&row.distance===unique[unique.length-1].distance)continue;unique.push(row);}
    if(unique.length<2)return [];
    const first=unique[0].distance,last=unique[unique.length-1].distance,step=Math.max(25,Math.ceil((last-first)/200000)),points=[];let j=1;
    const heights=unique.map((r,i)=>median(unique.slice(Math.max(0,i-1),Math.min(unique.length,i+2)).map(p=>p.altitude)));
    // Preserve end heights while removing isolated spikes inside the recording.
    heights[0]=unique[0].altitude;heights[heights.length-1]=unique[unique.length-1].altitude;
    function sample(distance){
      while(j<unique.length-1&&unique[j].distance<distance)j++;
      const a=unique[j-1],b=unique[j],f=(distance-a.distance)/(b.distance-a.distance);
      return {distance,altitude:heights[j-1]+(heights[j]-heights[j-1])*f,timestamp:a.timestamp+(b.timestamp-a.timestamp)*f};
    }
    for(let distance=first;distance<last;distance+=step)points.push(sample(distance));points.push(sample(last));
    const smooth=points.map((p,i)=>median(Array.from({length:5},(_,k)=>points[Math.max(0,Math.min(points.length-1,i+k-2))].altitude)));
    return points.map((p,i)=>({...p,altitude:smooth[i],breakBefore:i===0&&!!rows[0].gapBefore}));
  }
  function lowerBound(rows,time){let low=0,high=rows.length;while(low<high){const middle=(low+high)>>>1;if(rows[middle].timestamp<time)low=middle+1;else high=middle;}return low;}
  function effort(rows,pauses,start,end){
    let seconds=0,measuredDistance=0;const sums={heartRate:0,power:0},weights={heartRate:0,power:0};let pi=0;
    for(let i=Math.max(1,lowerBound(rows,start));i<rows.length&&rows[i-1].timestamp<end;i++){
      const a=rows[i-1],b=rows[i],left=Math.max(start,a.timestamp),right=Math.min(end,b.timestamp);if(right<=left)continue;
      if(b.gapBefore)continue;
      measuredDistance+=(b.distance-a.distance)*(right-left)/(b.timestamp-a.timestamp);
      while(pi<pauses.length&&pauses[pi][1]<=left)pi++;
      function integrate(from,to){
        if(to<=from)return;const dt=(to-from)/1000;seconds+=dt;
        for(const key of ['heartRate','power'])if([a[key],b[key]].every(v=>Number.isFinite(v)&&(key==='power'?v>=0:v>0))){
          const value=t=>a[key]+(b[key]-a[key])*(t-a.timestamp)/(b.timestamp-a.timestamp);
          sums[key]+=(value(from)+value(to))/2*dt;weights[key]+=dt;
        }
      }
      let cursor=left;
      for(let k=pi;k<pauses.length&&pauses[k][0]<right;k++){integrate(cursor,Math.min(right,pauses[k][0]));cursor=Math.max(cursor,pauses[k][1]);if(cursor>=right)break;}
      integrate(cursor,right);
    }
    return {seconds,measuredDistance,avgHeartRate:weights.heartRate?sums.heartRate/weights.heartRate:null,avgPower:weights.power?sums.power/weights.power:null};
  }
  function analyze(records,events=[]){
    const groups=new Map(),climbs=[];let usable=false;
    for(const row of records){if(!groups.has(row.sourceId))groups.set(row.sourceId,[]);groups.get(row.sourceId).push(row);}
    for(const [sourceId,source]of groups){
      const ordered=source.filter(r=>Number.isFinite(r.timestamp)).slice().sort((a,b)=>a.timestamp-b.timestamp);
      if(ordered.length<2)continue;
      const deltas=ordered.slice(1).map((r,i)=>(r.timestamp-ordered[i].timestamp)/1000).filter(v=>v>0&&v<=60),limit=Math.min(60,Math.max(10,3*(median(deltas)||1)));
      const pauses=timeline.pauseIntervals(events.filter(e=>e.sourceId===sourceId),ordered[0].timestamp,ordered[ordered.length-1].timestamp);let run=[];
      function analyzeRun(){
        if(run.length<2){run=[];return;}const rows=run;run=[];
        const points=profile(rows);if(points.length<2)return;usable=true;
        let valley=0,start=null,peak=0;
        function finish(){
          if(start===null)return;
          const a=points[start],b=points[peak],length=b.distance-a.distance,rise=b.altitude-a.altitude,grade=length>0?rise/length*100:0,score=length*grade;
          if(length<500||grade<3||score<=1500)return;
          let gain=0,maxGrade=0;const section=points.slice(start,peak+1).map(p=>({...p}));
          for(let i=start+1;i<=peak;i++)if(!points[i].breakBefore)gain+=Math.max(0,points[i].altitude-points[i-1].altitude);
          let blockStart=0,blockEnd=0;
          for(let i=0;i<section.length;i++){
            if(i===0||section[i].breakBefore){blockStart=i;blockEnd=i;while(blockEnd+1<section.length&&!section[blockEnd+1].breakBefore)blockEnd++;}
            const left=section[Math.max(blockStart,i-2)],right=section[Math.min(blockEnd,i+2)],distance=right.distance-left.distance;
            section[i].grade=distance>0?(right.altitude-left.altitude)/distance*100:0;
            maxGrade=Math.max(maxGrade,section[i].grade);
          }
          const stats=effort(rows,pauses,a.timestamp,b.timestamp);
          if(stats.seconds<=0)return;
          climbs.push({sourceId,startTime:a.timestamp,endTime:b.timestamp,startDistance:a.distance,endDistance:b.distance,length,gain,rise,avgGrade:grade,maxGrade,score,category:category(score),profile:section,...stats,avgSpeed:stats.measuredDistance/stats.seconds});
        }
        for(let i=1;i<points.length;i++){
          if(start===null){
            if(points[i].altitude<=points[valley].altitude)valley=i;
            else if(points[i].altitude-points[valley].altitude>=3){start=valley;peak=i;}
          }else{
            if(points[i].altitude>points[peak].altitude)peak=i;
            const rise=points[peak].altitude-points[start].altitude,loss=points[peak].altitude-points[i].altitude;
            const length=points[peak].distance-points[start].distance,afterPeak=points[i].distance-points[peak].distance;
            // Keep minor interruptions within a climb. End only at a prominent
            // descent or a long plateau that dilutes the overall climb grade.
            const descent=loss>=Math.max(20,rise*.25);
            const plateau=afterPeak>=Math.max(1000,length*.5)&&(points[i].altitude-points[start].altitude)/(points[i].distance-points[start].distance)*100<3;
            if(descent||plateau){finish();start=null;valley=i;}
          }
        }
        finish();
      }
      for(let row of ordered){
        if(!Number.isFinite(row.altitude)||!Number.isFinite(row.distance)){analyzeRun();continue;}
        const previous=run[run.length-1];
        if(previous){const dt=(row.timestamp-previous.timestamp)/1000,dd=row.distance-previous.distance;
          if(dt===0)continue;
          const paused=dt>limit?pauses.reduce((sum,[start,end])=>sum+Math.max(0,Math.min(row.timestamp,end)-Math.max(previous.timestamp,start))/1000,0):0;
          const knownStop=paused>0&&dt-paused<=limit&&dd<=100&&Math.abs(row.altitude-previous.altitude)<=10;
          // Nearby endpoints may belong to the same hillside even when a stop
          // was not recorded. Retain geometry, but never fill the missing time.
          const nearbyGap=dt>limit&&dt<=1800&&dd>=0&&dd<=100&&Math.abs(row.altitude-previous.altitude)<=10;
          if(dt<0||(dt>limit&&!knownStop&&!nearbyGap)||dd<0||dd>Math.max(200,dt*35)){analyzeRun();}
          else if(dt>limit&&!knownStop)row={...row,gapBefore:true};
        }
        run.push(row);
      }
      analyzeRun();
    }
    climbs.sort((a,b)=>a.startTime-b.startTime);
    return {climbs,usable};
  }
    return {analyze,category};
  })();
  const api={prepare,pauseIntervals,estimateGaps,toleranceRank,cadenceCycles,heartRateZones,gradeDurations,climbAnalysis};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ChartTimeline=api;
})(globalThis);
