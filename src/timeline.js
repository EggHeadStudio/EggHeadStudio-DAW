export class TimelineScale {
  constructor(bpm=120,pixelsPerBeat=39){
    if(!Number.isFinite(bpm)||bpm<=0||!Number.isFinite(pixelsPerBeat)||pixelsPerBeat<=0)throw new RangeError('Timeline scale requires positive BPM and pixel density.');
    this.bpm=bpm;
    this.pixelsPerBeat=pixelsPerBeat;
  }
  beatsToPixels(beats){return beats*this.pixelsPerBeat}
  pixelsToBeats(pixels){return pixels/this.pixelsPerBeat}
  timeToPixels(seconds){return this.beatsToPixels(seconds*this.bpm/60)}
  pixelsToTime(pixels){return this.pixelsToBeats(pixels)*60/this.bpm}
  barsToPixels(bars){return this.beatsToPixels(bars*4)}
  pixelsToBars(pixels){return this.pixelsToBeats(pixels)/4}
  secondsToBeats(seconds){return seconds*this.bpm/60}
  beatsToSeconds(beats){return beats*60/this.bpm}
}

export function timelinePixelsAtClientX(clientX,ruler,scrollContainer){
  if(!ruler||!scrollContainer)return 0;
  return clientX-ruler.getBoundingClientRect().left;
}

export function timelineBeatsAtClientX(clientX,ruler,scrollContainer,scale){
  return scale.pixelsToBeats(timelinePixelsAtClientX(clientX,ruler,scrollContainer));
}

export function pianoBeatAtClientX(clientX,laneLeft,pixelsPerBeat){
  return Math.max(0,(clientX-laneLeft)/pixelsPerBeat);
}

export function formatTransportTime(seconds){
  const milliseconds=Math.floor(Math.max(0,Number.isFinite(seconds)?seconds:0)*1000);
  return`${String(Math.floor(milliseconds/60000)).padStart(2,'0')}:${String(Math.floor(milliseconds/1000)%60).padStart(2,'0')}.${String(milliseconds%1000).padStart(3,'0')}`;
}

export function timelineContentOrigin(ruler,scrollContainer){
  if(!ruler||!scrollContainer)return 0;
  return ruler.getBoundingClientRect().left-scrollContainer.getBoundingClientRect().left+scrollContainer.scrollLeft;
}

export function quantizeBeat(beat,grid=0){return Math.max(0,grid>0?Math.round(beat/grid)*grid:beat)}

export function draggedClipStart(pointerBeat,grabOffsetBeat,grid=0){
  return quantizeBeat(pointerBeat-grabOffsetBeat,grid);
}

export function playheadBeatAtSeconds(seconds,bpm,grid=0){
  if(!Number.isFinite(seconds)||seconds<0||!Number.isFinite(bpm)||bpm<=0)throw new RangeError('Playhead position and tempo must be valid.');
  return quantizeBeat(seconds*bpm/60,grid);
}

export function pinchZoomValue(startZoom,startDistance,distance,minZoom=.4,maxZoom=4){
  if(![startZoom,startDistance,distance,minZoom,maxZoom].every(Number.isFinite)||startZoom<=0||startDistance<=0||distance<0||minZoom<=0||maxZoom<minZoom)throw new RangeError('Pinch zoom values must be finite and positive.');
  return Math.max(minZoom,Math.min(maxZoom,startZoom*distance/startDistance));
}

export function anchoredTimelineScrollLeft(anchorBeat,anchorClientX,rulerContentLeft,pixelsPerBeat){
  if(![anchorBeat,anchorClientX,rulerContentLeft,pixelsPerBeat].every(Number.isFinite)||anchorBeat<0||pixelsPerBeat<=0)throw new RangeError('Timeline anchor coordinates must be finite.');
  return Math.max(0,anchorBeat*pixelsPerBeat+rulerContentLeft-anchorClientX);
}

export function clipViewportWindow(clipLeft,clipWidth,viewportLeft,viewportRight){
  const offset=Math.max(0,viewportLeft-clipLeft),end=Math.min(clipWidth,viewportRight-clipLeft);
  return clipWidth>0&&end>offset?{offset,width:end-offset,start:offset/clipWidth,end:end/clipWidth}:null;
}

export function editLoopRegion(loop,edge,beat,grid=0){
  const next=quantizeBeat(beat,grid),minimum=grid||1/960;
  if(edge==='start')return{start:Math.max(0,Math.min(next,loop.end-minimum)),end:loop.end};
  if(edge==='end')return{start:loop.start,end:Math.max(loop.start+minimum,next)};
  const start=next;
  return{start,end:start+loop.end-loop.start};
}
