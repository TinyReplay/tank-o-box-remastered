// Original imported WAVs driven by animation commands. Spatial attenuation still
// needs comparison with DirectSound; tracker/XM playback is a separate component.
export class GameAudio {
 constructor(){this.context=null;this.buffers=new Map();this.voices=new Map();this.playCount=0;this.pending=new Set();this.versions=new WeakMap();}
 async unlock(){this.context??=new AudioContext();if(this.context.state==='suspended')await this.context.resume();}
 async prepare(model){
  this.context??=new AudioContext();
  const paths=new Set();model.traverse(node=>{if(node.userData.sound)paths.add(node.userData.sound.Sound.toLowerCase());});
  await Promise.all([...paths].map(path=>{
   if(!this.buffers.has(path))this.buffers.set(path,fetch('assets/'+path+'.wav').then(r=>{if(!r.ok)throw Error('Sound not found: '+path);return r.arrayBuffer();}).then(b=>this.context.decodeAudioData(b)));
   return this.buffers.get(path);
  }));
 }
 async play(node,position,offset=0){
  this.stop(node);
  const a=node.userData.sound;if(!a)return;const version=this.versions.get(node),context=this.context;this.pending.add(node);
  const buffer=await this.buffers.get(a.Sound.toLowerCase());this.pending.delete(node);if(!buffer||this.versions.get(node)!==version)return;
  const source=context.createBufferSource(),gain=context.createGain(),panner=context.createPanner();
  source.buffer=buffer;source.loop=a.Loop==='true';gain.gain.value=Number(a.Volume??1);if(offset>=buffer.duration){if(source.loop)offset%=buffer.duration;else return;}
  panner.panningModel='equalpower';panner.distanceModel='inverse';panner.refDistance=Number(a.MinDistance??1);panner.maxDistance=10000;panner.rolloffFactor=1;
  panner.positionX.value=position.x;panner.positionY.value=position.y;panner.positionZ.value=position.z;
  source.connect(gain);if(a.ChannelType==='3D'){gain.connect(panner);panner.connect(context.destination);}else gain.connect(context.destination);this.voices.set(node,{source,panner,started:context.currentTime,offset});
  source.onended=()=>{if(this.voices.get(node)?.source===source)this.voices.delete(node);source.disconnect();gain.disconnect();panner.disconnect();};
  source.start(0,offset);this.playCount++;
 }
 stop(node){this.versions.set(node,(this.versions.get(node)??0)+1);this.pending.delete(node);const voice=this.voices.get(node);if(voice){voice.source.stop();this.voices.delete(node);}}
 remove(model){model.traverse(node=>this.stop(node));}
 stopAll(){for(const node of new Set([...this.voices.keys(),...this.pending]))this.stop(node);}
 pauseAll(){const saved=[...this.voices].map(([node,voice])=>({node,position:node.getWorldPosition(node.position.clone()),offset:voice.offset+this.context.currentTime-voice.started}));this.stopAll();return saved;}
 async resume(saved){await Promise.all((saved??[]).map(v=>this.play(v.node,v.position,v.offset)));}
 updateListener(position){if(!this.context)return;const listener=this.context.listener;listener.positionX.value=position.x;listener.positionY.value=position.y;listener.positionZ.value=position.z;}
 updateSources(){for(const [node,{panner}]of this.voices){const position=node.getWorldPosition(node.position.clone());panner.positionX.value=position.x;panner.positionY.value=position.y;panner.positionZ.value=position.z;}}
}
