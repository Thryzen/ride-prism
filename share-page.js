'use strict';
  const l10n=(s,...values)=>{const t=v=>typeof I18n==='undefined'?v:I18n.t(v);return Array.isArray(s)?s.reduce((out,part,i)=>out+t(part)+(i<values.length?values[i]:''),''):t(s);};
const $ = id => document.getElementById(id);
let shareData=null, timer=null, attempts=0;
let titleEdited=false;
let backgroundImage=null,photoGeneration=0,photoLoading=false,mapImage=null,mapImagePlan=null,mapKey='',pendingMapKey='',failedMapKey='',mapGeneration=0,mapRequestTimer=null;
function localizeShare(){
  if(!titleEdited)$('shareTitle').value=l10n('一路向前');
  if(shareData){updateManufacturerHint();drawShare();}
}
function updateManufacturerHint(){
  $('shareManufacturerHint').textContent=shareData.manufacturers?.length?l10n('可显示：')+shareData.manufacturers.map(name=>l10n(name)).join(' / ')+(shareData.manufacturerFallback?l10n('。包含文件创建者厂商，图片使用“BRAND”标注。'):''):l10n('未提供记录设备或文件创建者的厂商信息。');
}
const embedded=!!window.parent&&window.parent!==window;
const token=location.hash.slice(1), parent=embedded?window.parent:window.opener;
const targetOrigin=location.protocol==='file:'?'*':location.origin;
$('returnActivity').addEventListener('click',event=>{
  if(!parent||parent.closed||!shareData)return;
  event.preventDefault();
  if(embedded)parent.postMessage({type:'fit-share-close',token},targetOrigin);
  else{parent.focus();window.close();}
});
function drawShare(){
  if(!shareData)return;
  try{
    const wants3d=$('shareRouteStyle').value==='3d';
    let background=$('shareBackground').value||'theme';
    if(background!=='online'&&pendingMapKey){mapGeneration++;pendingMapKey='';clearTimeout(mapRequestTimer);}
    $('photoBackgroundControls').hidden=background!=='photo';
    $('onlineBackgroundControls').hidden=background!=='online';
    $('share3dControls').hidden=!wants3d;
    const yaw=Number($('shareYaw').value),pitch=Number($('sharePitch').value),relief=Number($('shareRelief').value);
    for(const id of ['shareYaw','sharePitch','shareRelief']){
      const input=$(id+'Value');if(document.activeElement!==input)input.value=$(id).value;
    }
    const elevations=(shareData.points||[]).filter(p=>Number.isFinite(p.altitude));
    const missing=wants3d&&elevations.length<2;
    const selected=Array.from($('shareMetrics').querySelectorAll('input:checked')).map(input=>input.value).slice(0,4);
    let plan=null,backgroundNote='',ready=true;
    if(background==='photo'&&(photoLoading||!backgroundImage)){ready=false;backgroundNote=l10n(photoLoading?'正在读取背景图片。':'请选择一张背景图片。');}
    if(background==='online'){
      if(!['http:','https:'].includes(location.protocol)){ready=false;backgroundNote=l10n('在线地图背景需要通过本机 HTTP 服务或 HTTPS 网站打开。');}
      else{
        const dimensions=ShareCard.layout($('shareSize').value),box=dimensions.route,mapBox=dimensions.map;
        const coverage=wants3d&&!missing?ShareCard.elevationScene(shareData.points||[],box,{yaw,pitch,relief},null,mapBox).coverage:null;
        plan=ShareBackground.mapPlan(shareData.points||[],mapBox.width,mapBox.height,coverage,box);
        if(!plan){ready=false;backgroundNote=l10n('活动缺少 GPS 路线，无法加载在线地图背景。');}
        else if(mapKey!==plan.key||!mapImage){
          ready=false;backgroundNote=l10n(failedMapKey===plan.key?'地图加载失败，请重试或选择其他背景。':'正在加载当前路线的地图背景。');
          if(pendingMapKey!==plan.key&&failedMapKey!==plan.key){
            const generation=++mapGeneration;pendingMapKey=plan.key;clearTimeout(mapRequestTimer);
            mapRequestTimer=setTimeout(()=>{
              if(generation!==mapGeneration)return;
              ShareBackground.loadMap(plan,{isCancelled:()=>generation!==mapGeneration}).then(canvas=>{
                if(generation!==mapGeneration)return;mapImage=canvas;mapImagePlan=plan;mapKey=plan.key;failedMapKey='';pendingMapKey='';drawShare();
              }).catch(()=>{if(generation!==mapGeneration)return;pendingMapKey='';failedMapKey=plan.key;drawShare();});
            },200);
          }
        }else if(pendingMapKey){mapGeneration++;pendingMapKey='';clearTimeout(mapRequestTimer);}
      }
    }
    ShareCard.render($('shareCanvas'),shareData,{theme:$('shareTheme').value,size:$('shareSize').value,title:$('shareTitle').value,subtitle:$('shareSubtitle').value,signature:$('shareSignature').value,showRoute:$('shareRoute').checked,showDate:$('shareDate').checked,showManufacturer:$('shareManufacturer').checked,metrics:selected,routeStyle:missing?'2d':$('shareRouteStyle').value,yaw,pitch,relief,backgroundImage:background==='photo'?backgroundImage:null,backgroundShade:Number($('backgroundShade').value)/100,mapLayer:background==='online'&&plan&&mapImage?{canvas:mapImage,plan:ready?plan:mapImagePlan}:null});
    $('exportShare').disabled=!ready;
    $('shareStatus').textContent=l10n`${$('shareCanvas').width} × ${$('shareCanvas').height} PNG · ${missing?l10n('缺少足够的 GPS 海拔点，已使用平面路线。'):wants3d?l10n('路线高度来自 FIT 海拔，底部为参考平面；起伏强度仅改变展示。'):l10n('使用打开此页面时的活动与坐标修正设置。')}`;
    $('backgroundStatus').textContent=backgroundNote||(background==='photo'?l10n('背景图片按画幅居中裁切，可调整遮罩保持文字清晰。'):background==='online'?l10n(wants3d&&!missing?'三维地图已加载。':'在线地图已加载，版权标注会保留在导出图片中。'):l10n('使用主题背景。'));
  }catch(error){$('exportShare').disabled=true;$('shareStatus').textContent=l10n('分享图生成失败：')+error.message;}
}
window.addEventListener('message',event=>{
  const origin=location.protocol==='file:'?'null':location.origin;
  if(!parent||event.source!==parent||event.origin!==origin||!token||event.data?.token!==token||event.data.type!=='fit-share-data'||!event.data.data)return;
  clearTimeout(timer);shareData=event.data.data;
  $('shareManufacturer').disabled=!shareData.manufacturers?.length;
  updateManufacturerHint();
  $('shareEmpty').hidden=true;$('shareStudio').hidden=false;drawShare();
});
function requestActivity(){
  if(shareData||!parent||parent.closed||!token)return;
  parent.postMessage({type:'fit-share-ready',token},targetOrigin);
  if(++attempts<20)timer=setTimeout(requestActivity,500);
  else $('shareEmpty').textContent=l10n('未收到活动数据，请从活动查看器重新点击“制作分享图”。');
}
let inputToastTimer=null;
function showInputToast(message){
  const toast=$('inputToast');clearTimeout(inputToastTimer);
  toast.textContent=message;toast.hidden=false;
  inputToastTimer=setTimeout(()=>{toast.hidden=true;},2400);
}
for(const id of ['shareYaw','sharePitch','shareRelief']){
  const slider=$(id),input=$(id+'Value');
  function update(commit=false){
    if(input.value.trim()===''||!Number.isFinite(Number(input.value))){if(commit)input.value=slider.value;return;}
    const min=Number(input.min),max=Number(input.max),step=Number(input.step)||1;
    const value=Number(input.value),bounded=Math.min(max,Math.max(min,value));
    if(value!==bounded){
      if(commit){
        input.value=slider.value;
        const [label,unit]={shareYaw:['旋转','°'],sharePitch:['俯视角','°'],shareRelief:['起伏强度','×']}[id];
        showInputToast(l10n(label)+l10n('范围为 ')+min+'–'+max+unit+l10n('，已保留原值。'));
      }
      return;
    }
    const snapped=Number((min+Math.round((bounded-min)/step)*step).toFixed(6));
    if(!commit&&(value!==bounded||Math.abs(value-snapped)>1e-6))return;
    slider.value=String(snapped);if(commit)input.value=slider.value;drawShare();
  }
  input.addEventListener('input',()=>update());
  input.addEventListener('change',()=>update(true));
  input.addEventListener('blur',()=>update(true));
  input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();update(true);input.blur();}else if(event.key==='Escape'){input.value=slider.value;input.blur();}});
}
for(const id of ['shareTheme','shareSize','shareTitle','shareSubtitle','shareSignature','shareRoute','shareDate','shareManufacturer','shareRouteStyle','shareYaw','sharePitch','shareRelief','shareBackground','backgroundShade'])$(id).addEventListener(['shareTitle','shareSubtitle','shareSignature','shareYaw','sharePitch','shareRelief','backgroundShade'].includes(id)?'input':'change',()=>{if(id==='shareTitle')titleEdited=true;drawShare();});
$('backgroundInput').addEventListener('change',async event=>{
  const file=event.target.files?.[0];event.target.value='';if(!file)return;
  const generation=++photoGeneration;
  if(!/\.(png|jpe?g|webp|avif)$/i.test(file.name)||file.size>24*1024*1024){photoLoading=false;drawShare();$('backgroundStatus').textContent=l10n('请选择不超过 24 MB 的 JPG、PNG、WebP 或 AVIF 图片。');return;}
  photoLoading=true;$('shareBackground').value='photo';drawShare();const url=URL.createObjectURL(file);
  try{
    const image=await ShareBackground.loadImage(url);
    if(generation!==photoGeneration)return;
    if(image.naturalWidth*image.naturalHeight>40000000)throw new Error('IMAGE_TOO_LARGE');
    backgroundImage=image;photoLoading=false;drawShare();
  }catch(error){if(generation===photoGeneration){photoLoading=false;drawShare();$('backgroundStatus').textContent=l10n('背景图片无法读取或超过 4000 万像素，请选择其他图片。');}}
  finally{URL.revokeObjectURL(url);}
});
$('clearBackground').addEventListener('click',()=>{photoGeneration++;photoLoading=false;backgroundImage=null;$('shareBackground').value='theme';drawShare();});
$('reloadMapBackground').addEventListener('click',()=>{failedMapKey='';mapKey='';mapImage=null;mapGeneration++;pendingMapKey='';drawShare();});
$('shareMetrics').addEventListener('change',event=>{
  if($('shareMetrics').querySelectorAll('input:checked').length>4){event.target.checked=false;$('shareStatus').textContent=l10n('最多选择 4 项指标，请先取消一项。');return;}
  drawShare();
});
$('exportShare').addEventListener('click',()=>{
  if(!shareData||$('exportShare').disabled)return;
  try{$('shareCanvas').toBlob(blob=>{
    if(!blob){$('shareStatus').textContent=l10n('图片导出失败，请重试。');return;}
    const url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;link.download='activity-share.png';document.body.append(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);$('shareStatus').textContent=l10n('高清 PNG 已生成，请保存图片。');
  },'image/png');}catch(error){$('shareStatus').textContent=l10n('图片导出失败，在线地图可能不允许跨域导出，请改用主题或自定义图片背景。');}
});
if(typeof I18n!=='undefined'){localizeShare();I18n.onChange(localizeShare);}
requestActivity();
