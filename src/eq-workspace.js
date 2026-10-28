import {mountEqVisualizer} from './eq-visualizer.js';
import {masterEqFilters,trackEqFilters} from './eq-model.js';
import {TRACK_EFFECT_DEFAULTS} from './audio.js';
import {DEFAULT_MASTERING_SETTINGS} from './mastering.js';

function editorState(eq,filters,defaults,{master=false,bypassed=false}={}){
  return{filters,bypassed,range:master?18:24,qMax:master?12:18,bands:filters.map(filter=>{
    const index=Number(filter.key.split('-')[1]),cut=!filter.key.startsWith('band-'),source=cut?null:eq.bands?.[index];
    return{...filter,label:cut?filter.key==='lowCut'?'Low cut':'High cut':`Band ${index+1}`,
      frequency:cut?eq[filter.key]??filter.frequency:source?.frequency??filter.frequency,
      gain:source?.gain??filter.gain,type:cut?filter.key==='lowCut'?'highpass':'lowpass':source?.type??filter.type,enabled:cut?eq[`${filter.key}Enabled`]!==false:source?.enabled!==false,
      hasGain:!cut,hasQ:!cut&&(source?.type??filter.type)==='peaking',minFrequency:master&&filter.key==='lowCut'?10:master&&filter.key==='highCut'?1000:20,
      maxFrequency:master&&filter.key==='lowCut'?1000:master&&filter.key==='highCut'?22000:20000,
      defaults:cut?{frequency:defaults[filter.key],enabled:true}:{...defaults.bands[index],type:defaults.bands[index].type||'peaking',enabled:true}};
  })};
}
function updateEq(eq,key,values){
  if(key.startsWith('band-')){
    eq.bands??=trackEqFilters(eq).slice(1,-1).map(({frequency,gain,q})=>({frequency,gain,q}));
    Object.assign(eq.bands[Number(key.split('-')[1])],values);
  }else{
    if(values.frequency!==undefined)eq[key]=values.frequency;
    if(values.enabled!==undefined)eq[`${key}Enabled`]=values.enabled;
  }
}

export function mountTrackEqs(root,track,engine,commit,onError,beforeChange=()=>{}){
  const editors=[];
  for(const [index,effect]of (track?.fx?.effects||[]).entries()){
    if(effect.type!=='eq')continue;
    const article=[...root.querySelectorAll('.effect-device')][index],body=article.querySelector('.device-body')||article;
    for(const element of [...body.children])if(!element.matches('header'))element.remove();
    const host=document.createElement('section');body.append(host);
    const editor=mountEqVisualizer(host,{name:`${track.name} EQ`,getContext:()=>engine.ctx,
      getState:()=>editorState(effect.params,trackEqFilters(effect.params,engine.ctx?.sampleRate||48000),TRACK_EFFECT_DEFAULTS.eq,{bypassed:!effect.enabled}),
      change:(key,values,persist)=>{
        beforeChange();
        const bands=editorState(effect.params,trackEqFilters(effect.params),TRACK_EFFECT_DEFAULTS.eq).bands,band=bands.find(band=>band.key===key);
        const next={...values};
        if(next.frequency!==undefined)next.frequency=Math.round(Math.max(band.minFrequency,Math.min(band.maxFrequency,(engine.ctx?.sampleRate||48000)/2*.999,next.frequency)));
        if(next.gain!==undefined)next.gain=Math.max(-24,Math.min(24,next.gain));
        if(next.q!==undefined)next.q=Math.max(.1,Math.min(18,next.q));
        updateEq(effect.params,key,next);commit(persist);
      },getTap:position=>engine.trackNodes.get(track.id)?.eqTaps.get(effect.id)?.[position],onError});
    editors.push(editor);
  }
  return editors;
}

export function mountMasterEq(root,engine,getSettings,mutate,onError,getGraph=()=>engine.masteringGraph){
  const old=root.querySelector('#masterEqGraph'),module=old.closest('.master-module'),host=document.createElement('section');
  old.replaceWith(host);module.querySelector('.master-filter-controls').remove();module.querySelector('.master-band-grid').remove();
  return mountEqVisualizer(host,{name:'Master EQ',getContext:()=>engine.ctx,
    getState:()=>{const settings=getSettings();return editorState(settings.eq,masterEqFilters(settings,engine.ctx?.sampleRate||48000),DEFAULT_MASTERING_SETTINGS.eq,{master:true,bypassed:!settings.eq.enabled||settings.chainBypass})},
    change:(key,values,persist)=>mutate(settings=>updateEq(settings.eq,key,values),persist),
    getTap:position=>getGraph()?.eqTaps[position],onError});
}
