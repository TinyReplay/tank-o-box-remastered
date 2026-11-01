const pathKey=path=>path.replaceAll('\\','/').toLowerCase().replace(/(?:\.xm)?$/,'.xm');
export function loopPosition(position,start,end){return position<end?Math.max(0,position):start+(position-start)%(end-start);}

export class GameMusic {
 constructor(context,{muted=()=>false,worker=()=>new Worker(new URL('./music-worker.js',import.meta.url))}={}){
  Object.assign(this,{context,isMuted:muted,createWorker:worker});this.cache=new Map();this.pending=new Map();this.requests=new Map();this.positions=new Map();this.nextId=1;this.revision=0;this.path=null;this.source=null;this.loading=false;this.disposed=false;
 }
 decoder(){if(!this.worker){this.worker=this.createWorker();this.worker.onmessage=({data})=>{const request=this.requests.get(data.id);if(!request)return;this.requests.delete(data.id);if(data.error)request.reject(Error(data.error));else request.resolve(data.result);};this.worker.onerror=event=>{for(const request of this.requests.values())request.reject(Error(event.message??'XM worker failed'));this.requests.clear();};}return this.worker;}
 async load(path){
  if(this.cache.has(path)){const cached=this.cache.get(path);this.cache.delete(path);this.cache.set(path,cached);return cached;}
  if(this.pending.has(path))return this.pending.get(path);
  const promise=(async()=>{
   const response=await fetch('assets/'+path);if(!response.ok)throw Error('Original music not found: '+path);const bytes=await response.arrayBuffer();if(this.disposed)throw Error('Music session ended');
   const id=this.nextId++,decoded=await new Promise((resolve,reject)=>{this.requests.set(id,{resolve,reject});this.decoder().postMessage({id,bytes},[bytes]);});
   if(this.disposed)throw Error('Music session ended');const context=this.context(),buffer=context.createBuffer(2,decoded.left.length,decoded.sampleRate);buffer.copyToChannel(decoded.left,0);buffer.copyToChannel(decoded.right,1);
   const result={buffer,duration:decoded.duration,loopStart:decoded.loopStart};this.cache.set(path,result);while(this.cache.size>2)this.cache.delete(this.cache.keys().next().value);return result;
  })();this.pending.set(path,promise);
  try{return await promise;}finally{this.pending.delete(path);}
 }
 graph(){if(this.gain)return;const context=this.context();this.gain=context.createGain();this.analyser=context.createAnalyser();this.analyser.fftSize=256;this.samples=new Float32Array(256);this.gain.connect(this.analyser);this.analyser.connect(context.destination);this.updateMute();}
 updateMute(){if(this.gain){const value=this.isMuted()?0:1;if(this.gain.gain.value!==value)this.gain.gain.setValueAtTime(value,this.context().currentTime);}}
 position(){return this.song?loopPosition(this.offset+(this.source?this.context().currentTime-this.started:0),this.song.loopStart,this.song.duration):0;}
 stop(){if(this.source){this.positions.set(this.path,this.position());this.source.stop();this.source.disconnect();this.source=null;}}
 async select(path,{resume=false}={}){
  if(!path||this.disposed)return;const key=pathKey(path);if(key===this.path&&(this.source||this.loading))return;
  this.stop();this.path=key;this.loading=true;const revision=++this.revision;
  try{const song=await this.load(key);if(this.disposed||revision!==this.revision)return;this.graph();const context=this.context(),source=context.createBufferSource();
   source.buffer=song.buffer;source.loop=true;source.loopStart=song.loopStart;source.loopEnd=song.duration;source.connect(this.gain);
   this.song=song;this.offset=resume?loopPosition(this.positions.get(key)??0,song.loopStart,song.duration):0;this.started=context.currentTime;this.source=source;this.updateMute();source.start(0,this.offset);
  }finally{if(revision===this.revision)this.loading=false;}
 }
 snapshot(){this.updateMute();let rms=0;if(this.analyser){this.analyser.getFloatTimeDomainData(this.samples);rms=Math.sqrt(this.samples.reduce((s,v)=>s+v*v,0)/this.samples.length);}return {path:this.path,loading:this.loading,playing:!!this.source&&this.context()?.state==='running',muted:!!this.isMuted(),position:this.position(),duration:this.song?.duration??0,rms};}
 dispose(){this.disposed=true;this.revision++;this.stop();this.worker?.terminate();for(const request of this.requests.values())request.reject(Error('Music session ended'));this.requests.clear();this.cache.clear();this.gain?.disconnect();this.analyser?.disconnect();}
}
