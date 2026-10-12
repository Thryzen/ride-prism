(function(root){
  'use strict';
  function intersects(rect,polygon){
    const axes=[{x:1,y:0},{x:0,y:1}];for(let i=0;i<polygon.length;i++){const a=polygon[i],b=polygon[(i+1)%polygon.length];axes.push({x:-(b.y-a.y),y:b.x-a.x});}
    for(const axis of axes){const p=polygon.map(v=>v.x*axis.x+v.y*axis.y),q=rect.map(v=>v.x*axis.x+v.y*axis.y);if(Math.max(...p)<Math.min(...q)||Math.max(...q)<Math.min(...p))return false;}return true;
  }
  function mapPlan(points,width,height,coverage=null,fit=null){
    const valid=points.filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y));if(valid.length<2)return null;
    let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
    for(const p of valid){minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);}
    const frameWidth=width,frameHeight=height;
    let scale=Math.min((fit?.width??width)/Math.max(maxX-minX,1e-8),(fit?.height??height)/Math.max(maxY-minY,1e-8)),left=(minX+maxX)/2-width/2/scale,top=(minY+maxY)/2-height/2/scale;
    if(coverage){
      const xs=coverage.corners.map(p=>p.x),ys=coverage.corners.map(p=>p.y),span=Math.max(Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys))*1.002;
      width=height=Math.max(512,Math.min(2048,Math.ceil(span*coverage.worldScale)));scale=width/span;
      left=(Math.min(...xs)+Math.max(...xs)-span)/2;top=(Math.min(...ys)+Math.max(...ys)-span)/2;
    }
    let z=Math.max(0,Math.min(19,Math.floor(Math.log2(scale/256)))),tiles=[];
    do{
      const count=2**z,size=scale/count;tiles=[];
      for(let x=Math.floor(left*count);x<=Math.floor((left+width/scale)*count);x++)for(let y=Math.max(0,Math.floor(top*count));y<=Math.min(count-1,Math.floor((top+height/scale)*count));y++){
        if(coverage&&!intersects([{x:x/count,y:y/count},{x:(x+1)/count,y:y/count},{x:(x+1)/count,y:(y+1)/count},{x:x/count,y:(y+1)/count}],coverage.corners))continue;
        const wrapped=((x%count)+count)%count;
        tiles.push({url:`https://tile.openstreetmap.org/${z}/${wrapped}/${y}.png`,x:(x/count-left)*scale,y:(y/count-top)*scale,size});
      }
      if(tiles.length<=40||z===0)break;z--;
    }while(true);
    if(tiles.length>40)throw new Error('MAP_TOO_LARGE');
    return {width,height,frameWidth,frameHeight,scale,left,top,tiles,key:[width,height,z,scale,left,top,tiles.map(t=>t.url).join(',')].join(':'),points:valid.map(p=>({x:(p.x-left)*scale,y:(p.y-top)*scale,segment:p.segment}))};
  }
  function cover(image,width,height){
    const iw=image.naturalWidth||image.width,ih=image.naturalHeight||image.height;
    if(!(iw>0&&ih>0))throw new Error('INVALID_IMAGE');
    const scale=Math.max(width/iw,height/ih);return {x:(width-iw*scale)/2,y:(height-ih*scale)/2,width:iw*scale,height:ih*scale};
  }
  function loadImage(url,cors=false){return new Promise((resolve,reject)=>{
    const image=new Image(),timer=setTimeout(()=>{image.onload=image.onerror=null;image.removeAttribute('src');reject(new Error('IMAGE_TIMEOUT'));},15000);
    if(cors){image.crossOrigin='anonymous';image.referrerPolicy='strict-origin-when-cross-origin';}
    image.onload=()=>{clearTimeout(timer);resolve(image);};image.onerror=()=>{clearTimeout(timer);reject(new Error('IMAGE_LOAD_FAILED'));};image.src=url;
  });}
  const cache=new Map();
  async function loadMap(plan,options={}){
    const cancelled=options.isCancelled||(()=>false),load=options.loadImage||((url)=>loadImage(url,true));
    const canvas=options.canvas||document.createElement('canvas');canvas.width=plan.width;canvas.height=plan.height;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#e8ece5';ctx.fillRect(0,0,plan.width,plan.height);let next=0,failed=false;
    async function worker(){while(!cancelled()&&!failed&&next<plan.tiles.length){const tile=plan.tiles[next++];try{
      let image=cache.get(tile.url);if(!image){image=await load(tile.url);cache.set(tile.url,image);if(cache.size>64)cache.delete(cache.keys().next().value);}
      if(cancelled())return;ctx.drawImage(image,tile.x,tile.y,tile.size+.5,tile.size+.5);
    }catch(error){failed=true;throw error;}}}
    const results=await Promise.allSettled(Array.from({length:Math.min(4,plan.tiles.length)},worker));
    if(cancelled())throw new Error('CANCELLED');
    const failure=results.find(r=>r.status==='rejected');if(failure)throw failure.reason;
    return canvas;
  }
  const api={mapPlan,cover,loadImage,loadMap};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ShareBackground=api;
})(globalThis);
