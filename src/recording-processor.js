class RecordingProcessor extends AudioWorkletProcessor{
  constructor(){
    super();this.active=false;this.buffer=new Float32Array(4096);this.used=0;this.frames=0;
    this.port.onmessage=({data})=>{
      if(data.type==='start'){this.start=data.startFrame;this.limit=data.maxFrames;this.end=Number.isFinite(data.endFrame)?data.endFrame:Infinity;this.active=true}
      if(data.type==='stop')this.end=Math.min(this.end,data.stopFrame);
      if(data.type==='cancel'){this.active=false;this.used=0;this.port.postMessage({type:'cancelled'})}
    };
  }
  flush(){
    if(!this.used)return;
    const data=this.buffer.slice(0,this.used);this.port.postMessage({type:'pcm',data},[data.buffer]);this.used=0;
  }
  process(inputs){
    if(!this.active)return true;
    const channels=inputs[0],length=channels[0]?.length||128;
    for(let i=0;i<length;i++){
      const frame=currentFrame+i;
      if(frame<this.start)continue;
      if(frame>=this.end||this.frames>=this.limit){
        this.flush();this.active=false;this.port.postMessage({type:'finished',frames:this.frames,limited:this.frames>=this.limit});break;
      }
      let sample=0;for(const channel of channels)sample+=channel[i]||0;
      this.buffer[this.used++]=channels.length?sample/channels.length:0;this.frames++;
      if(this.used===this.buffer.length)this.flush();
    }
    return true;
  }
}
registerProcessor('ehs-recording-capture',RecordingProcessor);
