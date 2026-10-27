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
}

export function timelinePixelsAtClientX(clientX,ruler,scrollContainer){
  if(!ruler||!scrollContainer)return 0;
  return clientX-ruler.getBoundingClientRect().left;
}

export function timelineBeatsAtClientX(clientX,ruler,scrollContainer,scale){
  return scale.pixelsToBeats(timelinePixelsAtClientX(clientX,ruler,scrollContainer));
}

export function timelineContentOrigin(ruler,scrollContainer){
  if(!ruler||!scrollContainer)return 0;
  return ruler.getBoundingClientRect().left-scrollContainer.getBoundingClientRect().left+scrollContainer.scrollLeft;
}
