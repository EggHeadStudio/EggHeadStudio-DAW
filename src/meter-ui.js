function visible(element){
  if(document.visibilityState==='hidden')return false;
  const displayed=typeof element.checkVisibility==='function'?element.checkVisibility({checkVisibilityCSS:true}):element.getClientRects().length>0&&getComputedStyle(element).visibility!=='hidden';
  if(!displayed)return false;
  const rect=element.getBoundingClientRect();
  return rect.bottom>=0&&rect.top<=innerHeight&&rect.right>=0&&rect.left<=innerWidth;
}

export function updateTrackMeters(root,meters){
  for(const meter of root.querySelectorAll('[data-meter]')){
    if(!visible(meter))continue;
    const levels=meters[meter.dataset.meter];if(!levels)continue;
    meter.querySelector('[data-meter-left]').style.width=`${Math.min(100,levels.leftPeak*100)}%`;
    meter.querySelector('[data-meter-right]').style.width=`${Math.min(100,levels.rightPeak*100)}%`;
    meter.querySelector('[data-clip-warning]').hidden=!levels.clipped;
    meter.classList.toggle('clipped',levels.clipped);
    meter.setAttribute('aria-label',`${meter.dataset.trackName} stereo peak ${Math.round(Math.max(levels.leftPeak,levels.rightPeak)*100)} percent${levels.clipped?', clipping detected':''}`);
    const peak=meter.querySelector('.meter-peak');
    if(peak)peak.value=Math.max(levels.leftPeak,levels.rightPeak)>0?`${(20*Math.log10(Math.max(levels.leftPeak,levels.rightPeak))).toFixed(1)} dBFS`:'-inf dBFS';
  }
  for(const meter of root.querySelectorAll('[data-compressor-meter]')){
    if(!visible(meter))continue;
    const reduction=meters[meter.dataset.meterTrack]?.reductions?.[meter.dataset.compressorMeter]??0;
    meter.value=`${reduction.toFixed(1)} dB`;
    meter.style.setProperty('--reduction',`${Math.min(100,Math.abs(reduction)/60*100)}%`);
  }
}
