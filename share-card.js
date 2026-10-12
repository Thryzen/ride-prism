(function(root){
  'use strict';
  const l10n=(s,...values)=>{const t=v=>typeof I18n==='undefined'?v:I18n.t(v);return Array.isArray(s)?s.reduce((out,part,i)=>out+t(part)+(i<values.length?values[i]:''),''):t(s);};
  const themes={
    ink:{background:'#141c19',foreground:'#f2f3e9',muted:'#8c9e91',accent:'#d8ee9d',line:'#344438',wash:'#1d2b22',name:'墨色'},
    paper:{background:'#f4f0e7',foreground:'#2b332c',muted:'#89917f',accent:'#c26e45',line:'#d8d7ca',wash:'#e9e7dc',name:'奶油'},
    mist:{background:'#e7eee8',foreground:'#254736',muted:'#718a7a',accent:'#397e5b',line:'#c5d5c7',wash:'#d9e5db',name:'松绿'}
  };
  const sizes={portrait:1350,square:1080,story:1920};
  const font='"Segoe UI", "Microsoft YaHei", sans-serif';
  function layout(size){const height=sizes[size]||1350,route={x:120,y:Math.max(250,height*.205),width:840,height:height===1080?300:height*.32};return {width:1080,height,margin:80,route,map:{x:80,y:route.y,width:920,height:route.height},heroLabel:height*.575,heroBaseline:height*.68,metricsY:height*.755,rowHeight:height*.096,footerY:height-52};}
  function time(seconds){if(!Number.isFinite(seconds))return '—';seconds=Math.max(0,Math.round(seconds));return l10n`${Math.floor(seconds/3600)}:${String(Math.floor(seconds/60)%60).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;}
  function value(n,digits=0){return Number.isFinite(n)?n.toLocaleString('en-US',{minimumFractionDigits:digits,maximumFractionDigits:digits}):'—';}
  function metric(key,data){
    const table={
      time:[data.timerKnown?l10n('运动时间'):l10n('经过时间'),time(data.time),''],
      elapsed:[l10n('经过时长'),time(data.elapsed),''],
      speed:[data.timerKnown?l10n('平均速度'):l10n('均速（含暂停）'),value(Number.isFinite(data.speed)?data.speed*3.6:null,1),'km/h'],
      maxSpeed:[l10n('最快速度'),value(Number.isFinite(data.maxSpeed)?data.maxSpeed*3.6:null,1),'km/h'],
      ascent:[l10n('累计爬升'),value(data.ascent),'m'],descent:[l10n('累计下降'),value(data.descent),'m'],
      maxAltitude:[l10n('最高海拔'),value(data.maxAltitude,1),'m'],minAltitude:[l10n('最低海拔'),value(data.minAltitude,1),'m'],
      calories:[l10n('消耗热量'),value(data.calories),'kcal'],
      heartRate:[l10n('平均心率'),value(data.heartRate),'bpm'],maxHeartRate:[l10n('最高心率'),value(data.maxHeartRate),'bpm'],
      power:[l10n('平均功率'),value(data.power),'W'],maxPower:[l10n('最高功率'),value(data.maxPower),'W'],
      cadence:[data.cadenceLabel||l10n('平均踏频'),value(data.cadence),'rpm'],maxCadence:[data.maxCadenceLabel||l10n('最高踏频'),value(data.maxCadence),'rpm'],
      temperature:[l10n('平均温度'),value(data.temperature,1),'°C']
    };
    const result=table[key]||table.time;result[0]=l10n(result[0]);return result;
  }
  function routeGeometry(points,box){
    if(!points.length)return [];
    let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
    for(const p of points){minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);}
    const scale=Math.min(box.width/Math.max(maxX-minX,1e-8),box.height/Math.max(maxY-minY,1e-8));
    return points.map(p=>({x:box.x+box.width/2+(p.x-(minX+maxX)/2)*scale,y:box.y+box.height/2+(p.y-(minY+maxY)/2)*scale,segment:p.segment}));
  }
  function elevationScene(points,box,options={},mapPlan=null,viewport=box){
    const valid=points.filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.altitude));
    if(valid.length<2)return {points:[],matrix:null};
    let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity,minZ=Infinity,maxZ=-Infinity;
    for(const p of valid){minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);minZ=Math.min(minZ,p.altitude);maxZ=Math.max(maxZ,p.altitude);}
    const cx=(minX+maxX)/2,cy=(minY+maxY)/2;
    // Convert normalized Mercator distance to approximate local metres before elevating.
    const latitude=Math.atan(Math.sinh(Math.PI*(1-2*cy)));
    const metres=40075016.686*Math.cos(latitude);
    const yaw=(Number.isFinite(options.yaw)?options.yaw:-30)*Math.PI/180;
    const pitch=Math.max(15,Math.min(75,Number.isFinite(options.pitch)?options.pitch:40))*Math.PI/180;
    const relief=Math.max(1,Math.min(30,Number.isFinite(options.relief)?options.relief:8));
    let segment=0,previous=null,hadGap=true;
    const projected=[];
    for(const p of points){
      if(!Number.isFinite(p.x)||!Number.isFinite(p.y)||!Number.isFinite(p.altitude)){hadGap=true;continue;}
      if(hadGap||previous!==p.segment)segment++;
      previous=p.segment;hadGap=false;
      const x=(p.x-cx)*metres,y=(p.y-cy)*metres;
      const rx=x*Math.cos(yaw)-y*Math.sin(yaw),depth=x*Math.sin(yaw)+y*Math.cos(yaw);
      const groundY=depth*Math.sin(pitch),lift=(p.altitude-minZ)*relief*Math.cos(pitch);
      projected.push({x:rx,y:groundY-lift,groundX:rx,groundY,depth,segment,altitude:p.altitude,worldX:p.x,worldY:p.y});
    }
    let loX=Infinity,hiX=-Infinity,loY=Infinity,hiY=-Infinity;
    for(const p of projected){loX=Math.min(loX,p.x);hiX=Math.max(hiX,p.x);loY=Math.min(loY,p.y,p.groundY);hiY=Math.max(hiY,p.y,p.groundY);}
    const hasMap=mapPlan&&Number.isFinite(mapPlan.scale)&&mapPlan.scale>0&&Number.isFinite(mapPlan.left)&&Number.isFinite(mapPlan.top);
    function ground(wx,wy){const x=(wx-cx)*metres,y=(wy-cy)*metres;return {x:x*Math.cos(yaw)-y*Math.sin(yaw),y:(x*Math.sin(yaw)+y*Math.cos(yaw))*Math.sin(pitch)};}
    // Framing is determined by the route only, independent of its background.
    const scale=Math.min(box.width/Math.max(hiX-loX,1),box.height/Math.max(hiY-loY,1));
    const tx=box.x+box.width/2-(loX+hiX)/2*scale,ty=box.y+box.height/2-(loY+hiY)/2*scale;
    let matrix=null;
    if(hasMap){const factor=metres*scale/mapPlan.scale,origin=ground(mapPlan.left,mapPlan.top);matrix=[Math.cos(yaw)*factor,Math.sin(yaw)*Math.sin(pitch)*factor,-Math.sin(yaw)*factor,Math.cos(yaw)*Math.sin(pitch)*factor,tx+origin.x*scale,ty+origin.y*scale];}
    function inverse(sx,sy){const rx=(sx-tx)/scale,depth=(sy-ty)/(scale*Math.sin(pitch));return {x:cx+(rx*Math.cos(yaw)+depth*Math.sin(yaw))/metres,y:cy+(-rx*Math.sin(yaw)+depth*Math.cos(yaw))/metres};}
    const corners=[[viewport.x,viewport.y],[viewport.x+viewport.width,viewport.y],[viewport.x+viewport.width,viewport.y+viewport.height],[viewport.x,viewport.y+viewport.height]].map(([x,y])=>inverse(x,y));
    return {points:projected.map(p=>({...p,x:tx+p.x*scale,y:ty+p.y*scale,groundX:tx+p.groundX*scale,groundY:ty+p.groundY*scale})),matrix,coverage:{corners,worldScale:metres*scale}};
  }
  function elevationGeometry(points,box,options={}){return elevationScene(points,box,options).points;}
  function render(canvas,data,options={}){
    const l=layout(options.size),t=themes[options.theme]||themes.ink;
    canvas.width=l.width;canvas.height=l.height;
    const ctx=canvas.getContext('2d');if(!ctx)throw new Error(l10n('浏览器未提供图片绘图功能。'));
    const w=l.width,h=l.height,m=l.margin;
    const photoShade=Math.max(0,Math.min(.95,Number.isFinite(options.backgroundShade)?options.backgroundShade:.7));
    const textProtection=options.backgroundImage?Math.max(0,1-photoShade/.65):0;
    const sport=data.sportNames?.length?data.sportNames.map(name=>l10n(name)).join(' / '):l10n(data.sport||'ACTIVITY');
    ctx.fillStyle=t.background;ctx.fillRect(0,0,w,h);
    if(options.backgroundImage){
      const iw=options.backgroundImage.naturalWidth||options.backgroundImage.width,ih=options.backgroundImage.naturalHeight||options.backgroundImage.height,scale=Math.max(w/iw,h/ih);
      ctx.drawImage(options.backgroundImage,(w-iw*scale)/2,(h-ih*scale)/2,iw*scale,ih*scale);
      ctx.globalAlpha=photoShade;ctx.fillStyle=t.background;ctx.fillRect(0,0,w,h);ctx.globalAlpha=1;
    }
    let photoPixels=null;
    if(textProtection&&ctx.getImageData){try{photoPixels=ctx.getImageData(0,0,w,h).data;}catch{}}
    const rgb=color=>[1,3,5].map(i=>parseInt(color.slice(i,i+2),16));
    function luminance(channels){const linear=channels.map(c=>{const s=c/255;return s<=.04045?s/12.92:((s+.055)/1.055)**2.4;});return linear[0]*.2126+linear[1]*.7152+linear[2]*.0722;}
    function photoTextColor(color,x,y,size,width){
      if(!photoPixels)return color;
      const samples=[];
      for(let row=0;row<3;row++)for(let col=0;col<7;col++){
        const px=Math.max(0,Math.min(w-1,Math.round(x+(col+.5)*width/7))),py=Math.max(0,Math.min(h-1,Math.round(y-size+(row+.5)*size/3))),index=(py*w+px)*4;
        samples.push(luminance([photoPixels[index],photoPixels[index+1],photoPixels[index+2]]));
      }
      function score(candidate){const lum=luminance(rgb(candidate));const ratios=samples.map(s=>(Math.max(s,lum)+.05)/(Math.min(s,lum)+.05)).sort((a,b)=>a-b);return ratios[4];}
      const originalScore=score(color);if(originalScore>=(size>=24?3:4.5))return color;
      const candidate=score(t.foreground)>=score(t.background)?t.foreground:t.background;
      if(score(candidate)<=originalScore)return color;
      const a=rgb(color),b=rgb(candidate);return '#'+a.map((v,i)=>Math.round(v+(b[i]-v)*textProtection).toString(16).padStart(2,'0')).join('');
    }
    function text(content,x,y,size,color=t.foreground,weight=400,maxWidth=920){
      ctx.font=l10n`${weight} ${size}px ${font}`;while(ctx.measureText(String(content)).width>maxWidth&&size>18){size-=1;ctx.font=l10n`${weight} ${size}px ${font}`;}
      const decorative=color===t.wash;
      if(!decorative)color=photoTextColor(color,x,y,size,ctx.measureText(String(content)).width);
      ctx.textAlign='left';
      ctx.fillStyle=color;ctx.fillText(String(content),x,y);
    }
    function line(x1,y1,x2,y2,color=t.line){ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.strokeStyle=color;ctx.lineWidth=1.5;ctx.stroke();}
    text('MOVE / '+sport,m,82,19,t.muted,600,620);
    if(options.showDate!==false&&Number.isFinite(data.startTime)){
      const d=new Date(data.startTime),date=l10n`${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
      ctx.font=l10n`400 20px ${font}`;text(date,w-m-ctx.measureText(date).width,82,20,t.muted);
    }
    line(m,109,w-m,109);
    text((options.title||l10n('一路向前')).slice(0,80),m,h===1920?205:174,58,t.foreground,600,920);
    if(options.subtitle)text(options.subtitle.slice(0,100),m,h===1920?257:219,23,t.muted,400,920);
    const mapLayer=(options.mapLayer?.plan.frameWidth??options.mapLayer?.plan.width)===l.map.width&&(options.mapLayer?.plan.frameHeight??options.mapLayer?.plan.height)===l.map.height?options.mapLayer:null;
    const scene=options.routeStyle==='3d'?elevationScene(data.points||[],l.route,options,mapLayer?.plan,l.map):{points:[],matrix:null};
    const is3d=scene.points.length>=2;
    const elevated=scene.points;
    if(mapLayer){
      if(is3d&&scene.matrix){ctx.save();ctx.beginPath();ctx.rect(l.map.x,l.map.y,l.map.width,l.map.height);ctx.clip();ctx.transform(...scene.matrix);ctx.drawImage(mapLayer.canvas,0,0,mapLayer.plan.width,mapLayer.plan.height);ctx.restore();}
      else ctx.drawImage(mapLayer.canvas,l.map.x,l.map.y,l.map.width,l.map.height);
    }
    const routeInk=mapLayer?'#c74626':t.accent;
    const photoRoute=!!options.backgroundImage;
    const photoContrast=photoRoute?Math.max(0,1-Math.abs(photoShade-.5)/.35):0;
    const points=options.showRoute===false?[]:is3d?elevated:mapLayer?mapLayer.plan.points.map(p=>({...p,x:p.x+l.map.x,y:p.y+l.map.y})):routeGeometry(data.points||[],l.route);
    if(points.length>=2){
      // Map layers contain only CORS-authorized tiles loaded for the current preview.
      if(is3d){
        // Ground trace and translucent elevation curtains make height readable without terrain tiles.
        const edges=[];for(let i=1;i<points.length;i++)if(points[i-1].segment===points[i].segment)edges.push([points[i-1],points[i]]);
        edges.sort((a,b)=>(a[0].depth+a[1].depth)-(b[0].depth+b[1].depth));
        ctx.fillStyle=t.accent;ctx.globalAlpha=.1+.06*photoContrast;
        for(const [a,b] of edges){ctx.beginPath();ctx.moveTo(a.groundX,a.groundY);ctx.lineTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.lineTo(b.groundX,b.groundY);ctx.fill();}
        ctx.globalAlpha=1;
        ctx.lineJoin='round';ctx.lineCap='round';ctx.beginPath();
        for(let i=0;i<points.length;i++){const p=points[i];if(i===0||points[i-1].segment!==p.segment)ctx.moveTo(p.groundX,p.groundY);else ctx.lineTo(p.groundX,p.groundY);}
        if(photoContrast){ctx.strokeStyle=t.background;ctx.lineWidth=7;ctx.globalAlpha=.9*photoContrast;ctx.stroke();}
        ctx.strokeStyle=t.line;ctx.lineWidth=2;ctx.globalAlpha=1;ctx.stroke();
        if(photoContrast){ctx.strokeStyle=t.foreground;ctx.lineWidth=2.75;ctx.globalAlpha=photoContrast;ctx.stroke();ctx.globalAlpha=1;}
        if(mapLayer||photoContrast){
          ctx.strokeStyle=routeInk;ctx.lineWidth=1;ctx.globalAlpha=.3;let previousGuide=null;
          for(let i=0;i<points.length;i++){const p=points[i];if(previousGuide&&previousGuide.segment===p.segment&&i!==points.length-1&&Math.hypot(p.groundX-previousGuide.groundX,p.groundY-previousGuide.groundY)<35)continue;ctx.beginPath();ctx.moveTo(p.groundX,p.groundY);ctx.lineTo(p.x,p.y);if(photoContrast){ctx.strokeStyle=t.background;ctx.lineWidth=3;ctx.globalAlpha=.65*photoContrast;ctx.stroke();ctx.strokeStyle=routeInk;ctx.lineWidth=1;ctx.globalAlpha=.6*photoContrast;}ctx.stroke();previousGuide=p;}ctx.globalAlpha=1;
        }
      }
      ctx.strokeStyle=routeInk;ctx.lineWidth=5;ctx.lineJoin='round';ctx.lineCap='round';ctx.beginPath();
      let previous=null,px=null,py=null;
      for(let i=0;i<points.length;i++){const p=points[i];if(previous===p.segment&&i!==points.length-1&&Math.hypot(p.x-px,p.y-py)<.8)continue;if(previous!==p.segment)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y);previous=p.segment;px=p.x;py=p.y;}
      if(mapLayer||photoContrast){ctx.strokeStyle=mapLayer?'#fff':t.background;ctx.lineWidth=9;ctx.globalAlpha=mapLayer?1:photoContrast;ctx.stroke();ctx.globalAlpha=1;ctx.strokeStyle=routeInk;ctx.lineWidth=5;}ctx.stroke();
      const first=points[0],last=points[points.length-1];
      ctx.fillStyle=t.background;ctx.strokeStyle=routeInk;ctx.lineWidth=3;ctx.beginPath();ctx.arc(first.x,first.y,8,0,Math.PI*2);ctx.fill();ctx.stroke();
      ctx.fillStyle=routeInk;ctx.beginPath();ctx.arc(last.x,last.y,6,0,Math.PI*2);ctx.fill();
      let caption='THE ROUTE';
      if(is3d){let low=Infinity,high=-Infinity;for(const p of points){low=Math.min(low,p.altitude);high=Math.max(high,p.altitude);}caption=l10n`ELEVATION / ${value(low)}–${value(high)} m · 起伏 ×${Math.max(1,Math.min(30,Number.isFinite(options.relief)?options.relief:8))}`;}
      text(caption,m,l.route.y+l.route.height+36,15,t.muted,500);
    }else if(!mapLayer){
      // A typographic fallback also works for indoor activities and hidden routes.
      text(sport===l10n('骑行')?'RIDE.':sport===l10n('跑步')?'RUN.':'MOVE.',m,l.route.y+l.route.height*.68,170,t.wash,700,920);
      text(options.showRoute===false?l10n('每一次出发，都算数。'):l10n('把热爱，变成日常。'),m,l.route.y+l.route.height*.83,26,t.muted);
    }
    if(mapLayer){
      const credit='© OpenStreetMap contributors',cx=l.map.x+l.map.width-260,cy=l.map.y+l.map.height-26;
      ctx.fillStyle='#ffffff';ctx.fillRect(cx-6,cy-1,266,27);text(credit,cx,cy+18,14,'#344438',400,252);
    }
    text(l10n('DISTANCE / 距离'),m,l.heroLabel,20,t.muted,500);
    const distance=value(Number.isFinite(data.distance)?data.distance/1000:null,2),size=h===1920?156:h===1080?108:140;
    text(distance,m,l.heroBaseline,size,t.foreground,700,730);
    const distanceWidth=ctx.measureText(distance).width;text('km',Math.min(w-m-55,m+distanceWidth+22),l.heroBaseline-6,34,t.accent,400);
    line(m,l.metricsY-40,w-m,l.metricsY-40);
    const selected=(options.metrics||['time','speed','ascent','power']).slice(0,4);
    selected.forEach((key,index)=>{
      const [label,reading,unit]=metric(key,data),x=m+(index%2)*470,y=l.metricsY+Math.floor(index/2)*l.rowHeight;
      text(label,x,y,21,t.muted,400,420);text(reading,x,y+59,44,t.foreground,600,330);
      const readingWidth=ctx.measureText(reading).width;if(unit)text(unit,x+readingWidth+12,y+56,20,t.muted,400,80);
    });
    line(m,h-92,w-m,h-92);
    const brand=options.showManufacturer&&data.manufacturers?.length?(data.manufacturerFallback?'BRAND / ':'DEVICE / ')+data.manufacturers.map(name=>l10n(name)).join(' / '):null;
    let signature=(options.signature||'').slice(0,60);
    if(brand){ctx.font=l10n`400 19px ${font}`;while(signature.length&&ctx.measureText(signature).width>460)signature=signature.slice(0,-1);if(signature!==(options.signature||'').slice(0,60))signature=signature.slice(0,-1)+'…';}
    text(signature,m,l.footerY,19,t.muted,400,brand?470:720);
    if(brand){let label=brand;ctx.font=l10n`400 17px ${font}`;while(label.length&&ctx.measureText(label).width>410)label=label.slice(0,-1);if(label!==brand)label=label.slice(0,-1)+'…';text(label,w-m-ctx.measureText(label).width,l.footerY,17,t.muted,400,420);}
    else text('KEEP MOVING',w-m-170,l.footerY,17,t.muted,500,170);
    return l;
  }
  const api={render,layout,metric,routeGeometry,elevationGeometry,elevationScene,themes};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ShareCard=api;
})(globalThis);
