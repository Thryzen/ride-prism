'use strict';
  const l10n=(s,...values)=>{const t=v=>typeof I18n==='undefined'?v:I18n.t(v);return Array.isArray(s)?s.reduce((out,part,i)=>out+t(part)+(i<values.length?values[i]:''),''):t(s);};
const $ = id => document.getElementById(id);
let activity = null, currentName = '', generation = 0, loadedFiles = [], shareData = null;
const routeMap = new RouteMap.Viewer($('route'), $('mapStatus'), $('mapCredit'));
const sports = {0:'通用活动',1:'跑步',2:'骑行',5:'游泳',10:'健身',11:'步行',12:'越野滑雪',13:'高山滑雪',15:'划船',17:'徒步',21:'皮划艇',53:'攀岩'};
const metrics = {heartRate:['心率','bpm',1],speed:['速度','km/h',3.6],altitude:['海拔','m',1],power:['功率','W',1],cadence:['步频 / 踏频','rpm',1],temperature:['温度','°C',1]};
const number = (value, digits=0) => Number.isFinite(value) ? value.toLocaleString(typeof I18n==='undefined'?'zh-CN':I18n.locale,{maximumFractionDigits:digits,minimumFractionDigits:digits}) : '—';
function duration(seconds) {
  if (!Number.isFinite(seconds)) return '—';
  seconds = Math.max(0, Math.round(seconds));
  return l10n`${Math.floor(seconds/3600)}:${String(Math.floor(seconds/60)%60).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
}
function date(value) { return Number.isFinite(value) ? new Date(value).toLocaleString(typeof I18n==='undefined'?'zh-CN':I18n.locale,{hour12:false}) : '—'; }
function extent(items, key) {
  let min=Infinity,max=-Infinity;
  for (const item of items) if (Number.isFinite(item[key])) {min=Math.min(min,item[key]);max=Math.max(max,item[key]);}
  return min === Infinity ? null : [min,max];
}
function mean(items,key) {let sum=0,count=0; for(const item of items) if(Number.isFinite(item[key])){sum+=item[key];count++;} return count ? sum/count : null;}
function sum(items,key) {if(!items.length || items.some(item=>!Number.isFinite(item[key])))return null;return items.reduce((total,item)=>total+item[key],0);}
function weighted(items,key) {let total=0,weight=0;for(const item of items)if(Number.isFinite(item[key])&&item.timer>0){total+=item[key]*item.timer;weight+=item.timer;}return weight ? total/weight : null;}
function extreme(summaryKey,recordKey,side){
  const sessions=activity.sessions||[],summaryRange=extent(sessions,summaryKey);
  if(sessions.length&&sessions.every(s=>Number.isFinite(s[summaryKey])))return summaryRange[side];
  const recordRange=extent(activity.records,recordKey),candidates=[summaryRange?.[side],recordRange?.[side]].filter(Number.isFinite);
  return candidates.length?(side?Math.max(...candidates):Math.min(...candidates)):null;
}
function speedSummary(){
  const sessions=activity.sessions||[],records=activity.records||[],multi=loadedFiles.length>1;
  const timer=multi?activity.timer:sum(sessions,'timer'),elapsed=sum(sessions,'elapsed'),distances=extent(records,'distance'),times=extent(records,'timestamp');
  const distance=multi?activity.distance:sum(sessions,'distance')??(distances?distances[1]-distances[0]:null);
  const time=timer??elapsed??(times?(times[1]-times[0])/1000:null);
  return {value:(!multi?weighted(sessions,'avgSpeed'):null)??(time>0&&Number.isFinite(distance)?distance/time:null),timerKnown:timer!==null};
}
function stat(label,value,unit='') {const el=document.createElement('div');el.className='stat';const title=document.createElement('span');title.textContent=l10n(label);const strong=document.createElement('strong');strong.textContent=value;const small=document.createElement('small');small.textContent=unit;strong.append(small);el.append(title,strong);return el;}
function powerStat(measured,estimate){
  const card=stat(estimate?'平均估计功率':'平均功率',Number.isFinite(estimate?.value)?'≈ '+number(estimate.value):number(measured),'W');
  if(estimate){
    const button=document.createElement('button');button.id='powerEstimateInfo';button.type='button';button.className='stat-info';button.textContent='i';button.title=l10n('了解并调整功率估计');
    button.setAttribute('aria-label',l10n('了解并调整功率估计'));button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-controls','powerEstimate');
    button.addEventListener('click',()=>{if(!$('powerEstimate').open)$('powerEstimate').showModal();});
    card.children[0].className='stat-label-info';card.children[0].append(button);
  }
  return card;
}
function estimatedPower(measured){
  if(Number.isFinite(measured)||typeof PowerEstimate==='undefined'||!(activity.sessions||[]).some(s=>s.sport===2)){if($('powerEstimate').open)$('powerEstimate').close();return null;}
  const result=PowerEstimate.estimate(activity,{riderKg:Number($('riderMass').value),bikeKg:Number($('bikeMass').value),bike:$('estimateBike').value});
  const reasons={unsupported:l10n('这类活动暂不提供功率估计。'),parameters:l10n('请填写有效的体重（20–250 kg）和车重（4–60 kg）。'),insufficient:l10n('需要至少一分钟、100 米的有效速度与海拔记录。'),outdoor:l10n('缺少户外轨迹，暂不估计功率。'),coverage:l10n('有效数据覆盖不足或计时时长不一致，暂不估计整程平均功率。'),tooLong:l10n('活动过长，暂不估计功率。')};
  const cadenceNote=$('powerEstimateCadence');cadenceNote.hidden=!Number.isFinite(result.value);
  cadenceNote.textContent=Number.isFinite(result.value)?l10n(result.cadenceReliable?'已结合踏频识别滑行，持续未踩踏的路段按零功率计入平均值。':'踏频数据不足，无法可靠区分滑行。'):'';
  $('powerEstimateStatus').textContent=Number.isFinite(result.value)?l10n('参数变化参考范围：')+number(result.low)+'–'+number(result.high)+' W'+l10n('，并非置信区间。有效数据覆盖：')+number(result.coverage*100)+'%。'+(!result.timerKnown?' '+l10n('缺少计时摘要，按有效记录时间估计。'):''):reasons[result.reason]||'';
  return result;
}
function svgElement(name, attributes={}) {const el=document.createElementNS('http://www.w3.org/2000/svg',name);for(const [key,value] of Object.entries(attributes))el.setAttribute(key,String(value));return el;}
function svgText(svg,x,y,text,anchor='start') {const el=svgElement('text',{x,y,'text-anchor':anchor});el.textContent=text;svg.append(el);}
function empty(container,text) {container.replaceChildren();const p=document.createElement('p');p.className='empty';p.textContent=text;container.append(p);}
function drawChart() {
  if(!activity)return;
  const key=$('metric').value,[rawLabel,unit,factor]=metrics[key],label=l10n(rawLabel),container=$('chart');
  const summary=$('chartSummary');summary.replaceChildren();summary.hidden=false;
  const peakSpeed=key==='speed'?extreme('maxSpeed','speed',1):null;
  const averageSpeed=key==='speed'?speedSummary():null;
  const sessions=activity.sessions||[],cycling=sessions.length&&sessions.every(s=>s.sport===2),running=sessions.length&&sessions.every(s=>s.sport===1);
  const readings=key==='speed'?[
    [l10n(averageSpeed.timerKnown?'平均速度':'平均速度（含暂停）'),Number.isFinite(averageSpeed.value)?averageSpeed.value*3.6:null,'km/h',1],
    [l10n('最快速度'),Number.isFinite(peakSpeed)?peakSpeed*3.6:null,'km/h',1]
  ]:key==='altitude'?[
    [l10n('累计爬升'),sum(activity.sessions||[],'ascent'),'m',0],
    [l10n('累计下降'),sum(activity.sessions||[],'descent'),'m',0],
    [l10n('最高海拔'),extreme('maxAltitude','altitude',1),'m',1],
    [l10n('最低海拔'),extreme('minAltitude','altitude',0),'m',1]
  ]:key==='heartRate'?[
    [l10n('平均心率'),weighted(sessions,'avgHeartRate')??mean(activity.records,'heartRate'),'bpm',0],
    [l10n('最高心率'),extreme('maxHeartRate','heartRate',1),'bpm',0]
  ]:key==='power'?[
    [l10n('平均功率'),weighted(sessions,'avgPower')??mean(activity.records,'power'),'W',0],
    [l10n('最高功率'),extreme('maxPower','power',1),'W',0]
  ]:key==='cadence'?[
    [l10n(cycling?'平均踏频':running?'平均步频':'平均步频 / 踏频'),weighted(sessions,'avgCadence')??mean(activity.records,'cadence'),'rpm',0],
    [l10n(cycling?'最高踏频':running?'最高步频':'最高步频 / 踏频'),extreme('maxCadence','cadence',1),'rpm',0]
  ]:key==='temperature'?[
    [l10n('平均温度'),weighted(sessions,'avgTemperature')??mean(activity.records,'temperature'),'°C',1],
    [l10n('最高温度'),extreme('maxTemperature','temperature',1),'°C',1],
    [l10n('最低温度'),extent(activity.records,'temperature')?.[0]??null,'°C',1]
  ]:[];
  summary.hidden=!readings.length;
  for(const [name,value,unit,digits]of readings){const item=document.createElement('div'),title=document.createElement('span'),reading=document.createElement('strong');title.textContent=name;reading.textContent=number(value,digits)+' '+unit;item.append(title,reading);summary.append(item);}
  const skipPauses=$('skipPauses').checked,compressGaps=$('compressGaps').checked;
  const gapThresholdSeconds=Number($('gapThreshold').value);
  $('gapControls').hidden=!compressGaps;
  if(compressGaps&&(!Number.isFinite(gapThresholdSeconds)||gapThresholdSeconds<.1||gapThresholdSeconds>86400)){$('timelineStatus').textContent=l10n('请填写 0.1–86400 秒的长采样门槛。');return;}
  const timeline=ChartTimeline.prepare(activity.records,activity.events,{skipPauses,compressGaps,gapThresholdSeconds});
  const values=timeline.records;
  const notes=[];
  if(skipPauses)notes.push(timeline.pauseCount?l10n`识别 ${timeline.eventPauseCount} 个事件区间；略过 ${timeline.removed} 个记录点，压缩 ${duration(timeline.pausedMs/1000)}`:l10n('未识别到标准计时暂停事件；这不代表没有暂停，可尝试“压缩长采样间隔”'));
  if(compressGaps)notes.push(l10n`门槛 ${number(gapThresholdSeconds,1)} 秒，压缩 ${timeline.gapCount} 处长采样间隔，共 ${duration(timeline.gapMs/1000)}（间隔不一定是暂停）`);
  $('timelineStatus').textContent=notes.length?notes.join('；')+l10n('。横轴为压缩后的相对时间，原始数据及 CSV 不变。'):l10n('显示完整记录时间。');
  const diagnostic=ChartTimeline.diagnostics(activity.records,activity.events,activity.sessions);
  $('pauseDiagnostics').textContent=l10n`事件消息 ${diagnostic.eventCount} 条；计时事件 ${diagnostic.timerCount} 条（其中 ${diagnostic.missingTime} 条缺少时间）；事件/类型及数量：${diagnostic.types.map(([type,count])=>type+' × '+count).join('，')||l10n('无')}。摘要经过时间与计时时间之差 ${duration(diagnostic.summaryPause)}；最长采样间隔 ${duration(diagnostic.longestGap/1000)}。`;
  const times=extent(values,'chartTimestamp'),range=extent(values,key);
  if(!times||!range){empty(container,l10n('这份记录没有可用的')+label+l10n('时间序列。'));return;}
  const width=1000,height=300,left=66,right=24,top=24,bottom=42;
  const start=times[0],span=Math.max(1,times[1]-start);
  let low=range[0]*factor,high=range[1]*factor;
  const pad=Math.max((high-low)*.1,1);low-=pad;high+=pad;
  const x=t=>left+(t-start)/span*(width-left-right),y=v=>top+(high-v)/(high-low)*(height-top-bottom);
  const svg=svgElement('svg',{viewBox:l10n`0 0 ${width} ${height}`,role:'img','aria-label':label+l10n('随时间变化曲线')});
  for(let i=0;i<=4;i++){const py=top+i*(height-top-bottom)/4;svg.append(svgElement('line',{x1:left,x2:width-right,y1:py,y2:py,stroke:'#e6ede3'}));svgText(svg,left-12,py+4,number(high-i*(high-low)/4,1),'end');}
  for(let i=0;i<=4;i++)svgText(svg,left+i*(width-left-right)/4,height-12,duration(span*i/4000),'middle');
  svgText(svg,left,14,unit);
  // Keep min/max per screen column so short spikes survive downsampling.
  const buckets=new Map(); let segment=0,last=null,lastSource=null;
  for(const r of values){
    if(!Number.isFinite(r[key])){segment++;last=null;continue;}
    if(last!==null && (r.sourceId!==lastSource || r.chartTimestamp<last || r.chartTimestamp-last>(compressGaps?gapThresholdSeconds*1000:60000)))segment++;
    lastSource=r.sourceId;
    last=r.chartTimestamp;
    const bucketKey=segment+':'+Math.floor(x(r.chartTimestamp));
    let bucket=buckets.get(bucketKey);
    if(!bucket){bucket={segment,first:r,last:r,min:r,max:r};buckets.set(bucketKey,bucket);}
    bucket.last=r;if(r[key]<bucket.min[key])bucket.min=r;if(r[key]>bucket.max[key])bucket.max=r;
  }
  let path='',prevSegment=-1;
  for(const bucket of buckets.values()){
    const points=[...new Set([bucket.first,bucket.min,bucket.max,bucket.last])].sort((a,b)=>a.timestamp-b.timestamp);
    for(const r of points){path+=(prevSegment!==bucket.segment?'M':'L')+x(r.chartTimestamp).toFixed(2)+','+y(r[key]*factor).toFixed(2);prevSegment=bucket.segment;}
  }
  svg.append(svgElement('path',{d:path,fill:'none',stroke:'#30765a','stroke-width':2,'stroke-linejoin':'round'}));
  if(buckets.size===1){const r=buckets.values().next().value.first;svg.append(svgElement('circle',{cx:x(r.chartTimestamp),cy:y(r[key]*factor),r:3,fill:'#30765a'}));}
  const hoverHint=document.createElement('p');hoverHint.className='chart-hover-hint';
  container.replaceChildren(svg,hoverHint);
  // Render the selected metric before attaching optional interactions.
  // A missing/stale interaction script must not leave the previous curve on screen.
  try{
    if(typeof ChartHover==='undefined'||typeof ChartHover.attach!=='function')throw new Error(l10n('悬停组件未加载'));
    ChartHover.attach(svg,{records:values,key,label,unit,factor,x,y,start,span,width,height,left,right,top,bottom,
      formatTime:duration,formatValue:value=>number(value,key==='speed'||key==='altitude'?1:0),formatDate:date});
    hoverHint.textContent=l10n('悬停查看最近记录的时间与数值 · 左右方向键可逐点查看');
  }catch(error){
    hoverHint.textContent=l10n('曲线已更新，悬停组件暂不可用。请刷新页面后重试。');
    console.error('Chart interaction unavailable:',error);
  }
}
function drawRoute() {
  routeMap.setRecords(activity.records);
}
function drawDevices(){
  const container=$('devices');container.replaceChildren();
  const rows=DeviceInfo.inventory(activity);
  if(!rows.length){empty(container,l10n('文件未提供可识别的设备信息。'));return;}
  for(const d of rows){
    const card=document.createElement('article');card.className='device-card';
    const tag=document.createElement('p');tag.className='eyebrow';tag.textContent=DeviceInfo.kind(d);
    const title=document.createElement('h3');title.textContent=DeviceInfo.modelName(d);card.append(tag,title);
    if(activity.sources?.length>1){const source=document.createElement('p');source.className='device-source';source.textContent=l10n('来源：')+(activity.sources.find(s=>s.sourceId===d.sourceId)?.name||l10n('文件 ')+(d.sourceId+1));card.append(source);}
    const facts=document.createElement('dl');
    for(const [label,value]of DeviceInfo.facts(d)){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;facts.append(dt,dd);}card.append(facts);
    const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent=l10n('标识与报告');details.append(summary);
    const fields=[[l10n('设备索引'),d.deviceIndex],[l10n('序列号'),d.serialNumber],[l10n('ANT 设备编号'),d.antDeviceNumber]];
    for(const [label,value]of fields)if(Number.isFinite(value)){const p=document.createElement('p');p.textContent=label+'：'+value;details.append(p);}
    const note=document.createElement('p');note.textContent=d.fromFileId?l10n('来自文件标识；文件创建者也可能是导出平台。'):l10n`${d.reportCount} 条设备报告${Number.isFinite(d.timestamp)?l10n('；最后报告 ')+date(d.timestamp):''}。`;details.append(note);card.append(details);container.append(card);
  }
}
function render(preserveMap=false) {
  const {records,sessions,laps,warnings}=activity;
  const timeRange=extent(records,'timestamp'),distanceRange=extent(records,'distance');
  const timer=loadedFiles.length>1?activity.timer:sum(sessions,'timer'),elapsed=sum(sessions,'elapsed');
  const totalDistance=loadedFiles.length>1?activity.distance:sum(sessions,'distance') ?? (distanceRange ? distanceRange[1]-distanceRange[0] : null);
  const totalTime=timer ?? elapsed ?? (timeRange ? (timeRange[1]-timeRange[0])/1000 : null);
  const hr=weighted(sessions,'avgHeartRate') ?? mean(records,'heartRate');
  const cadence=weighted(sessions,'avgCadence') ?? mean(records,'cadence');
  const power=weighted(sessions,'avgPower') ?? mean(records,'power');
  const powerEstimate=estimatedPower(power);
  const calories=sum(sessions,'calories');
  const avgSpeed=speedSummary().value;
  const elapsedTime=loadedFiles.length>1&&activity.sources.every(s=>Number.isFinite(s.start)&&Number.isFinite(s.end))?(activity.sources.reduce((max,s)=>Math.max(max,s.end),-Infinity)-activity.sources[0].start)/1000:elapsed ?? (timeRange?(timeRange[1]-timeRange[0])/1000:null);
  const sportTypes=sessions.map(s=>s.sport),cadenceLabel=sportTypes.length&&sportTypes.every(s=>s===2)?l10n('平均踏频'):sportTypes.length&&sportTypes.every(s=>s===1)?l10n('平均步频'):l10n('平均步频 / 踏频');
  $('filename').textContent=currentName;
  $('sport').textContent=sessions.length ? [...new Set(sessions.map(s=>l10n(sports[s.sport]||l10n('其他活动'))))].join(' / ') : l10n('活动记录');
  $('date').textContent=date(sessions[0]?.startTime ?? timeRange?.[0]);
  $('stats').replaceChildren(stat(l10n('距离'),number(totalDistance===null?null:totalDistance/1000,2),'km'),stat(timer!==null?l10n('运动计时时长'):l10n('时长（含暂停）'),duration(totalTime)),stat(l10n('经过时长'),duration(elapsedTime)),stat(timer!==null?l10n('平均速度'):l10n('平均速度（含暂停）'),number(avgSpeed===null?null:avgSpeed*3.6,1),'km/h'),stat(l10n('平均心率'),number(hr),'bpm'),stat(cadenceLabel,number(cadence),'rpm'),powerStat(power,powerEstimate),stat(l10n('消耗热量'),number(calories),'kcal'),stat(l10n('记录点数'),number(records.length)));
  shareData={distance:totalDistance,time:totalTime,timerKnown:timer!==null,speed:avgSpeed,heartRate:hr,power,calories,cadence,cadenceLabel,sportNames:[...new Set(sessions.map(s=>sports[s.sport]||'其他活动'))],ascent:sum(sessions,'ascent'),sport:$('sport').textContent,startTime:sessions[0]?.startTime??timeRange?.[0]};
  Object.assign(shareData,{elapsed:elapsedTime,maxSpeed:extreme('maxSpeed','speed',1),descent:sum(sessions,'descent'),maxAltitude:extreme('maxAltitude','altitude',1),minAltitude:extreme('minAltitude','altitude',0),maxHeartRate:extreme('maxHeartRate','heartRate',1),maxPower:extreme('maxPower','power',1),maxCadence:extreme('maxCadence','cadence',1),maxCadenceLabel:sportTypes.length&&sportTypes.every(s=>s===2)?l10n('最高踏频'):sportTypes.length&&sportTypes.every(s=>s===1)?l10n('最高步频'):l10n('最高步频 / 踏频'),temperature:weighted(sessions,'avgTemperature')??mean(records,'temperature')});
  $('warnings').hidden=!warnings.length;$('warnings').textContent=warnings.map(w=>l10n(w)).join(' ');
  $('laps').replaceChildren();
  laps.forEach((lap,index)=>{const speed=lap.avgSpeed ?? (lap.timer>0&&Number.isFinite(lap.distance)?lap.distance/lap.timer:null);const tr=document.createElement('tr');for(const value of [index+1,date(lap.startTime),number(lap.distance===null?null:lap.distance/1000,2)+' km',duration(lap.timer),number(speed===null?null:speed*3.6,1)+' km/h',number(lap.avgCadence)+' rpm',number(lap.avgHeartRate)+' bpm',number(lap.avgPower)+' W',number(lap.calories)+' kcal']){const td=document.createElement('td');td.textContent=value;tr.append(td);}$('laps').append(tr);});
  if(!laps.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=9;td.textContent=l10n('文件中没有圈段记录。');tr.append(td);$('laps').append(tr);}
  $('details').textContent=l10n`已解析 ${records.length} 个记录点、${sessions.length} 个活动摘要、${laps.length} 个圈段、${activity.events.length} 个事件。消息数量：${Object.entries(activity.counts).map(([id,count])=>id+' → '+count).join('，')}。时间按本机时区显示。关闭长间隔压缩时，曲线在超过 60 秒的采样间隔处断开；地图轨迹始终按 60 秒间隔断段。`;
  $('export').disabled=!records.length;
  $('exportFit').hidden=loadedFiles.length<2;
  $('exportFit').disabled=!records.length||records.some(r=>!Number.isFinite(r.timestamp));
  $('mergeNote').hidden=loadedFiles.length<2;
  $('fileList').replaceChildren();
  for(const source of activity.sources||[]){
    const row=document.createElement('div');row.className='file-row';
    const description=document.createElement('div'),name=document.createElement('strong'),info=document.createElement('p');
    name.textContent=source.name;info.textContent=l10n`${date(source.start)} → ${date(source.end)} · ${number(source.recordCount)} 个记录点`;description.append(name,info);
    const remove=document.createElement('button');remove.className='secondary';remove.textContent=l10n('移除');remove.setAttribute('aria-label',l10n('移除 ')+source.name);
    const sourceFile=FitMerge.ordered(loadedFiles)[source.sourceId];
    remove.addEventListener('click',()=>{generation++;loadedFiles=loadedFiles.filter(file=>file!==sourceFile);rebuild();$('status').textContent=l10n('已移除该文件。');});
    row.append(description,remove);$('fileList').append(row);
  }
  $('results').hidden=false;drawChart();if(!preserveMap)drawRoute();else routeMap.draw?.();drawDevices();
}
function rebuild(){
  $('gapEstimate').textContent=l10n('建议门槛为常规采样间隔的 3–10 倍，也可点击智能估计。');
  if(!loadedFiles.length){activity=null;shareData=null;currentName='';$('results').hidden=true;routeMap.clear();for(const id of ['chart','laps','stats','fileList','devices'])$(id).replaceChildren();return;}
  activity=FitMerge.merge(loadedFiles);currentName=loadedFiles.length===1?loadedFiles[0].name:l10n`合并活动 · ${loadedFiles.length} 个 FIT 文件`;render();
}
async function load(files) {
  const token=++generation;
  const selected=Array.from(files||[]);if(!selected.length)return;
  const staged=loadedFiles.slice(),failures=[];let added=0,duplicates=0,totalSize=staged.reduce((n,f)=>n+f.size,0);
  $('status').className='';
  for(let i=0;i<selected.length;i++){
    const file=selected[i],identity=JSON.stringify([file.name,file.size,file.lastModified]);
    if(staged.some(f=>f.identity===identity)){duplicates++;continue;}
    if(!/\.fit$/i.test(file.name)){failures.push(file.name+l10n('：不是 FIT 文件'));continue;}
    if(file.size>64*1024*1024||totalSize+file.size>128*1024*1024){failures.push(file.name+l10n('：超过单文件 64 MB 或总计 128 MB 限制'));continue;}
    $('status').textContent=l10n`正在读取 ${i+1}/${selected.length}：${file.name}`;
    try{
      const buffer=await file.arrayBuffer();await new Promise(resolve=>setTimeout(resolve,0));if(token!==generation)return;
      const data=FitParser.parse(buffer);staged.push({name:file.name,size:file.size,identity,data});totalSize+=file.size;added++;
    }catch(error){if(token!==generation)return;failures.push(file.name+'：'+error.message);}
  }
  if(token!==generation)return;loadedFiles=staged;rebuild();
  $('status').className=failures.length?'error':'';
  $('status').textContent=l10n`已添加 ${added} 个文件，共 ${loadedFiles.length} 个。${duplicates?l10n`跳过 ${duplicates} 个重复选择。`:''}${failures.length?l10n('未加载：')+failures.join('；'):''}`;
}
$('fileInput').addEventListener('change',e=>{load(e.target.files);e.target.value='';});
for(const event of ['dragenter','dragover'])$('dropZone').addEventListener(event,e=>{e.preventDefault();$('dropZone').classList.add('drag');});
for(const event of ['dragleave','drop'])$('dropZone').addEventListener(event,e=>{e.preventDefault();$('dropZone').classList.remove('drag');});
$('dropZone').addEventListener('drop',e=>load(e.dataTransfer.files));
window.addEventListener('dragover',e=>e.preventDefault());window.addEventListener('drop',e=>e.preventDefault());
$('metric').addEventListener('change',drawChart);
$('powerEstimateClose').addEventListener('click',()=>$('powerEstimate').close());
$('powerEstimate').addEventListener('click',e=>{if(e.target!==$('powerEstimate'))return;const rect=$('powerEstimate').getBoundingClientRect();if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)$('powerEstimate').close();});
$('powerEstimate').addEventListener('close',()=>$('powerEstimateInfo')?.focus());
for(const id of ['riderMass','bikeMass'])$(id).addEventListener('change',()=>{if(activity)render(true);});
$('estimateBike').addEventListener('change',()=>{const preset=typeof PowerEstimate==='undefined'?null:PowerEstimate.bikes[$('estimateBike').value];if(preset)$('bikeMass').value=String(preset[2]);if(activity)render(true);});
$('skipPauses').addEventListener('change',drawChart);
$('compressGaps').addEventListener('change',()=>{$('gapControls').hidden=!$('compressGaps').checked;drawChart();});
$('gapThreshold').addEventListener('input',()=>{$('gapEstimate').textContent=l10n('使用手动门槛；点击智能估计可重新计算。');drawChart();});
$('estimateGaps').addEventListener('click',()=>{
  if(!activity)return;
  const result=ChartTimeline.estimateGaps(activity.records,activity.events);
  const sources=result.groups.map((g,i)=>l10n`${result.groups.length>1?l10n`文件 ${i+1}：`:''}典型间隔 ${number(g.cadence,2)} 秒（约 ${number(g.hz,2)} Hz），参考样本 ${g.n} 个，筛除长间隔 ${g.excluded} 个`).join('；');
  if(result.threshold===null){$('gapEstimate').textContent=[result.reason,sources].filter(Boolean).join(' ');return;}
  if(result.threshold>86400){$('gapEstimate').textContent=l10n('估计门槛超过一天，记录过于稀疏，请手动设置。');return;}
  $('gapThreshold').value=String(result.threshold);drawChart();
  $('gapEstimate').textContent=l10n`已填入 ${number(result.threshold,1)} 秒，建议 ${number(result.range[0],1)}–${number(result.range[1],1)} 秒。${sources}。${result.supported?l10n('参考模型达到 99% 覆盖 / 至少 95% 置信目标'):l10n('样本不足以达到 95% 置信目标；参考模型置信度约 ')+number(result.confidence*100,1)+'%'}；这是采样间隔估计，不是暂停概率。`;
});
$('mapSource').addEventListener('change',e=>{if(!routeMap.setSource(e.target.value))e.target.value=routeMap.source;});
for(const id of ['mapKilometers','mapMaxSpeed','mapMaxAltitude','mapMinAltitude'])$(id).addEventListener('change',()=>routeMap.setMarkers({kilometers:$('mapKilometers').checked,maxSpeed:$('mapMaxSpeed').checked,maxAltitude:$('mapMaxAltitude').checked,minAltitude:$('mapMinAltitude').checked}));
$('deviceCoordinates').addEventListener('change',e=>{
  const corrected=e.target.value!=='wgs84';
  routeMap.setCoordinateMode(corrected?'gcj02':'wgs84');
  $('coordinateHint').textContent=corrected?l10n('已尝试修正地图偏移；若更不对齐，请切回标准 GPS。原始数据及 CSV 保持不变。'):l10n('轨迹按原始 GPS 坐标显示。');
});
// The embedded studio receives a snapshot; the activity page stays in memory.
const shareWindows = new Map();
let activeStudio=null;
function shareToken(){
  if(typeof crypto.randomUUID==='function')return crypto.randomUUID();
  // getRandomValues also works on ordinary HTTP deployments.
  const bytes=new Uint8Array(16);crypto.getRandomValues(bytes);
  return Array.from(bytes,byte=>byte.toString(16).padStart(2,'0')).join('');
}
function closeStudio(){
  if(!activeStudio)return;
  shareWindows.delete(activeStudio.page);activeStudio.frame.remove();activeStudio=null;
  document.body.classList.remove('share-open');
  for(const element of document.querySelectorAll('body > header, body > main'))element.inert=false;
  $('openShare').focus();
}
window.addEventListener('popstate',()=>{
  if(activeStudio&&window.history.state?.ridePrismShare!==activeStudio.token)closeStudio();
});
window.addEventListener('message',event=>{
  const entry=shareWindows.get(event.source);
  const origin=location.protocol==='file:'?'null':location.origin;
  if(!entry||event.origin!==origin||event.data?.token!==entry.token)return;
  if(event.data.type==='fit-share-ready')event.source.postMessage({type:'fit-share-data',token:entry.token,data:entry.data},location.protocol==='file:'?'*':location.origin);
  else if(event.data.type==='fit-share-close'){
    if(entry.hasHistory&&window.history.state?.ridePrismShare===entry.token)window.history.back();
    else closeStudio();
  }
});
$('openShare').addEventListener('click',()=>{
  if(!activity||!shareData||activeStudio)return;
  const token=shareToken();
  const url=new URL('share.html',location.href);url.hash=token;
  if(typeof I18n!=='undefined')url.searchParams.set('lang',I18n.language);
  if(typeof Appearance!=='undefined')url.searchParams.set('appearance',Appearance.preference);
  const manufacturerInfo=DeviceInfo.shareManufacturerInfo(activity);
  const data={...shareData,manufacturers:manufacturerInfo.names,manufacturerFallback:manufacturerInfo.hasFileCreators,points:RouteMap.routePoints(activity.records,$('deviceCoordinates').value==='wgs84'?'wgs84':'gcj02')};
  const frame=document.createElement('iframe');frame.className='share-frame';frame.title=l10n('制作分享图 · RidePrism');frame.src=url.href;
  document.body.append(frame);
  const page=frame.contentWindow;let hasHistory=false;
  try{const viewUrl=new URL(location.href);viewUrl.hash='share';window.history.pushState({...window.history.state,ridePrismShare:token},'',viewUrl.href);hasHistory=true;}catch{}
  activeStudio={frame,page,token};shareWindows.set(page,{token,data,hasHistory});
  for(const element of document.querySelectorAll('body > header, body > main'))element.inert=true;
  document.body.classList.add('share-open');frame.focus();
});
if(typeof I18n!=='undefined')I18n.onChange(()=>{
  if(activity){
    if(loadedFiles.length){activity=FitMerge.merge(loadedFiles);currentName=loadedFiles.length===1?loadedFiles[0].name:l10n`合并活动 · ${loadedFiles.length} 个 FIT 文件`;}
    render(true);$('status').textContent=l10n('已加载文件')+': '+loadedFiles.length;
  }else $('status').textContent=l10n($('status').textContent);
  routeMap.refreshLanguage?.();
  $('coordinateHint').textContent=$('deviceCoordinates').value==='wgs84'?l10n('轨迹按原始 GPS 坐标显示。'):l10n('已尝试修正地图偏移；若更不对齐，请切回标准 GPS。原始数据及 CSV 保持不变。');
  $('gapEstimate').textContent=l10n('建议门槛为常规采样间隔的 3–10 倍，也可点击智能估计。');
});
$('tileInput').addEventListener('change',e=>{if(routeMap.setTiles(e.target.files))$('mapSource').value='local';e.target.value='';});
$('clear').addEventListener('click',()=>{generation++;loadedFiles=[];rebuild();$('fileInput').value='';$('filename').textContent='';$('date').textContent='';$('details').textContent='';$('warnings').textContent='';$('sport').textContent='';$('status').className='';$('status').textContent=l10n('已清除全部记录，可以重新添加文件。');});
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('exportFit').addEventListener('click',()=>{
  if(!activity||loadedFiles.length<2)return;
  try{const bytes=FitWriter.encode(activity);download(new Blob([bytes],{type:'application/octet-stream'}),'merged-'+new Date(activity.sources[0].start).toISOString().slice(0,10)+'.fit');$('status').className='';$('status').textContent=l10n('合并 FIT 已生成，请保存文件。');}
  catch(error){$('status').className='error';$('status').textContent=l10n('导出失败：')+error.message;}
});
$('export').addEventListener('click',()=>{
  if(!activity)return;
  const keys=['timestamp','latitude','longitude','altitude','heartRate','cadence','distance','speed','power','temperature'];
  const header=['time_utc','latitude_deg','longitude_deg','altitude_m','heart_rate_bpm','cadence_rpm','distance_m','speed_m_s','power_w','temperature_c'];
  const rows=[header.join(',')];for(const r of activity.records)rows.push(keys.map(key=>r[key]===null?'':key==='timestamp'?new Date(r[key]).toISOString():String(r[key])).join(','));
  download(new Blob(['\uFEFF'+rows.join('\r\n')],{type:'text/csv;charset=utf-8'}),loadedFiles.length>1?'merged-records.csv':currentName.replace(/\.fit$/i,'')+'-records.csv');
});
