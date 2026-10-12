(function(root){
  'use strict';
  const l10n=(s,...values)=>{const t=v=>typeof I18n==='undefined'?v:I18n.t(v);return Array.isArray(s)?s.reduce((out,part,i)=>out+t(part)+(i<values.length?values[i]:''),''):t(s);};
  const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
  function project(latitude,longitude){
    const lat=clamp(latitude,-85.05112878,85.05112878)*Math.PI/180;
    return {x:(longitude+180)/360,y:(1-Math.asinh(Math.tan(lat))/Math.PI)/2};
  }
  // Local approximation of the GCJ displacement; never call a coordinate API.
  function inGcjRange(lat,lon){return lon>=72.004&&lon<=137.8347&&lat>=.8293&&lat<=55.8271;}
  function gcjForward(lat,lon){
    if(!inGcjRange(lat,lon))return {latitude:lat,longitude:lon};
    const x=lon-105,y=lat-35,pi=Math.PI;
    const common=(20*Math.sin(6*x*pi)+20*Math.sin(2*x*pi))*2/3;
    let dLat=-100+2*x+3*y+.2*y*y+.1*x*y+.2*Math.sqrt(Math.abs(x))+common;
    dLat+=(20*Math.sin(y*pi)+40*Math.sin(y*pi/3))*2/3;
    dLat+=(160*Math.sin(y*pi/12)+320*Math.sin(y*pi/30))*2/3;
    let dLon=300+x+2*y+.1*x*x+.1*x*y+.1*Math.sqrt(Math.abs(x))+common;
    dLon+=(20*Math.sin(x*pi)+40*Math.sin(x*pi/3))*2/3;
    dLon+=(150*Math.sin(x*pi/12)+300*Math.sin(x*pi/30))*2/3;
    const rad=lat*pi/180,e2=.006693421622965943,a=6378245;
    const magic=1-e2*Math.sin(rad)**2,sqrt=Math.sqrt(magic);
    dLat=dLat*180/((a*(1-e2)/(magic*sqrt))*pi);
    dLon=dLon*180/((a/sqrt)*Math.cos(rad)*pi);
    return {latitude:lat+dLat,longitude:lon+dLon};
  }
  function gcjToWgs(lat,lon){
    if(!inGcjRange(lat,lon))return {latitude:lat,longitude:lon};
    let latitude=lat,longitude=lon;
    for(let i=0;i<8;i++){
      const forward=gcjForward(latitude,longitude),dLat=forward.latitude-lat,dLon=forward.longitude-lon;
      latitude-=dLat;longitude-=dLon;
      if(Math.max(Math.abs(dLat),Math.abs(dLon))<1e-9)break;
    }
    return {latitude,longitude};
  }
  function tileKey(path){
    const match=path.replace(/\\/g,'/').match(/(?:^|\/)(\d+)\/(\d+)\/(\d+)\.(png|jpe?g|webp)$/i);
    if(!match)return null;
    const [z,x,y]=match.slice(1,4).map(Number);
    if(z>22||x>=2**z||y>=2**z)return null;
    return {key:l10n`${z}/${x}/${y}`,z};
  }
  function onlineTileUrl(z,x,y){
    if(!Number.isInteger(z)||z<0||z>19||!Number.isInteger(x)||!Number.isInteger(y)||y<0||y>=2**z)return null;
    const count=2**z;
    return l10n`https://tile.openstreetmap.org/${z}/${((x%count)+count)%count}/${y}.png`;
  }
  function routePoints(records,coordinateMode='wgs84'){
    const result=[];let segment=0,lastTime=null,lastX=null,lastSource=null;
    for(const r of records){
      if(!Number.isFinite(r.latitude)||!Number.isFinite(r.longitude)||Math.abs(r.latitude)>90||Math.abs(r.longitude)>180){segment++;lastTime=null;continue;}
      if(lastTime!==null&&(r.sourceId!==lastSource||(Number.isFinite(r.timestamp)&&(r.timestamp-lastTime>60000||r.timestamp<lastTime))))segment++;
      lastSource=r.sourceId;
      const coordinate=coordinateMode==='gcj02'?gcjToWgs(r.latitude,r.longitude):r;
      const p=project(coordinate.latitude,coordinate.longitude);
      if(lastX!==null)p.x+=Math.round(lastX-p.x);
      lastX=p.x;lastTime=r.timestamp;result.push({...p,segment,altitude:Number.isFinite(r.altitude)?r.altitude:null,speed:Number.isFinite(r.speed)&&r.speed>=0?r.speed:null,distance:Number.isFinite(r.distance)&&r.distance>=0?r.distance:null});
    }
    return result;
  }
  const speedPalette=['#2563eb','#06b6d4','#22c55e','#facc15','#ef4444'];
  function speedRange(points){let min=Infinity,max=-Infinity;for(const p of points)if(Number.isFinite(p.speed)&&p.speed>=0){min=Math.min(min,p.speed);max=Math.max(max,p.speed);}return min===Infinity?null:[min,max];}
  function speedColor(speed,range){
    if(!Number.isFinite(speed)||speed<0||!range)return '#94a3b8';
    const ratio=range[1]>range[0]?clamp((speed-range[0])/(range[1]-range[0]),0,1):speed===0?0:.5;
    const position=ratio*4,index=Math.min(3,Math.floor(position)),weight=position-index;
    const a=speedPalette[index],b=speedPalette[index+1];
    return '#'+[1,3,5].map(i=>Math.round(parseInt(a.slice(i,i+2),16)*(1-weight)+parseInt(b.slice(i,i+2),16)*weight).toString(16).padStart(2,'0')).join('');
  }
  function groundDistance(a,b){
    const lat=p=>Math.atan(Math.sinh(Math.PI*(1-2*p.y))),la=lat(a),lb=lat(b),dl=(b.x-a.x)*2*Math.PI;
    const h=Math.sin((lb-la)/2)**2+Math.cos(la)*Math.cos(lb)*Math.sin(dl/2)**2;
    return 12742000*Math.asin(Math.sqrt(clamp(h,0,1)));
  }
  function routeMarkers(points,distanceOrigin=null){
    const result={kilometers:[],maxSpeed:null,maxAltitude:null,minAltitude:null};
    const origin=Number.isFinite(distanceOrigin)?distanceOrigin:points.find(p=>Number.isFinite(p.distance))?.distance;
    let previous=null,total=0,next=1000,estimated=false;
    for(const p of points){
      if(Number.isFinite(p.speed)&&p.speed>=0&&(!result.maxSpeed||p.speed>result.maxSpeed.speed))result.maxSpeed=p;
      if(Number.isFinite(p.altitude)){
        if(!result.maxAltitude||p.altitude>result.maxAltitude.altitude)result.maxAltitude=p;
        if(!result.minAltitude||p.altitude<result.minAltitude.altitude)result.minAltitude=p;
      }
      if(!previous){total=Number.isFinite(p.distance)&&Number.isFinite(origin)?Math.max(0,p.distance-origin):0;next=(Math.floor(total/1000)+1)*1000;previous=p;continue;}
      const connected=p.segment===previous.segment;
      const hasDistance=Number.isFinite(previous.distance)&&Number.isFinite(p.distance)&&p.distance>=previous.distance;
      if(!hasDistance)estimated=true;
      const delta=hasDistance?p.distance-previous.distance:connected?groundDistance(previous,p):0;
      const before=total;total+=delta;
      // Never place an interpolated marker across a GPS/time/file break or a
      // implausible distance jump. Later mileage retains FIT cumulative distance.
      if(connected&&delta>0&&delta<=10000){
        while(next<=total&&result.kilometers.length<5000){
          const f=(next-before)/delta;
          result.kilometers.push({x:previous.x+(p.x-previous.x)*f,y:previous.y+(p.y-previous.y)*f,segment:p.segment,kilometer:next/1000,estimated});next+=1000;
        }
      }else if(total>before&&total%1000===0&&hasDistance&&result.kilometers.length<5000){result.kilometers.push({...p,kilometer:total/1000,estimated});}
      next=(Math.floor(total/1000)+1)*1000;previous=p;
    }
    return result;
  }
  function el(name,attrs={}){const node=document.createElementNS('http://www.w3.org/2000/svg',name);for(const [k,v]of Object.entries(attrs))node.setAttribute(k,v);return node;}
  class Viewer{
    constructor(container,status,credit){
      this.container=container;this.status=status;this.credit=credit;this.source='grid';this.coordinateMode='wgs84';this.records=[];this.drawId=0;this.files=new Map();this.urls=new Map();this.levels=[];this.points=[];this.markerOptions={};this.markerData=null;this.center={x:.5,y:.5};this.zoom=2;
      this.svg=el('svg',{role:'img','aria-label':l10n('可缩放和平移的运动轨迹地图')});this.svg.classList.add('map-svg');
      this.controls=document.createElement('div');this.controls.className='map-controls';
      for(const [label,title,action]of [['+',l10n('放大地图'),()=>this.changeZoom(1)],['−',l10n('缩小地图'),()=>this.changeZoom(-1)],['⌖',l10n('显示完整轨迹'),()=>this.fit()]]){
        const button=document.createElement('button');button.textContent=label;button.title=title;button.setAttribute('aria-label',title);button.addEventListener('click',action);this.controls.append(button);
      }
      this.container.replaceChildren(this.svg,this.controls);
      this.svg.addEventListener('pointerdown',e=>{if(e.button!==0)return;this.drag={id:e.pointerId,x:e.clientX,y:e.clientY};this.svg.setPointerCapture(e.pointerId);this.svg.classList.add('panning');});
      this.svg.addEventListener('pointermove',e=>{if(!this.drag||this.drag.id!==e.pointerId)return;const scale=256*2**this.zoom;this.center.x-=(e.clientX-this.drag.x)/scale;this.center.y=clamp(this.center.y-(e.clientY-this.drag.y)/scale,0,1);this.drag.x=e.clientX;this.drag.y=e.clientY;this.schedule();});
      for(const name of ['pointerup','pointercancel','lostpointercapture'])this.svg.addEventListener(name,()=>{this.drag=null;this.svg.classList.remove('panning');});
      this.svg.addEventListener('wheel',e=>{e.preventDefault();const rect=this.svg.getBoundingClientRect();this.changeZoom(e.deltaY<0?.5:-.5,e.clientX-rect.left,e.clientY-rect.top);},{passive:false});
      this.observer=new ResizeObserver(()=>this.schedule());this.observer.observe(container);
    }
    schedule(){if(this.frame)return;this.frame=requestAnimationFrame(()=>{this.frame=null;this.draw();});}
    refreshLanguage(){
      this.svg.setAttribute('aria-label',l10n('可缩放和平移的运动轨迹地图'));
      const titles=['放大地图','缩小地图','显示完整轨迹'];
      Array.from(this.controls.querySelectorAll('button')).forEach((button,i)=>{button.title=l10n(titles[i]);button.setAttribute('aria-label',l10n(titles[i]));});
      this.setSource(this.source);
    }
    updatePoints(){this.points=routePoints(this.records,this.coordinateMode);this.markerData=routeMarkers(this.points,this.records.find(r=>Number.isFinite(r.distance)&&r.distance>=0)?.distance);}
    setRecords(records){this.records=records;this.updatePoints();this.fit();}
    setMarkers(options){this.markerOptions=Object.fromEntries(['kilometers','maxSpeed','maxAltitude','minAltitude'].map(key=>[key,options[key]===true]));this.draw();}
    setCoordinateMode(mode){
      if(!['wgs84','gcj02'].includes(mode))return false;
      this.coordinateMode=mode;this.updatePoints();this.draw();return true;
    }
    clear(){this.records=[];this.points=[];this.markerData=null;this.drawId++;this.svg.replaceChildren();for(const url of this.urls.values())URL.revokeObjectURL(url);this.urls.clear();this.status.textContent=l10n('在上方选择地图底图。');}
    setSource(source){
      if(!['grid','online','local'].includes(source))return false;
      if(source==='online'&&!['http:','https:'].includes(location.protocol)){this.status.textContent=l10n('在线地图需要通过 HTTP 或 HTTPS 服务打开页面，再选择在线底图。');return false;}
      this.source=source;
      if(this.credit){
        this.credit.replaceChildren();this.credit.hidden=source==='grid';
        if(source==='online'){const link=document.createElement('a');link.href='https://www.openstreetmap.org/copyright';link.target='_blank';link.rel='noopener';link.textContent='© OpenStreetMap contributors';this.credit.append(link);}
        else this.credit.textContent=l10n('底图来源及版权以导入地图数据的授权说明为准。');
      }
      this.draw();return true;
    }
    setTiles(files){
      const next=new Map(),levels=new Set();
      for(const file of files){const parsed=tileKey(file.webkitRelativePath||file.name);if(parsed){next.set(parsed.key,file);levels.add(parsed.z);}}
      if(!next.size){this.status.textContent=l10n('未找到地图瓦片。请选择包含 z/x/y.png（或 jpg、webp）结构的 XYZ 文件夹。');return false;}
      for(const url of this.urls.values())URL.revokeObjectURL(url);this.urls.clear();this.files=next;this.levels=[...levels].sort((a,b)=>a-b);this.setSource('local');return true;
    }
    dimensions(){return {w:Math.max(280,this.container.clientWidth),h:this.container.clientHeight||400};}
    fit(){
      if(!this.points.length){this.draw();return;}
      let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
      for(const p of this.points){minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);}
      this.center={x:(minX+maxX)/2,y:(minY+maxY)/2};const {w,h}=this.dimensions();
      this.zoom=clamp(Math.log2(Math.min((w-90)/(256*Math.max(maxX-minX,1e-8)),(h-90)/(256*Math.max(maxY-minY,1e-8)))),1,18);this.draw();
    }
    changeZoom(amount,px,py){const {w,h}=this.dimensions();px=px??w/2;py=py??h/2;const before=256*2**this.zoom;const worldX=this.center.x+(px-w/2)/before,worldY=this.center.y+(py-h/2)/before;this.zoom=clamp(this.zoom+amount,1,20);const after=256*2**this.zoom;this.center={x:worldX-(px-w/2)/after,y:clamp(worldY-(py-h/2)/after,0,1)};this.draw();}
    draw(){
      const drawId=++this.drawId;
      this.svg.setAttribute('data-map-source',this.source);
      const {w,h}=this.dimensions();this.svg.setAttribute('viewBox',l10n`0 0 ${w} ${h}`);this.svg.replaceChildren();
      if(!this.points.length){const text=el('text',{x:w/2,y:h/2,'text-anchor':'middle'});text.textContent=l10n('这份活动没有可用的 GPS 轨迹');this.svg.append(text);return;}
      const scale=256*2**this.zoom,x=p=>w/2+(p.x-this.center.x)*scale,y=p=>h/2+(p.y-this.center.y)*scale;
      let visible=0;
      const online=this.source==='online';
      if(online||(this.source==='local'&&this.levels.length)){
        const z=online?clamp(Math.floor(this.zoom),0,19):this.levels.reduce((best,n)=>Math.abs(n-this.zoom)<Math.abs(best-this.zoom)?n:best,this.levels[0]);
        const count=2**z,size=scale/count,left=this.center.x-w/2/scale,top=this.center.y-h/2/scale;
        const firstX=Math.floor(left*count),lastX=Math.floor((left+w/scale)*count),firstY=Math.max(0,Math.floor(top*count)),lastY=Math.min(count-1,Math.floor((top+h/scale)*count));
        if((lastX-firstX+1)*(lastY-firstY+1)<=512){
          for(let tx=firstX;tx<=lastX;tx++)for(let ty=firstY;ty<=lastY;ty++){
            const key=l10n`${z}/${((tx%count)+count)%count}/${ty}`,file=this.files.get(key);if(!online&&!file)continue;
            let url=online?onlineTileUrl(z,tx,ty):this.urls.get(key);if(!url){url=URL.createObjectURL(file);this.urls.set(key,url);}
            const image=el('image',{href:url,x:x({x:tx/count}),y:y({y:ty/count}),width:size+.5,height:size+.5,preserveAspectRatio:'none'});
            image.addEventListener('error',()=>{if(this.drawId===drawId)this.status.textContent=online?l10n('部分地图瓦片加载失败，请检查网络或稍后重新选择在线底图。'):l10n('部分本地瓦片无法显示，请检查图片文件。');});
            this.svg.append(image);visible++;
          }
        }
        this.status.textContent=online?l10n('OpenStreetMap 街道底图 · ')+(visible?l10n('当前层级 ')+z:l10n('当前视野无法加载瓦片')):visible?l10n`已导入 ${this.files.size} 张底图瓦片 · 当前层级 ${z}`:l10n('当前视野没有可用底图，请调整缩放或导入覆盖此区域的瓦片。');
      }
      else this.status.textContent=this.source==='local'?l10n('请导入 XYZ 瓦片文件夹（z/x/y.png）。'):l10n('在上方选择地图底图。');
      if(!visible){for(let gx=0;gx<w;gx+=64)this.svg.append(el('line',{x1:gx,x2:gx,y1:0,y2:h,stroke:'#e2e9dd'}));for(let gy=0;gy<h;gy+=64)this.svg.append(el('line',{x1:0,x2:w,y1:gy,y2:gy,stroke:'#e2e9dd'}));}
      let path='',segment=-1,px=null,py=null,previous=null;const colored=new Map(),range=speedRange(this.points);
      for(let i=0;i<this.points.length;i++){
        const p=this.points[i],cx=x(p),cy=y(p);
        if(p.segment===segment&&i!==this.points.length-1&&this.points[i+1].segment===segment&&Math.hypot(cx-px,cy-py)<.7)continue;
        const coordinates=cx.toFixed(2)+','+cy.toFixed(2);path+=(segment===p.segment?'L':'M')+coordinates;
        if(previous&&previous.segment===p.segment){
          const speed=Number.isFinite(previous.speed)&&Number.isFinite(p.speed)?(previous.speed+p.speed)/2:null;
          const quantized=range&&Number.isFinite(speed)&&range[1]>range[0]?range[0]+Math.round((speed-range[0])/(range[1]-range[0])*31)/31*(range[1]-range[0]):speed;
          const color=speedColor(quantized,range);colored.set(color,(colored.get(color)||'')+'M'+px.toFixed(2)+','+py.toFixed(2)+'L'+coordinates);
        }
        previous=p;segment=p.segment;px=cx;py=cy;
      }
      this.svg.append(el('path',{'class':'map-route-halo',d:path,fill:'none',stroke:'#fff','stroke-width':6,'stroke-linejoin':'round','stroke-linecap':'round'}));
      for(const [color,d]of colored)this.svg.append(el('path',{'class':'map-speed-line',d,fill:'none',stroke:color,'stroke-width':3.5,'stroke-linejoin':'round','stroke-linecap':'round'}));
      const legendX=w>=520?w-240:20,legendY=w>=520?h-102:20,legend=el('g',{'class':'map-speed-legend'});
      legend.append(el('rect',{x:legendX,y:legendY,width:220,height:86,rx:9,'class':'map-legend-box',fill:'#ffffff',opacity:.94}));
      const title=el('text',{x:legendX+12,y:legendY+20});title.textContent=l10n('速度')+' · km/h';legend.append(title);
      if(range){
        const defs=el('defs'),gradient=el('linearGradient',{id:'map-speed-gradient',x1:'0%',x2:'100%',y1:'0%',y2:'0%'});
        speedPalette.forEach((color,i)=>gradient.append(el('stop',{offset:(i*25)+'%','stop-color':color})));defs.append(gradient);legend.append(defs);
        legend.append(el('rect',{x:legendX+12,y:legendY+29,width:196,height:6,rx:3,fill:range[0]===range[1]?speedColor(range[0],range):'url(#map-speed-gradient)'}));
        for(const [value,dx,anchor]of [[range[0],12,'start'],[range[1],208,'end']]){const label=el('text',{x:legendX+dx,y:legendY+51,'text-anchor':anchor});label.textContent=(value*3.6).toFixed(1);legend.append(label);}
      }
      legend.append(el('line',{x1:legendX+12,x2:legendX+28,y1:legendY+70,y2:legendY+70,stroke:'#94a3b8','stroke-width':3}));
      const missing=el('text',{x:legendX+35,y:legendY+74});missing.textContent=l10n('缺少速度');legend.append(missing);
      if(Object.values(this.markerOptions||{}).some(Boolean)){
        const markers=this.markerData||routeMarkers(this.points),occupied=[{x:legendX,y:legendY,w:220,h:86},{x:w-58,y:42,w:46,h:130},{x:12,y:h-62,w:130,h:52}];
        const items=[];
        for(const [key,label,color,field,factor,unit]of [['maxSpeed','最快速度','#dc5a45','speed',3.6,'km/h'],['maxAltitude','最高海拔','#397e5b','altitude',1,'m'],['minAltitude','最低海拔','#4978ba','altitude',1,'m']]){
          if(this.markerOptions[key]&&markers[key]){const p=markers[key];items.push({p,key,color,label:l10n(label)+' '+(p[field]*factor).toFixed(1)+' '+unit});}
        }
        if(this.markerOptions.kilometers)for(const p of markers.kilometers)items.push({p,key:'kilometers',color:'#536a59',label:(p.estimated?'≈ ':'')+p.kilometer+' km'});
        for(const item of items){
          const cx=x(item.p),cy=y(item.p);if(cx<0||cx>w||cy<0||cy>h)continue;
          const group=el('g',{'class':'map-marker','data-marker':item.key,'aria-label':item.label}),title=el('title');title.textContent=item.label;group.append(title);
          const width=Math.min(w-16,20+Array.from(item.label).reduce((sum,char)=>sum+(char.charCodeAt(0)>255?11:6.2),0)),height=24;
          const candidates=[[cx-width/2,cy-36],[cx-width/2,cy+12],[cx+12,cy-height/2],[cx-width-12,cy-height/2]].map(([left,top])=>({x:clamp(left,8,w-width-8),y:clamp(top,8,h-height-8),w:width,h:height}));
          const box=candidates.find(a=>!occupied.some(b=>a.x<b.x+b.w+4&&a.x+a.w+4>b.x&&a.y<b.y+b.h+4&&a.y+a.h+4>b.y));
          if(box){
            occupied.push(box);group.append(el('line',{x1:cx,y1:cy,x2:clamp(cx,box.x,box.x+box.w),y2:clamp(cy,box.y,box.y+box.h),stroke:item.color,'stroke-width':1.2}));
            group.append(el('rect',{'class':'map-marker-box',x:box.x,y:box.y,width:box.w,height:box.h,rx:6,fill:'#fff',stroke:item.color,'stroke-width':1,opacity:.96}));
            const text=el('text',{x:box.x+box.w/2,y:box.y+16,'text-anchor':'middle'});text.textContent=item.label;group.append(text);
          }
          group.append(el('circle',{cx,cy,r:item.key==='kilometers'?3.5:5,fill:item.color,stroke:'#fff','stroke-width':2}));this.svg.append(group);
        }
      }
      this.svg.append(legend);
      for(const [p,color]of [[this.points[0],'#399769'],[this.points[this.points.length-1],'#de9253']])this.svg.append(el('circle',{cx:x(p),cy:y(p),r:6,fill:color,stroke:'white','stroke-width':2}));
      const metersPerPixel=40075016.686*Math.cos(Math.atan(Math.sinh(Math.PI*(1-2*this.center.y))))/scale;
      const target=metersPerPixel*100,power=10**Math.floor(Math.log10(target)),length=[1,2,5].map(n=>n*power).filter(n=>n<=target).pop()||power;
      const pixels=length/metersPerPixel;
      this.svg.append(el('path',{'class':'map-scale',d:l10n`M20,${h-32}v5h${pixels}v-5`,fill:'none',stroke:'#254936','stroke-width':2}));const text=el('text',{x:20,y:h-38});text.textContent=length>=1000?l10n`${length/1000} km`:l10n`${Math.round(length)} m`;this.svg.append(text);
      const north=el('text',{x:w-20,y:25,'text-anchor':'end'});north.textContent='N ↑';this.svg.append(north);
      // Keep only URLs of visible tiles, bounding memory during long pans.
      const used=new Set(Array.from(this.svg.querySelectorAll('image'),image=>image.getAttribute('href')));
      for(const [key,url]of this.urls)if(!used.has(url)){URL.revokeObjectURL(url);this.urls.delete(key);}
    }
  }
  const api={Viewer,project,tileKey,routePoints,routeMarkers,speedRange,speedColor,onlineTileUrl,gcjForward,gcjToWgs};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.RouteMap=api;
})(globalThis);
