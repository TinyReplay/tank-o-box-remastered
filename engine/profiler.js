// Bounded diagnostics; does not affect simulation time or game rules.
export class FrameProfiler {
 constructor(){this.reset();}
 reset(){this.recent=[];this.spikes=[];this.frames=0;this.maximum=0;}
 record(sample){
  this.frames++;this.maximum=Math.max(this.maximum,sample.frameMs);this.recent.push(sample);
  if(this.recent.length>180)this.recent.shift();
  if(sample.frameMs>50){this.spikes.push(sample);this.spikes.sort((a,b)=>b.frameMs-a.frameMs);this.spikes.length=Math.min(12,this.spikes.length);}
 }
 summary(){const sorted=this.recent.map(s=>s.frameMs).sort((a,b)=>a-b);return {frames:this.frames,p50:sorted[Math.floor(sorted.length*.5)]??0,p95:sorted[Math.floor(sorted.length*.95)]??0,max:this.maximum,last:this.recent.at(-1),spikes:this.spikes};}
}
