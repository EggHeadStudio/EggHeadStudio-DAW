export function parameterValue(value,{min,max,step}){
  if(!Number.isFinite(value))throw new Error('Enter a finite parameter value.');
  const clamped=Math.max(min,Math.min(max,value));
  return Number(Math.max(min,Math.min(max,min+Math.round((clamped-min)/step)*step)).toFixed(8));
}

export function draggedParameter(start,delta,spec,fine=false){
  return parameterValue(start+delta*(spec.max-spec.min)/(fine?2000:200),spec);
}

export function formatParameter(value,unit='',step=.01){
  const decimals=Math.min(4,Math.max(0,(String(step).split('.')[1]||'').length));
  return `${Number(value).toFixed(decimals)}${unit?` ${unit}`:''}`;
}

export function enhanceParameter(input,{name,unit='',reset=0,rotary=false}){
  const spec={min:Number(input.min),max:Number(input.max),step:Number(input.step)};
  const wrapper=document.createElement('span');wrapper.className=`parameter-control${rotary?' parameter-rotary':''}`;
  input.before(wrapper);
  const output=input.nextElementSibling;
  wrapper.append(input);
  if(output?.tagName==='OUTPUT')wrapper.append(output);
  const numeric=document.createElement('input');numeric.type='number';numeric.className='parameter-number';
  Object.assign(numeric,{min:input.min,max:input.max,step:input.step});
  numeric.setAttribute('aria-label',`${name}, numeric entry${unit?` (${unit})`:''}`);
  const resetButton=document.createElement('button');resetButton.type='button';resetButton.textContent='Reset';
  resetButton.setAttribute('aria-label',`Reset ${name} to ${formatParameter(reset,unit,spec.step)}`);
  const sync=()=>{
    numeric.value=input.value;
    input.setAttribute('aria-valuetext',formatParameter(input.value,unit,spec.step));
    wrapper.style.setProperty('--parameter-turn',`${-135+270*(Number(input.value)-spec.min)/(spec.max-spec.min)}deg`);
  };
  const set=value=>{input.value=String(parameterValue(value,spec));input.dispatchEvent(new Event('input',{bubbles:true}))};
  input.setAttribute('aria-label',name);
  input.title=`${name}${unit?` (${unit})`:''}. ${rotary?'Drag vertically; ':''}Shift for fine adjustment. ${rotary?'Double-click or double-tap':'Double-click'} to reset.`;
  input.addEventListener('input',sync);
  input.addEventListener('dblclick',()=>set(reset));
  input.addEventListener('keydown',event=>{
    if(event.shiftKey&&['ArrowUp','ArrowRight','ArrowDown','ArrowLeft'].includes(event.key)){
      event.preventDefault();event.stopPropagation();
      set(Number(input.value)+(['ArrowUp','ArrowRight'].includes(event.key)?1:-1)*spec.step);
    }
  });
  let drag=null,lastTap=0;
  if(rotary){
    const dial=document.createElement('span');dial.className='parameter-dial';dial.setAttribute('aria-hidden','true');wrapper.prepend(dial);
    input.addEventListener('pointerdown',event=>{
      if(event.button!==0)return;
      event.preventDefault();input.focus();input.setPointerCapture(event.pointerId);
      drag={id:event.pointerId,y:event.clientY,start:Number(input.value),moved:false};
    });
    input.addEventListener('pointermove',event=>{
      if(drag?.id!==event.pointerId)return;
      const delta=drag.y-event.clientY;
      if(Math.abs(delta)>3)drag.moved=true;
      set(draggedParameter(drag.start,delta,spec,event.shiftKey));
    });
    const finish=(event,cancelled)=>{
      if(drag?.id!==event.pointerId)return;
      if(cancelled)set(drag.start);
      else if(event.pointerType==='touch'&&!drag.moved){
        const now=performance.now();if(lastTap&&now-lastTap<350){set(reset);lastTap=0}else lastTap=now;
      }else lastTap=0;
      drag=null;if(input.hasPointerCapture(event.pointerId))input.releasePointerCapture(event.pointerId);
    };
    input.addEventListener('pointerup',event=>finish(event,false));
    input.addEventListener('pointercancel',event=>finish(event,true));
  }
  numeric.addEventListener('change',()=>{
    if(numeric.value===''||!Number.isFinite(numeric.valueAsNumber)){
      numeric.setCustomValidity('Enter a finite parameter value.');numeric.reportValidity();return;
    }
    numeric.setCustomValidity('');set(numeric.valueAsNumber);
  });
  numeric.addEventListener('input',()=>numeric.setCustomValidity(''));
  resetButton.onclick=()=>set(reset);
  wrapper.append(numeric,resetButton);sync();
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
