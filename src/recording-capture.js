export function describeCaptureError(error){
  const messages={NotAllowedError:'Microphone permission was denied. Allow microphone access for this site in the browser settings and try again.',SecurityError:'Microphone access is blocked on this page (HTTPS or localhost is required).',NotFoundError:'No microphone was found. Connect an input device and try again.',NotReadableError:'The microphone is in use by another application or cannot be opened.',OverconstrainedError:'The microphone does not support the requested capture settings.',AbortError:'Microphone access was interrupted before it started.'};
  return messages[error?.name]||error?.message||'Unknown recording error.';
}

export class RecordingCapture{
  constructor(context,{onInterrupted=()=>{},onLimit=()=>{},onFinished=()=>{}}={}){
    this.context=context;this.onInterrupted=onInterrupted;this.onLimit=onLimit;this.onFinished=onFinished;this.state='idle';this.chunks=[];this.frames=0;this.token=0;this.deviceId='';
  }
  async prepare(){
    if(this.state!=='idle')throw new Error('A recording is already active.');
    if(!this.context.audioWorklet||typeof AudioWorkletNode!=='function')throw new Error('Recording Studio requires AudioWorklet PCM capture. Use Sample Studio recording on an unsupported browser.');
    this.state='requesting';const token=++this.token;
    try{
      await this.context.audioWorklet.addModule(new URL('./recording-processor.js',import.meta.url));
      if(token!==this.token)return false;
      const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false,channelCount:1}});
      if(token!==this.token){stream.getTracks().forEach(track=>track.stop());return false}
      this.stream=stream;this.deviceId=stream.getAudioTracks()[0]?.getSettings?.().deviceId||'';this.source=this.context.createMediaStreamSource(stream);this.analyser=this.context.createAnalyser();this.analyser.fftSize=1024;
      this.node=new AudioWorkletNode(this.context,'ehs-recording-capture',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[1]});
      this.silent=this.context.createGain();this.silent.gain.value=0;
      this.monitor=this.context.createGain();this.monitor.gain.value=0;
      this.source.connect(this.analyser);this.source.connect(this.node).connect(this.silent).connect(this.context.destination);
      this.source.connect(this.monitor).connect(this.context.destination);
      this.node.port.onmessage=({data})=>{
        if(data.type==='pcm'){this.chunks.push(data.data);this.frames+=data.data.length}
        if(data.type==='finished'){
          const wasStopping=!!this.resolveStop;this.state='complete';this.release();this.finishedResult={chunks:this.chunks,frames:this.frames,sampleRate:this.context.sampleRate,limited:data.limited};
          this.resolveStop?.(this.finishedResult);this.waiters?.splice(0).forEach(resolve=>resolve(this.finishedResult));
          if(data.limited)this.onLimit();else if(!wasStopping)this.onFinished(this.finishedResult);
        }
      };
      this.node.onprocessorerror=()=>this.onInterrupted('PCM capture processor failed; buffered audio will be recovered.');
      for(const track of stream.getAudioTracks())track.onended=()=>this.onInterrupted('Microphone disconnected; saving the available take.');
      this.state='ready';return true;
    }catch(error){this.release();this.state='idle';throw error}
  }
  begin(startFrame,endFrame=null,maxFrames=this.context.sampleRate*300){
    if(this.state!=='ready')throw new Error('Microphone is not ready.');
    this.state='recording';this.node.port.postMessage({type:'start',startFrame,endFrame,maxFrames});
  }
  whenFinished(timeoutMs){
    if(this.finishedResult)return Promise.resolve(this.finishedResult);
    return new Promise(resolve=>{(this.waiters ||= []).push(resolve);setTimeout(()=>resolve(null),timeoutMs)});
  }
  setMonitoring(enabled){if(this.monitor)this.monitor.gain.setTargetAtTime(enabled?1:0,this.context.currentTime,.01)}
  stop(){
    if(this.state==='complete')return Promise.resolve({chunks:this.chunks,frames:this.frames,sampleRate:this.context.sampleRate,limited:false});
    if(!['recording','stopping'].includes(this.state))return Promise.reject(new Error('No PCM recording is active.'));
    if(this.pendingStop)return this.pendingStop;
    this.state='stopping';
    this.pendingStop=new Promise(resolve=>{
      this.resolveStop=result=>{clearTimeout(this.stopTimeout);resolve(result)};
      this.node.port.postMessage({type:'stop',stopFrame:Math.ceil((this.context.currentTime+.03)*this.context.sampleRate)});
      this.stopTimeout=setTimeout(()=>{
        this.state='complete';this.release();
        resolve({chunks:this.chunks,frames:this.frames,sampleRate:this.context.sampleRate,interrupted:true});
      },1500);
    });
    return this.pendingStop;
  }
  cancel(){
    ++this.token;this.node?.port.postMessage({type:'cancel'});clearTimeout(this.stopTimeout);
    this.release();this.state='idle';this.chunks=[];this.frames=0;
    this.resolveStop?.({chunks:[],frames:0,sampleRate:this.context.sampleRate,cancelled:true});
  }
  release(){
    for(const track of this.stream?.getTracks()||[]){track.onended=null;track.stop()}
    for(const node of [this.source,this.node,this.silent,this.monitor,this.analyser])node?.disconnect();
    if(this.node)this.node.port.onmessage=null;
  }
}
