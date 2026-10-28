import {createEqResponse,dragEqBand,EQ_TYPES,frequencyLimit,frequencyToUnit,gainToUnit,unitToFrequency} from './eq-model.js';
import {createEqAnalyzer} from './eq-analyzer.js';
import {enhanceParameter} from './ui-controls.js';

const colors=['#d9b677','#94bfff','#9ce8d6','#f2a0a5','#c4acf4','#a2d28e','#91d9e7','#bcc4d3'];
const left=38,top=16;
const ns='http://www.w3.org/2000/svg';
function svgElement(name,attributes={}){
  const element=document.createElementNS(ns,name);
  for(const [key,value]of Object.entries(attributes))element.setAttribute(key,String(value));
  return element;
}

export function mountEqVisualizer(host,{name,getState,change,getContext,getTap,onError}){
  let width=640,height=240,right=598,bottom=206;
  host.classList.add('graphical-eq');host.setAttribute('aria-label',name);
  host.innerHTML='<div class="eq-plot"><canvas aria-hidden="true"></canvas></div><div class="eq-selection"></div><div class="eq-selected-controls"></div><div class="eq-analysis-controls"></div><output class="eq-analysis-status" role="status"></output><p class="hint">Drag frequency/gain; Shift for fine adjustment. Arrow keys edit a focused band; wheel changes Q. Spectrum is mono FFT dBFS, not loudness or the response of other effects.</p>';
  const plot=host.querySelector('.eq-plot'),canvas=host.querySelector('canvas'),svg=svgElement('svg',{viewBox:`0 0 ${width} ${height}`,'aria-label':`${name} frequency response`});
  const grid=svgElement('g',{'class':'eq-grid'}),curve=svgElement('path',{'class':'eq-curve',fill:'none'}),points=svgElement('g');
  svg.append(grid,curve,points);plot.append(svg);
  const controls=host.querySelector('.eq-selected-controls'),selection=host.querySelector('.eq-selection'),analysis=host.querySelector('.eq-analysis-controls'),status=host.querySelector('.eq-analysis-status');
  const bandSelect=document.createElement('select');bandSelect.setAttribute('aria-label',`${name} selected filter`);selection.append(bandSelect);
  const bypass=document.createElement('strong');bypass.className='eq-bypass-status';selection.append(bypass);
  controls.innerHTML='<label>Enabled <input data-eq-enabled type="checkbox"></label><label>Type <select data-eq-type></select></label><label>Frequency <input data-eq-value="frequency" type="range" min="20" max="20000" step="1"><output></output></label><label>Gain <input data-eq-value="gain" type="range" min="-24" max="24" step=".1"><output></output></label><label>Q <input data-eq-value="q" type="range" min=".1" max="18" step=".1"><output></output></label><button type="button" data-eq-reset>Reset filter</button>';
  analysis.innerHTML='<label>Analyzer <input data-eq-analyzer type="checkbox" checked></label><label>Tap <select data-eq-tap><option value="post">Post-EQ</option><option value="pre">Pre-EQ</option></select></label><label>FFT <select data-eq-fft><option>2048</option><option selected>4096</option><option>8192</option></select></label><label>Smoothing <input data-eq-smoothing type="range" min="0" max=".95" step=".05" value=".75"></label><label>Peak hold <input data-eq-hold type="checkbox"></label>';
  const inputs=Object.fromEntries([...controls.querySelectorAll('[data-eq-value]')].map(input=>[input.dataset.eqValue,input]));
  const enabled=controls.querySelector('[data-eq-enabled]'),type=controls.querySelector('[data-eq-type]'),analyzerOn=analysis.querySelector('[data-eq-analyzer]'),tapChoice=analysis.querySelector('[data-eq-tap]'),fft=analysis.querySelector('[data-eq-fft]'),smoothing=analysis.querySelector('[data-eq-smoothing]'),hold=analysis.querySelector('[data-eq-hold]');
  let selected='band-0',response=null,probeContext=null,analyzer=null,tap=null,disposed=false,raf=0,lastDraw=0,dirty=true,drag=null,visible=true,peak=null,lastStatus='',lastRate=0;
  const stats={frames:0,drawMs:0,attachments:0,detachments:0};
  const sr=()=>getContext()?.sampleRate||48000;
  const x=frequency=>left+frequencyToUnit(frequency,sr())*(right-left);
  const y=(gain,range)=>top+gainToUnit(gain,range)*(bottom-top);
  const stateBand=()=>getState().bands.find(band=>band.key===selected);
  const report=message=>{if(lastStatus!==message){status.textContent=message;lastStatus=message}};
  const detach=()=>{if(analyzer){analyzer.dispose();analyzer=null;stats.detachments++}tap=null;peak=null;delete host.dataset.spectrumPeakHz;delete host.dataset.spectrumPeakDb};
  function apply(values,persist=true){
    change(selected,values,persist);refresh();
  }
  for(const [key,input]of Object.entries(inputs)){
    input.oninput=()=>apply({[key]:Number(input.value)},false);
    input.onchange=()=>apply({[key]:Number(input.value)},true);
    enhanceParameter(input,{name:`${name} ${key}`,unit:key==='frequency'?'Hz':key==='gain'?'dB':'',reset:key==='frequency'?1000:key==='gain'?0:1,scale:key==='frequency'||key==='q'?'log':'linear',rotary:true});
  }
  enabled.onchange=()=>apply({enabled:enabled.checked});
  type.onchange=()=>apply({type:type.value});
  controls.querySelector('[data-eq-reset]').onclick=()=>apply(stateBand().defaults);
  bandSelect.onchange=()=>{selected=bandSelect.value;refresh()};
  for(const input of analysis.querySelectorAll('input,select'))input.addEventListener('change',()=>{detach();dirty=true});
  function select(key){
    selected=key;refresh();
  }
  function buildPoints(state){
    points.replaceChildren();bandSelect.replaceChildren();
    for(const [index,band]of state.bands.entries()){
      bandSelect.add(new Option(band.label,band.key));
      const point=svgElement('circle',{'data-eq-node':band.key,r:9,tabindex:0,role:'slider','aria-label':`${name} ${band.label}`,'aria-valuemin':20,'aria-valuemax':frequencyLimit(sr()),fill:colors[index%colors.length]});
      point.onfocus=()=>select(band.key);
      point.onkeydown=event=>{
        if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key))return;
        event.preventDefault();event.stopPropagation();selected=band.key;
        const current=stateBand(),fine=event.shiftKey?.1:1;
        if(event.key==='Home'||event.key==='End')apply({frequency:event.key==='Home'?current.minFrequency:Math.min(current.maxFrequency,frequencyLimit(sr()))});
        else if(event.key==='ArrowLeft'||event.key==='ArrowRight')apply({frequency:current.frequency*2**((event.key==='ArrowRight'?1:-1)*fine/12)});
        else if(current.hasGain)apply({gain:current.gain+(event.key==='ArrowUp'?1:-1)*fine*.5});
      };
      point.onpointerdown=event=>{
        if(event.button!==0)return;event.preventDefault();event.stopPropagation();selected=band.key;refresh();point.focus();point.setPointerCapture(event.pointerId);
        const current=stateBand();drag={id:event.pointerId,key:band.key,x:event.clientX,y:event.clientY,band:{...current}};
      };
      point.onpointermove=event=>{
        if(drag?.id!==event.pointerId)return;
        const rect=svg.getBoundingClientRect(),values=dragEqBand(drag.band,(event.clientX-drag.x)/rect.width*width/(right-left),(event.clientY-drag.y)/rect.height*height/(bottom-top),{sampleRate:sr(),range:getState().range,fine:event.shiftKey});
        if(!drag.band.hasGain)delete values.gain;
        apply(values,false);
      };
      const finish=(event,cancel)=>{
        if(drag?.id!==event.pointerId)return;
        const original=drag.band;drag=null;
        if(cancel)apply({frequency:original.frequency,...original.hasGain?{gain:original.gain}:{}});
        else apply({},true);
        if(point.hasPointerCapture(event.pointerId))point.releasePointerCapture(event.pointerId);
      };
      point.onpointerup=event=>finish(event,false);point.onpointercancel=event=>finish(event,true);point.onlostpointercapture=event=>finish(event,true);
      point.addEventListener('wheel',event=>{
        select(band.key);if(!stateBand().hasQ)return;
        event.preventDefault();apply({q:stateBand().q*(event.deltaY<0?1.1:1/1.1)});
      },{passive:false});
      points.append(point);
    }
  }
  function refresh(){
    if(disposed)return;
    const state=getState();if(!state.bands.some(b=>b.key===selected))selected=state.bands[0].key;
    if(points.childElementCount!==state.bands.length)buildPoints(state);
    bandSelect.value=selected;
    const selectedPoint=points.querySelector(`[data-eq-node="${selected}"]`);
    if(points.lastElementChild!==selectedPoint)points.append(selectedPoint);
    const band=stateBand();enabled.checked=band.enabled;type.replaceChildren();
    for(const value of band.hasGain?EQ_TYPES:[band.key==='lowCut'?'highpass':'lowpass'])type.add(new Option(value==='peaking'?'Bell':value,value));
    type.value=band.type;type.disabled=!band.hasGain;
    enabled.setAttribute('aria-label',`${name} ${band.label} enabled`);type.setAttribute('aria-label',`${name} ${band.label} type`);
    bypass.textContent=state.bypassed?'EQ bypassed':'EQ active';host.classList.toggle('eq-is-bypassed',state.bypassed);
    for(const [key,input]of Object.entries(inputs)){
      const spec=input.parameterControl.spec;
      if(key==='frequency'){spec.min=band.minFrequency;spec.max=Math.min(band.maxFrequency,frequencyLimit(sr()));input.min=String(spec.min);input.max=String(spec.max)}
      if(key==='gain'){spec.min=-state.range;spec.max=state.range;input.min=String(-state.range);input.max=String(state.range)}
      if(key==='q'){spec.max=state.qMax;input.max=String(state.qMax)}
      input.value=String(band[key]);input.parameterControl.setDisabled((key==='gain'&&!band.hasGain)||(key==='q'&&!band.hasQ));input.parameterControl.sync();
      const numeric=input.parameterControl.wrapper.querySelector('.parameter-number');numeric.min=input.min;numeric.max=input.max;
    }
    dirty=true;
  }
  function draw(){
    const state=getState(),rate=sr(),rect=plot.getBoundingClientRect();
    if(width!==rect.width||height!==rect.height){width=rect.width;height=rect.height;right=width-42;bottom=height-30;svg.setAttribute('viewBox',`0 0 ${width} ${height}`);dirty=true}
    if(!response||lastRate!==rate){
      response?.dispose();
      const ctx=getContext()||probeContext||(probeContext=new OfflineAudioContext(1,1,rate));
      response=createEqResponse(ctx);lastRate=rate;dirty=true;
    }
    if(dirty){
      grid.replaceChildren();
      for(const frequency of width<450?[20,100,1000,10000]:[20,50,100,200,500,1000,2000,5000,10000,20000])if(frequency<=frequencyLimit(rate)){
        grid.append(svgElement('path',{d:`M${x(frequency)} ${top}V${bottom}`}));
        const label=svgElement('text',{x:x(frequency),y:height-10,'text-anchor':'middle'});label.textContent=frequency>=1000?`${frequency/1000}k`:String(frequency);grid.append(label);
      }
      for(const db of [-state.range,-12,0,12,state.range]){
        grid.append(svgElement('path',{d:`M${left} ${y(db,state.range)}H${right}`,'class':db===0?'eq-zero-line':''}));
        const label=svgElement('text',{x:left-5,y:y(db,state.range)+4,'text-anchor':'end'});label.textContent=String(db);grid.append(label);
      }
      for(const [text,position]of [['EQ dB',left-5],['dBFS',width-3]]){
        const label=svgElement('text',{x:position,y:10,'text-anchor':'end'});label.textContent=text;grid.append(label);
      }
      for(const db of [0,-50,-100]){
        const label=svgElement('text',{x:width-3,y:top-db/100*(bottom-top)+4,'text-anchor':'end'});label.textContent=String(db);grid.append(label);
      }
      const values=response.update(state.filters,state.bypassed);
      curve.setAttribute('d',Array.from(values,(db,index)=>`${index?'L':'M'}${x(response.frequencies[index]).toFixed(2)},${y(db,state.range).toFixed(2)}`).join(' '));
      state.bands.forEach(band=>{
        const point=points.querySelector(`[data-eq-node="${band.key}"]`);point.setAttribute('cx',x(band.frequency));point.setAttribute('cy',y(band.hasGain?band.gain:0,state.range));
        point.classList.toggle('eq-node-selected',band.key===selected);point.classList.toggle('eq-node-disabled',!band.enabled);
        point.setAttribute('aria-valuenow',String(Math.round(band.frequency)));point.setAttribute('aria-valuetext',`${Math.round(band.frequency)} Hz${band.hasGain?`, ${band.gain.toFixed(1)} dB`:''}, Q ${band.q.toFixed(2)}`);
      });dirty=false;
    }
    const ctx=getContext(),source=analyzerOn.checked&&ctx?.state==='running'?getTap(tapChoice.value):null;
    if(source!==tap||analyzer?.analyser.context!==ctx){detach();if(source){analyzer=createEqAnalyzer(ctx,source,{fftSize:Number(fft.value),smoothing:Number(smoothing.value)});tap=source;stats.attachments++}}
    const dpr=Math.min(devicePixelRatio||1,3),pixelWidth=Math.round(rect.width*dpr),pixelHeight=Math.round(rect.height*dpr);
    if(canvas.width!==pixelWidth||canvas.height!==pixelHeight){canvas.width=pixelWidth;canvas.height=pixelHeight}
    const c=canvas.getContext('2d');c.setTransform(canvas.width/width,0,0,canvas.height/height,0,0);c.clearRect(0,0,width,height);
    if(!analyzer){report(!analyzerOn.checked?'Analyzer off':`No live EQ signal - start workspace playback${ctx?.state==='suspended'?' (AudioContext suspended)':''}.`);return}
    const data=analyzer.read(),resolution=rate/analyzer.analyser.fftSize;
    if(!peak||peak.length!==data.length)peak=new Float32Array(data.length).fill(-100);
    let maximum=-Infinity,peakBin=0;
    for(let i=1;i<data.length;i++){if(data[i]>maximum){maximum=data[i];peakBin=i}peak[i]=hold.checked?Math.max(peak[i]-.15,data[i]):data[i]}
    const paintSpectrum=(values,fill)=>{
      c.beginPath();c.moveTo(left,bottom);
      for(let pixel=0;pixel<=right-left;pixel++){
        const from=Math.max(1,Math.floor(unitToFrequency(pixel/(right-left),rate)/resolution)),to=Math.min(data.length-1,Math.max(from,Math.floor(unitToFrequency((pixel+1)/(right-left),rate)/resolution)));
        let value=-100;for(let bin=from;bin<=to;bin++)value=Math.max(value,values[bin]);
        c.lineTo(left+pixel,top+(1-Math.max(0,Math.min(1,(value+100)/100)))*(bottom-top));
      }
      if(fill){c.lineTo(right,bottom);c.closePath();c.fillStyle='#94bfff25';c.fill()}
      c.strokeStyle=fill?'#94bfff88':'#f2d18a88';c.lineWidth=1;c.stroke();
    };
    paintSpectrum(data,true);if(hold.checked)paintSpectrum(peak,false);
    report(`${tapChoice.value==='pre'?'Pre':'Post'}-EQ mono FFT | ${resolution.toFixed(2)} Hz/bin | -100 to 0 dBFS${maximum>-100?` | peak ${(peakBin*resolution).toFixed(0)} Hz / ${maximum.toFixed(1)} dBFS`:' | silent'}`);
    host.dataset.spectrumPeakHz=String(peakBin*resolution);host.dataset.spectrumPeakDb=String(maximum);
  }
  const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(!visible)detach()});observer.observe(host);
  const resized=new ResizeObserver(()=>{dirty=true});resized.observe(host);
  const visibility=()=>{if(document.hidden)detach()};document.addEventListener('visibilitychange',visibility);
  function tick(time){
    if(disposed)return;
    if(!host.isConnected){dispose();return}
    if(!document.hidden&&visible&&host.getClientRects().length&&time-lastDraw>=1000/30){
      lastDraw=time;const start=performance.now();
      try{draw()}catch(error){dispose();onError(error);return}
      stats.frames++;stats.drawMs+=performance.now()-start;
    }
    raf=requestAnimationFrame(tick);
  }
  function dispose(){
    if(disposed)return;disposed=true;cancelAnimationFrame(raf);observer.disconnect();resized.disconnect();document.removeEventListener('visibilitychange',visibility);detach();response?.dispose();response=null;probeContext=null;
  }
  refresh();raf=requestAnimationFrame(tick);
  const api={refresh,dispose,stats,get disposed(){return disposed},get analyzer(){return analyzer}};
  host.eqVisualizer=api;
  return api;
}
