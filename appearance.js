(function(root){
  'use strict';
  const key='fit-viewer-appearance',valid=value=>['system','light','dark'].includes(value);
  let preference='system',media=null;
  try{const saved=root.localStorage.getItem(key);if(valid(saved))preference=saved;}catch{}
  try{const requested=new URL(root.location.href).searchParams.get('appearance');if(valid(requested))preference=requested;}catch{}
  try{media=root.matchMedia('(prefers-color-scheme: dark)');}catch{}
  function apply(){
    const effective=preference==='system'?(media?.matches?'dark':'light'):preference;
    root.document?.documentElement?.setAttribute('data-theme',effective);
    root.document?.documentElement?.setAttribute('data-appearance',preference);
    const control=root.document?.getElementById('appearance');if(control)control.value=preference;
    return effective;
  }
  function set(next,persist=true){
    if(!valid(next))throw new RangeError('Unsupported appearance');preference=next;
    if(persist){try{root.localStorage.setItem(key,next);}catch{}}
    try{const url=new URL(root.location.href);url.searchParams.set('appearance',next);root.history.replaceState(null,'',url.href);}catch{}
    return apply();
  }
  function bind(){
    const control=root.document?.getElementById('appearance');let pointerSelection=false;
    control?.addEventListener('pointerdown',()=>{pointerSelection=true;});
    control?.addEventListener('keydown',()=>{pointerSelection=false;});
    control?.addEventListener('blur',()=>{pointerSelection=false;});
    control?.addEventListener('change',event=>{set(event.target.value);if(pointerSelection)control.blur();});
    apply();
  }
  apply();
  if(root.document?.readyState==='loading')root.document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
  if(media?.addEventListener)media.addEventListener('change',()=>{if(preference==='system')apply();});else media?.addListener?.(()=>{if(preference==='system')apply();});
  root.addEventListener?.('storage',event=>{if(event.key===key)set(valid(event.newValue)?event.newValue:'system',false);});
  const api={set,apply,get preference(){return preference;},get effective(){return preference==='system'?(media?.matches?'dark':'light'):preference;}};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.Appearance=api;
})(globalThis);
