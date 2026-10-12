(function(root){
  'use strict';
  // Short-window mechanical energy model. Presets are starting assumptions,
  // not calibrated rider parameters; scenario bounds are not confidence limits.
  const bikes={road:[.35,.005,9],aero:[.30,.005,9],gravel:[.42,.008,11],mtb:[.55,.012,13],city:[.55,.008,14],unknown:[.45,.008,12]};
  const unsupported=new Set([5,6,28,47,58,127]);
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const median=a=>{a=a.slice().sort((x,y)=>x-y);return a.length?(a[Math.floor((a.length-1)/2)]+a[Math.floor(a.length/2)])/2:null;};
  function eligible(sessions){return sessions.length>0&&sessions.every(s=>s.sport===2&&!unsupported.has(s.subSport));}
  function smooth(a,radius,sigma){return a.map((_,i)=>{let sum=0,w=0;for(let j=Math.max(0,i-radius);j<=Math.min(a.length-1,i+radius);j++){const weight=Math.exp(-.5*((j-i)/sigma)**2);sum+=a[j]*weight;w+=weight;}return sum/w;});}
  function altitudeSmooth(points){
    const distance=[0];for(let i=1;i<points.length;i++)distance.push(distance[i-1]+(points[i-1].v+points[i].v)/2*(points[i].t-points[i-1].t));
    const end=distance[distance.length-1];if(end<10)return points.map(p=>p.h);
    const grid=[],steps=Math.ceil(end/10);let j=1;
    for(let k=0;k<=steps;k++){
      const d=Math.min(end,k*10);while(j<points.length-1&&distance[j]<d)j++;
      const span=distance[j]-distance[j-1],f=span>0?clamp((d-distance[j-1])/span,0,1):0;
      grid.push(points[j-1].h+(points[j].h-points[j-1].h)*f);
    }
    const filtered=grid.map((_,i)=>median(grid.slice(Math.max(0,i-2),i+3))),z=smooth(filtered,9,3);
    return distance.map(d=>{const k=Math.min(steps-1,Math.floor(d/10)),span=Math.min(end,(k+1)*10)-k*10;return z[k]+(z[k+1]-z[k])*(span>0?(d-k*10)/span:0);});
  }
  function estimate(activity,options={}){
    const fail=reason=>({value:null,reason});
    if(!eligible(activity.sessions||[])||options.bike==='unsupported')return fail('unsupported');
    const bike=options.bike??'unknown',preset=bikes[bike],rider=options.riderKg??75,bikeKg=options.bikeKg??preset?.[2];
    if(!preset||!Number.isFinite(rider)||rider<20||rider>250||!Number.isFinite(bikeKg)||bikeKg<4||bikeKg>60)return fail('parameters');
    const records=(activity.records||[]).filter(r=>Number.isFinite(r.timestamp)).slice().sort((a,b)=>a.timestamp-b.timestamp);
    if(records.length<3)return fail('insufficient');
    if(records.filter(r=>Number.isFinite(r.latitude)&&Number.isFinite(r.longitude)).length<2)return fail('outdoor');
    const timeline=typeof ChartTimeline!=='undefined'?ChartTimeline:typeof require==='function'?require('./chart-timeline.js'):null;
    if(!timeline)return fail('insufficient');
    const groups=new Map();for(const r of records){if(!groups.has(r.sourceId))groups.set(r.sourceId,[]);groups.get(r.sourceId).push(r);}
    const segments=[];let expected=0,covered=0,distance=0,totalPoints=0,hasPauses=false;
    for(const [sourceId,rows]of groups){
      const pauses=timeline.pauseIntervals((activity.events||[]).filter(e=>e.sourceId===sourceId),rows[0].timestamp,rows[rows.length-1].timestamp);
      hasPauses=hasPauses||pauses.length>0;
      const deltas=rows.slice(1).map((r,i)=>(r.timestamp-rows[i].timestamp)/1000).filter(d=>d>0&&d<=60);
      const gapLimit=clamp(3*(median(deltas)||1),10,30);let segment=[],pi=0;
      const flush=()=>{if(segment.length>1)segments.push(segment);segment=[];};
      for(let i=1;i<rows.length;i++){
        const a=rows[i-1],b=rows[i],dt=(b.timestamp-a.timestamp)/1000;if(dt<=0){flush();continue;}
        while(pi<pauses.length&&pauses[pi][1]<=a.timestamp)pi++;
        let overlap=0;for(let j=pi;j<pauses.length&&pauses[j][0]<b.timestamp;j++)overlap+=Math.max(0,Math.min(b.timestamp,pauses[j][1])-Math.max(a.timestamp,pauses[j][0]))/1000;
        expected+=Math.max(0,dt-overlap);
        const valid=dt<=gapLimit&&[a.speed,b.speed].every(v=>Number.isFinite(v)&&v>=0&&v<=45)&&[a.altitude,b.altitude].every(Number.isFinite);
        if(overlap>0||!valid){flush();continue;}
        // Do not reconstruct sensor spikes as climbing or acceleration.
        if(Math.abs(b.altitude-a.altitude)>Math.max(5,(a.speed+b.speed)/2*dt*.4)||Math.abs(b.speed-a.speed)/dt>5){flush();continue;}
        if(!segment.length)segment.push({t:a.timestamp/1000,v:a.speed,h:a.altitude,c:a.cadence});
        const steps=Math.ceil(dt);totalPoints+=steps;if(totalPoints>250000)return fail('tooLong');
        for(let j=1;j<=steps;j++){const f=j/steps;segment.push({t:(a.timestamp+(b.timestamp-a.timestamp)*f)/1000,v:a.speed+(b.speed-a.speed)*f,h:a.altitude+(b.altitude-a.altitude)*f,c:dt<=3&&Number.isFinite(a.cadence)&&Number.isFinite(b.cadence)?a.cadence+(b.cadence-a.cadence)*f:null});}
        covered+=dt;distance+=(a.speed+b.speed)/2*dt;
      }
      flush();
    }
    // Compare against full timer time when available; omitted tails/outages must
    // not turn a small fragment into an apparent whole-ride average.
    const sessions=activity.sessions||[],timer=sessions.length&&sessions.every(s=>Number.isFinite(s.timer)&&s.timer>0)?sessions.reduce((sum,s)=>sum+s.timer,0):null;
    const denominator=timer??expected,coverage=denominator>0?covered/denominator:0;
    if(covered<60||distance<100)return fail('insufficient');
    if(coverage<.9||coverage>1.1)return fail('coverage');
    const intervals=[];let cadenceTime=0,positiveTime=0,movingTime=0;
    for(const points of segments){
      const heights=altitudeSmooth(points),speeds=smooth(points.map(p=>p.v),4,2);
      for(let i=1;i<points.length;i++){
        const dt=points[i].t-points[i-1].t,v=(points[i-1].v+points[i].v)/2<=.5?0:(speeds[i-1]+speeds[i])/2,c=points[i-1].c;
        intervals.push({dt,v,dh:heights[i]-heights[i-1],h:(heights[i]+heights[i-1])/2,dv2:speeds[i]**2-speeds[i-1]**2,c,break:i===1});
        if(v>.5){movingTime+=dt;if(Number.isFinite(c)){cadenceTime+=dt;if(c>0)positiveTime+=dt;}}
      }
    }
    const cadenceReliable=positiveTime>=10&&cadenceTime>=.7*movingTime;
    if(cadenceReliable){let run=[];const finish=()=>{if(run.reduce((s,i)=>s+intervals[i].dt,0)>=3)for(const i of run)intervals[i].coast=true;run=[];};
      intervals.forEach((a,i)=>{if(a.break)finish();if(a.v>.5&&Number.isFinite(a.c)&&a.c<=.01)run.push(i);else finish();});finish();}
    function calculate(mass,cda,crr,wind=0){
      let work=0,energy=0,time=0;const flush=()=>{work+=Math.max(0,energy)/.97;energy=0;time=0;};
      for(const a of intervals){
        if(a.break)flush();if(a.v<=.5||a.coast){flush();continue;}
        const grade=a.dh/Math.max(.5,a.v*a.dt),rho=1.225*Math.max(.4,1-2.25577e-5*a.h)**4.25588;
        const air=a.v+wind;
        energy+=mass*9.80665*a.dh+.5*1.02*mass*a.dv2+(crr*mass*9.80665/Math.sqrt(1+grade*grade)*a.v+.5*rho*cda*air*Math.abs(air)*a.v)*a.dt;
        time+=a.dt;if(time>=10)flush();
      }
      flush();return work/covered;
    }
    const mass=rider+bikeKg,value=calculate(mass,preset[0],preset[1]),scenarios=[];
    for(const m of [Math.max(24,mass-10),mass+10])for(const cd of [.8,1.2])for(const cr of [.7,1.3])for(const wind of [-3,3])scenarios.push(calculate(m,preset[0]*cd,preset[1]*cr,wind));
    return {value,low:Math.min(...scenarios,value),high:Math.max(...scenarios,value),coverage:Math.min(1,coverage),covered,cadenceReliable,hasPauses,timerKnown:timer!==null,parameters:{riderKg:rider,bikeKg,bike},reason:''};
  }
  const api={estimate,eligible,bikes};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PowerEstimate=api;
})(globalThis);
