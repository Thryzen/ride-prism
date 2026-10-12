(function(root){
  'use strict';
  const l10n=(s,...values)=>{const t=v=>typeof I18n==='undefined'?v:I18n.t(v);return Array.isArray(s)?s.reduce((out,part,i)=>out+t(part)+(i<values.length?values[i]:''),''):t(s);};
  const epoch=Date.UTC(1989,11,31);
  const timestamp=ms=>Number.isFinite(ms)?Math.round((ms-epoch)/1000):null;
  const u8=(id,key)=>({id,key,size:1,type:2,write:'setUint8',invalid:255,min:0,max:254});
  const u16=(id,key,scale=1,offset=0)=>({id,key,size:2,type:132,write:'setUint16',invalid:65535,min:0,max:65534,scale,offset});
  const u32=(id,key,scale=1,offset=0)=>({id,key,size:4,type:134,write:'setUint32',invalid:4294967295,min:0,max:4294967294,scale,offset});
  const time=(id,key)=>({...u32(id,key),convert:timestamp});
  const coord=(id,key)=>({id,key,size:4,type:133,write:'setInt32',invalid:2147483647,min:-2147483648,max:2147483646,scale:2147483648/180});
  const recordFields=[time(253,'timestamp'),coord(0,'latitude'),coord(1,'longitude'),u32(78,'altitude',5,500),u8(3,'heartRate'),u8(4,'cadence'),u32(5,'distance',100),u32(73,'speed',1000),u16(7,'power'),{id:13,key:'temperature',size:1,type:1,write:'setInt8',invalid:127,min:-128,max:126}];
  function crc(bytes){let value=0;for(const byte of bytes){value^=byte;for(let bit=0;bit<8;bit++)value=value&1?(value>>>1)^0xA001:value>>>1;}return value;}
  function mean(records,key){let sum=0,count=0;for(const r of records)if(Number.isFinite(r[key])){sum+=r[key];count++;}return count?sum/count:null;}
  function durationOf(source){
    if(Number.isFinite(source.timer))return source.timer;
    const sessions=source.data.sessions;
    if(sessions.length&&sessions.every(s=>Number.isFinite(s.timer)))return sessions.reduce((sum,s)=>sum+s.timer,0);
    const events=source.data.events.filter(e=>e.event===0&&Number.isFinite(e.timestamp)).slice().sort((a,b)=>a.timestamp-b.timestamp);
    let stopped=null,paused=0;
    for(const e of events){if([1,4,6,7,8,9].includes(e.eventType)){if(stopped===null)stopped=e.timestamp;}else if([0,5].includes(e.eventType)&&stopped!==null){paused+=Math.max(0,Math.min(e.timestamp,source.end)-Math.max(stopped,source.start));stopped=null;}}
    if(stopped!==null)paused+=Math.max(0,source.end-Math.max(stopped,source.start));
    return Math.max(0,(source.end-source.start-paused)/1000);
  }
  function encode(activity){
    if(!activity.sources?.length||!activity.records.length)throw new Error(l10n('没有可导出的活动记录。'));
    if(activity.records.some(r=>!Number.isFinite(r.timestamp))||activity.sources.some(s=>s.start===null||s.end===null))throw new Error(l10n('存在缺少时间戳的记录，不能安全导出合并 FIT。'));
    const sources=activity.sources,start=Math.min(...sources.map(s=>s.start)),end=Math.max(...sources.map(s=>s.end));
    if(timestamp(start)<0||timestamp(end)>4294967294)throw new Error(l10n('活动时间超出 FIT 支持的范围。'));
    const chunks=[];let total=0;
    function add(bytes){chunks.push(bytes);total+=bytes.length;}
    function definition(local,global,fields){const bytes=new Uint8Array(6+fields.length*3),view=new DataView(bytes.buffer);bytes[0]=64|local;bytes[2]=0;view.setUint16(3,global,true);bytes[5]=fields.length;fields.forEach((f,i)=>bytes.set([f.id,f.size,f.type],6+i*3));add(bytes);}
    function message(local,fields,item){const bytes=new Uint8Array(1+fields.reduce((n,f)=>n+f.size,0)),view=new DataView(bytes.buffer);bytes[0]=local;let pos=1;for(const f of fields){let v=item[f.key];v=f.convert?f.convert(v):Number.isFinite(v)?Math.round((v+(f.offset||0))*(f.scale||1)):null;if(!Number.isFinite(v)||v<f.min||v>f.max)v=f.invalid;view[f.write](pos,v,true);pos+=f.size;}add(bytes);}
    const fileFields=[{...u8(0,'type'),type:0},u16(1,'manufacturer'),u16(2,'product'),u32(3,'serial'),time(4,'created')];
    definition(0,0,fileFields);message(0,fileFields,{type:4,manufacturer:255,product:0,serial:crc(new TextEncoder().encode(sources.map(s=>s.name).join('|'))),created:start});
    const eventFields=[time(253,'timestamp'),{...u8(0,'event'),type:0},{...u8(1,'eventType'),type:0},u8(4,'group')];
    definition(1,20,recordFields);definition(2,21,eventFields);
    const stream=[];for(const r of activity.records)stream.push({timestamp:r.timestamp,kind:1,item:r});
    for(const e of activity.events)if(Number.isFinite(e.timestamp)&&Number.isFinite(e.event)&&Number.isFinite(e.eventType))stream.push({timestamp:e.timestamp,kind:2,item:{...e,group:0}});
    const lapFields=[time(253,'timestamp'),time(2,'startTime'),{...u8(0,'event'),type:0},{...u8(1,'eventType'),type:0},u32(7,'elapsed',1000),u32(8,'timer',1000),u32(9,'distance',100),u16(11,'calories'),u32(110,'avgSpeed',1000),u8(15,'avgHeartRate'),u8(17,'avgCadence'),u16(19,'avgPower'),u16(21,'ascent'),u16(22,'descent'),u16(254,'index')];
    definition(3,19,lapFields);const laps=[];
    for(const source of sources){const original=activity.laps.filter(l=>l.sourceId===source.sourceId);if(original.length)for(const l of original)laps.push({...l,timestamp:l.timestamp??source.end,startTime:l.startTime??source.start});else laps.push({startTime:source.start,timestamp:source.end,elapsed:(source.end-source.start)/1000,timer:durationOf(source),distance:source.distance});}
    laps.sort((a,b)=>a.startTime-b.startTime);laps.forEach((l,index)=>stream.push({timestamp:l.timestamp,kind:3,item:{...l,index,event:9,eventType:1}}));
    stream.sort((a,b)=>a.timestamp-b.timestamp||a.kind-b.kind);
    const fieldsByKind={1:recordFields,2:eventFields,3:lapFields};
    for(const item of stream)message(item.kind,fieldsByKind[item.kind],item.item);
    const sessionFields=[time(253,'timestamp'),time(2,'startTime'),{...u8(0,'event'),type:0},{...u8(1,'eventType'),type:0},{...u8(5,'sport'),type:0},u32(7,'elapsed',1000),u32(8,'timer',1000),u32(9,'distance',100),u16(11,'calories'),u32(124,'avgSpeed',1000),u8(16,'avgHeartRate'),u8(18,'avgCadence'),u16(20,'avgPower'),u16(22,'ascent'),u16(23,'descent'),u16(25,'firstLap'),u16(26,'numLaps'),u16(254,'index')];
    const sports=[...new Set(activity.sessions.map(s=>s.sport).filter(Number.isFinite))],timer=sources.reduce((sum,s)=>sum+durationOf(s),0);
    const totals=key=>activity.sessions.length&&activity.sessions.every(s=>Number.isFinite(s[key]))?activity.sessions.reduce((sum,s)=>sum+s[key],0):null;
    definition(4,18,sessionFields);message(4,sessionFields,{timestamp:end,startTime:start,event:8,eventType:1,sport:sports.length===1?sports[0]:0,elapsed:(end-start)/1000,timer,distance:activity.distance,calories:totals('calories'),avgSpeed:timer>0?activity.distance/timer:null,avgHeartRate:mean(activity.records,'heartRate'),avgCadence:mean(activity.records,'cadence'),avgPower:mean(activity.records,'power'),ascent:totals('ascent'),descent:totals('descent'),firstLap:0,numLaps:laps.length,index:0});
    const activityFields=[time(253,'timestamp'),u32(0,'timer',1000),u16(1,'sessions'),{...u8(2,'type'),type:0},{...u8(3,'event'),type:0},{...u8(4,'eventType'),type:0}];
    definition(5,34,activityFields);message(5,activityFields,{timestamp:end,timer,sessions:1,type:0,event:26,eventType:1});
    const output=new Uint8Array(14+total+2),view=new DataView(output.buffer);output[0]=14;output[1]=32;view.setUint16(2,2100,true);view.setUint32(4,total,true);output.set([46,70,73,84],8);view.setUint16(12,crc(output.subarray(0,12)),true);let pos=14;for(const chunk of chunks){output.set(chunk,pos);pos+=chunk.length;}view.setUint16(pos,crc(output.subarray(0,pos)),true);return output;
  }
  const api={encode,crc};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.FitWriter=api;
})(globalThis);
