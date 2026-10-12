(function(root){
  'use strict';
  const l10n=(s,...values)=>{const t=v=>typeof I18n==='undefined'?v:I18n.t(v);return Array.isArray(s)?s.reduce((out,part,i)=>out+t(part)+(i<values.length?values[i]:''),''):t(s);};
  function nearestIndex(records,time){
    if(!records.length)return -1;
    let low=0,high=records.length;
    while(low<high){const mid=(low+high)>>>1;if(records[mid].chartTimestamp<time)low=mid+1;else high=mid;}
    if(low===0)return 0;if(low===records.length)return low-1;
    return time-records[low-1].chartTimestamp<=records[low].chartTimestamp-time?low-1:low;
  }
  function attach(svg,config){
    const {records,key,label,unit,factor,x,y,start,span,width,height,left,right,top,bottom,formatTime,formatValue,formatDate}=config;
    const ns='http://www.w3.org/2000/svg';
    const make=(tag,attrs={},parent)=>{const node=document.createElementNS(ns,tag);for(const [k,v]of Object.entries(attrs))node.setAttribute(k,String(v));if(parent)parent.append(node);return node;};
    const layer=make('g',{'class':'chart-hover','display':'none','pointer-events':'none'},svg);
    const vertical=make('line',{'class':'hover-guide'},layer),horizontal=make('line',{'class':'hover-guide'},layer);
    const dot=make('circle',{r:4.5,'class':'hover-point'},layer);
    const timeBox=make('rect',{width:100,height:24,rx:5,'class':'hover-axis-box'},layer);
    const timeText=make('text',{'text-anchor':'middle','class':'hover-axis-text'},layer);
    const valueBox=make('rect',{x:0,width:left-5,height:24,rx:5,'class':'hover-axis-box'},layer);
    const valueText=make('text',{x:left-11,'text-anchor':'end','class':'hover-axis-text'},layer);
    const tooltip=make('g',{},layer),box=make('rect',{width:270,height:86,rx:9,'class':'hover-tooltip-box'},tooltip);
    const title=make('text',{x:14,y:23,'class':'hover-tooltip-title'},tooltip);
    const detail=make('text',{x:14,y:46,'class':'hover-tooltip-text'},tooltip);
    const clock=make('text',{x:14,y:68,'class':'hover-tooltip-text'},tooltip);
    let selected=-1;
    function hide(){layer.setAttribute('display','none');}
    function show(index){
      if(index<0||index>=records.length)return;
      selected=index;const r=records[index],cx=x(r.chartTimestamp),valid=Number.isFinite(r[key]),value=valid?r[key]*factor:null,cy=valid?y(value):top+20;
      layer.removeAttribute('display');
      for(const [attr,v]of Object.entries({x1:cx,x2:cx,y1:top,y2:height-bottom}))vertical.setAttribute(attr,v);
      for(const node of [horizontal,dot,valueBox,valueText])node.setAttribute('display',valid?'inline':'none');
      if(valid){
        for(const [attr,v]of Object.entries({x1:left,x2:cx,y1:cy,y2:cy}))horizontal.setAttribute(attr,v);
        dot.setAttribute('cx',cx);dot.setAttribute('cy',cy);
        valueBox.setAttribute('y',cy-12);valueText.setAttribute('y',cy+4);valueText.textContent=formatValue(value);
      }
      const axisX=Math.max(50,Math.min(width-50,cx));timeBox.setAttribute('x',axisX-50);timeBox.setAttribute('y',height-bottom+6);
      timeText.setAttribute('x',axisX);timeText.setAttribute('y',height-bottom+22);timeText.textContent=formatTime((r.chartTimestamp-start)/1000);
      const tx=Math.max(left+8,Math.min(width-right-278,cx+16));
      const ty=Math.max(top+4,Math.min(height-bottom-90,cy-98));tooltip.setAttribute('transform',l10n`translate(${tx},${ty})`);
      title.textContent=label+' · '+(valid?formatValue(value)+' '+unit:l10n('此记录缺少数据'));
      detail.textContent=l10n('横轴时间 ')+formatTime((r.chartTimestamp-start)/1000);
      clock.textContent=l10n('记录时间 ')+formatDate(r.timestamp);
      svg.setAttribute('aria-label',l10n`${label}曲线，${detail.textContent}，${title.textContent}，${clock.textContent}`);
    }
    function pointer(event){
      const matrix=svg.getScreenCTM();if(!matrix)return;
      const point=svg.createSVGPoint();point.x=event.clientX;point.y=event.clientY;
      const local=point.matrixTransform(matrix.inverse());
      if(local.x<left||local.x>width-right||local.y<top||local.y>height-bottom){hide();return;}
      const time=start+(local.x-left)/(width-left-right)*span;
      show(nearestIndex(records,time));
    }
    svg.addEventListener('pointermove',pointer);svg.addEventListener('pointerdown',pointer);
    svg.addEventListener('pointerleave',hide);svg.addEventListener('pointercancel',hide);
    svg.setAttribute('tabindex','0');svg.setAttribute('role','group');
    svg.addEventListener('focus',()=>show(0));svg.addEventListener('blur',hide);
    svg.addEventListener('keydown',event=>{
      if(event.key==='Escape'){hide();return;}
      const actions={ArrowLeft:Math.max(0,selected-1),ArrowRight:Math.min(records.length-1,selected+1),Home:0,End:records.length-1};
      if(Object.prototype.hasOwnProperty.call(actions,event.key)){event.preventDefault();show(actions[event.key]);}
    });
    return {show,hide};
  }
  const api={nearestIndex,attach};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ChartHover=api;
})(globalThis);
