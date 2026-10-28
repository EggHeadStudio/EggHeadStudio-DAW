export function parameterValue(value,{min,max,step}){
  if(!Number.isFinite(value))throw new Error('Enter a finite parameter value.');
  const clamped=Math.max(min,Math.min(max,value));
  return Number(Math.max(min,Math.min(max,min+Math.round((clamped-min)/step)*step)).toFixed(8));
}

export function draggedParameter(start,delta,spec,fine=false){
  return parameterFromUnit(parameterToUnit(start,spec)+delta/(fine?2000:200),spec);
}

export function parameterToUnit(value,spec){
  if(spec.scale==='log'){
    if(spec.min<=0||spec.max<=spec.min)throw new RangeError('Logarithmic controls require positive increasing limits.');
    return Math.max(0,Math.min(1,Math.log(value/spec.min)/Math.log(spec.max/spec.min)));
  }
  return Math.max(0,Math.min(1,(value-spec.min)/(spec.max-spec.min)));
}

export function parameterFromUnit(position,spec){
  if(!Number.isFinite(position))throw new Error('Enter a finite parameter position.');
  const fraction=Math.max(0,Math.min(1,position));
  if(spec.scale==='log'&&(spec.min<=0||spec.max<=spec.min))throw new RangeError('Logarithmic controls require positive increasing limits.');
  return parameterValue(spec.scale==='log'?spec.min*(spec.max/spec.min)**fraction:spec.min+fraction*(spec.max-spec.min),spec);
}

export function formatParameter(value,unit='',step=.01,format='number'){
  if(format==='percent')return `${Number((Number(value)*100).toFixed(1))}%`;
  if(format==='ratio')return `${Number(Number(value).toFixed(2))}:1`;
  if(format==='pan')return Number(value)===0?'C':`${Math.round(Math.abs(Number(value))*100)}% ${Number(value)<0?'L':'R'}`;
  const decimals=Math.min(4,Math.max(0,(String(step).split('.')[1]||'').length));
  return `${Number(value).toFixed(decimals)}${unit?` ${unit}`:''}`;
}

export function enhanceParameter(input,{name,unit='',reset=0,rotary=false,scale='linear',format='number',vertical=false}){
  if(input.parameterControl)return input.parameterControl;
  const spec={min:Number(input.min),max:Number(input.max),step:Number(input.step),scale};
  if(!Number.isFinite(spec.min)||!Number.isFinite(spec.max)||spec.min>=spec.max||!Number.isFinite(spec.step)||spec.step<=0)throw new RangeError('Parameter limits and step must be finite and increasing.');
  parameterToUnit(reset,spec);
  const wrapper=document.createElement('span');wrapper.className=`parameter-control${rotary?' parameter-rotary':' parameter-slider'}${vertical?' parameter-vertical':''}`;
  input.before(wrapper);
  let output=input.nextElementSibling;
  if(output?.tagName!=='OUTPUT')output=document.createElement('output');
  wrapper.append(input);
  wrapper.append(output);
  const numeric=document.createElement('input');numeric.type='number';numeric.className='parameter-number';
  Object.assign(numeric,{min:input.min,max:input.max,step:input.step});
  numeric.setAttribute('aria-label',`${name}, numeric entry${unit?` (${unit})`:''}`);
  const resetButton=document.createElement('button');resetButton.type='button';resetButton.textContent='Reset';
  resetButton.setAttribute('aria-label',`Reset ${name} to ${formatParameter(reset,unit,spec.step)}`);
  const sync=()=>{
    const position=parameterToUnit(Number(input.value),spec),text=formatParameter(input.value,unit,spec.step,format);
    numeric.value=input.value;
    numeric.setCustomValidity('');output.value=text;
    input.setAttribute('aria-valuetext',text);
    wrapper.style.setProperty('--parameter-turn',`${-135+270*position}deg`);
    wrapper.style.setProperty('--parameter-fill',`${position*100}%`);
    wrapper.querySelector('.dial-value')?.setAttribute('stroke-dasharray',`${position*100} 100`);
    numeric.disabled=input.disabled;resetButton.disabled=input.disabled;
    wrapper.classList.toggle('parameter-disabled',input.disabled);
  };
  const set=value=>{if(input.disabled)return;input.value=String(parameterValue(value,spec));input.dispatchEvent(new Event('input',{bubbles:true}))};
  input.setAttribute('aria-label',name);
  input.dataset.parameterName=name;
  input.title=`${name}${unit?` (${unit})`:''}. Range ${spec.min} to ${spec.max}; default ${reset}. ${rotary||vertical?'Drag vertically. ':''}Shift for fine adjustment. Double-click or double-tap to reset; Reset also available.`;
  if(vertical)input.setAttribute('aria-orientation','vertical');
  input.addEventListener('input',sync);
  input.addEventListener('change',sync);
  input.addEventListener('dblclick',()=>set(reset));
  input.addEventListener('keydown',event=>{
    if(['ArrowUp','ArrowRight','ArrowDown','ArrowLeft','Home','End','PageUp','PageDown'].includes(event.key)){
      event.preventDefault();event.stopPropagation();
      if(event.key==='Home')set(spec.min);
      else if(event.key==='End')set(spec.max);
      else{
        const direction=['ArrowUp','ArrowRight','PageUp'].includes(event.key)?1:-1;
        const fine=event.shiftKey,multiplier=event.key.startsWith('Page')?10:1;
        if(scale==='log'&&!fine){
          const current=Number(input.value),mapped=parameterFromUnit(parameterToUnit(current,spec)+direction*.01*multiplier,spec);
          set(mapped===current?current+direction*spec.step:mapped);
        }
        else set(Number(input.value)+direction*spec.step*(fine?1:multiplier));
      }
    }
  });
  let drag=null,lastTap=0;
  if(rotary){
    const dial=document.createElement('span');dial.className='parameter-dial';dial.setAttribute('aria-hidden','true');
    dial.innerHTML='<svg viewBox="0 0 64 64"><path class="dial-track" pathLength="100" d="M 14.32 49.68 A 25 25 0 1 1 49.68 49.68"/><path class="dial-value" pathLength="100" d="M 14.32 49.68 A 25 25 0 1 1 49.68 49.68"/><circle cx="32" cy="32" r="18"/><g class="dial-pointer"><path d="M32 17V25"/></g></svg>';
    wrapper.prepend(dial);
  }
  input.addEventListener('pointerdown',event=>{
    if(event.button!==0||input.disabled||drag)return;
    event.preventDefault();event.stopPropagation();input.focus();input.setPointerCapture(event.pointerId);
    const rect=input.getBoundingClientRect(),at=vertical?event.clientY:event.clientX,length=vertical?rect.height:rect.width;
    drag={id:event.pointerId,x:event.clientX,y:event.clientY,start:Number(input.value),position:parameterToUnit(Number(input.value),spec),last:rotary?event.clientY:at,length:Math.max(1,length-20),moved:false};
    if(!rotary&&!event.shiftKey){
      const position=vertical?(rect.bottom-event.clientY-10)/drag.length:(event.clientX-rect.left-10)/drag.length;
      set(parameterFromUnit(position,spec));drag.position=parameterToUnit(Number(input.value),spec);
    }
  });
  input.addEventListener('pointermove',event=>{
    if(drag?.id!==event.pointerId)return;
    const at=rotary||vertical?event.clientY:event.clientX,delta=(at-drag.last)*(rotary||vertical?-1:1);
    if(Math.hypot(event.clientX-drag.x,event.clientY-drag.y)>3)drag.moved=true;
    drag.position=Math.max(0,Math.min(1,drag.position+delta/(rotary?200:drag.length)/(event.shiftKey?10:1)));
    drag.last=at;set(parameterFromUnit(drag.position,spec));
  });
  const finish=(event,cancelled)=>{
    if(drag?.id!==event.pointerId)return;
    if(cancelled)set(drag.start);
    else if(event.pointerType==='touch'&&!drag.moved){
      const now=performance.now();if(lastTap&&now-lastTap<350){set(reset);lastTap=0}else lastTap=now;
    }else lastTap=0;
    drag=null;if(input.hasPointerCapture(event.pointerId))input.releasePointerCapture(event.pointerId);
    if(!cancelled)input.dispatchEvent(new Event('change',{bubbles:true}));
  };
  input.addEventListener('pointerup',event=>finish(event,false));
  input.addEventListener('pointercancel',event=>finish(event,true));
  input.addEventListener('lostpointercapture',event=>{if(drag?.id===event.pointerId)finish(event,true)});
  numeric.addEventListener('change',()=>{
    if(numeric.value===''||!Number.isFinite(numeric.valueAsNumber)){
      numeric.setCustomValidity('Enter a finite parameter value.');numeric.reportValidity();return;
    }
    numeric.setCustomValidity('');set(numeric.valueAsNumber);
  });
  numeric.addEventListener('input',()=>numeric.setCustomValidity(''));
  resetButton.onclick=()=>set(reset);
  wrapper.append(numeric,resetButton);sync();
  input.parameterControl={sync,set,wrapper,spec,setDisabled:disabled=>{input.disabled=disabled;sync()}};
  return input.parameterControl;
}

let tooltipId=0;
export function describeControl(element,text){
  if(element.dataset.tooltipReady)return;
  element.dataset.tooltipReady='true';element.title=text;
  const tip=document.createElement('span');tip.id=`ui-tip-${++tooltipId}`;tip.role='tooltip';tip.className='ui-tooltip';tip.textContent=text;tip.hidden=true;
  element.setAttribute('aria-describedby',`${element.getAttribute('aria-describedby')||''} ${tip.id}`.trim());
  element.after(tip);
  const show=()=>{tip.hidden=false;const rect=element.getBoundingClientRect();tip.style.left=`${Math.max(8,Math.min(innerWidth-280,rect.left))}px`;tip.style.top=`${Math.max(8,Math.min(innerHeight-80,rect.bottom+6))}px`};
  const hide=()=>tip.hidden=true;
  element.addEventListener('focus',show);element.addEventListener('blur',hide);
  element.addEventListener('pointerenter',show);element.addEventListener('pointerleave',hide);
  element.addEventListener('click',hide);element.addEventListener('keydown',event=>{if(event.key==='Escape')hide()});
}
