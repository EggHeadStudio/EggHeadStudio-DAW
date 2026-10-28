export function isTransportSpace(event){
  return !event.defaultPrevented&&!event.repeat&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&
    (event.code==='Space'||event.key===' ')&&
    !event.target?.closest?.('input,textarea,select,button,summary,a,dialog,[contenteditable]:not([contenteditable="false"]),[role="slider"],[role="button"],[role="textbox"]');
}

export function mountTransportShortcuts(target,{toggle,blocked,onBlocked,onError}){
  let pending=false;
  const listener=async event=>{
    if(!isTransportSpace(event))return;
    event.preventDefault();
    if(blocked()){onBlocked();return}
    if(pending)return;
    pending=true;
    try{await toggle()}catch(error){onError(error)}finally{pending=false}
  };
  target.addEventListener('keydown',listener);
  return()=>target.removeEventListener('keydown',listener);
}
