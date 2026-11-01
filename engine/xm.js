// Thin adapter to the vendored libopenmpt C API. Used in a worker at runtime and
// directly in Node verification; no game audio is uploaded or re-encoded.
export function decodeXM(api,memory,bytes,{sampleRate=44100,maxSeconds=900}={}){
 if(new TextDecoder('ascii').decode(bytes.subarray(0,17))!=='Extended Module: ')throw Error('Not an XM module');
 let data=0,module=0,leftPtr=0,rightPtr=0;
 try{
  data=api._malloc(bytes.length);if(!data)throw Error('XM allocation failed');new Uint8Array(memory()).set(bytes,data);
  module=api._openmpt_module_create_from_memory(data,bytes.length,0,0,0);if(!module)throw Error('Could not load original XM module');
  const duration=api._openmpt_module_get_duration_seconds(module);
  if(!Number.isFinite(duration)||duration<=0||duration>maxSeconds)throw Error('Unsupported XM duration: '+duration);
  const restartOrder=api._openmpt_module_get_restart_order?.(module,0)??new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint16(66,true);
  const restartRow=api._openmpt_module_get_restart_row?.(module,0)??0;
  const restartSeconds=api._openmpt_module_get_time_at_position(module,restartOrder,restartRow);
  // Unlimited repeat avoids the decoder's end-of-song fade. Capture one cycle;
  // Web Audio then loops the original restart region at the sample boundary.
  api._openmpt_module_set_repeat_count(module,-1);
  const frames=Math.round(duration*sampleRate),left=new Float32Array(frames),right=new Float32Array(frames),block=16384;
  leftPtr=api._malloc(block*4);rightPtr=api._malloc(block*4);if(!leftPtr||!rightPtr)throw Error('XM output allocation failed');
  let offset=0;
  while(offset<frames){const count=api._openmpt_module_read_float_stereo(module,sampleRate,Math.min(block,frames-offset),leftPtr,rightPtr);if(!count)throw Error('XM decoder stopped before the original loop end');
   left.set(new Float32Array(memory(),leftPtr,count),offset);right.set(new Float32Array(memory(),rightPtr,count),offset);offset+=count;
  }
  return {left,right,sampleRate,duration:frames/sampleRate,loopStart:Math.max(0,Math.min(frames/sampleRate-1/sampleRate,Number.isFinite(restartSeconds)?restartSeconds:0)),restartOrder,restartRow};
 }finally{if(module)api._openmpt_module_destroy(module);if(data)api._free(data);if(leftPtr)api._free(leftPtr);if(rightPtr)api._free(rightPtr);}
}
