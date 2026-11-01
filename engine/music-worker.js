// Decode complete original XM cycles off the rendering thread.
let resolveRuntime,rejectRuntime;
const runtime=new Promise((resolve,reject)=>{resolveRuntime=resolve;rejectRuntime=reject;});
const wasmURL=new URL('../vendor/libopenmpt/libopenmpt.wasm?v=2f94353fbe10d5bf',self.location.href).href;
var libopenmpt={
 onRuntimeInitialized:()=>resolveRuntime(),onAbort:reason=>rejectRuntime(Error(String(reason))),
 locateFile:()=>wasmURL,
 instantiateWasm(imports,receive){fetch(wasmURL).then(r=>{if(!r.ok)throw Error('XM decoder not found');return r.arrayBuffer();}).then(bytes=>WebAssembly.instantiate(bytes,imports)).then(result=>receive(result.instance)).catch(rejectRuntime);return {};},
};
importScripts('../vendor/libopenmpt/libopenmpt.js?v=2f94353fbe10d5bf');
const decoder=import('./xm.js?v=2f94353fbe10d5bf');
self.onmessage=async({data:{id,bytes}})=>{
 try{await runtime;const {decodeXM}=await decoder,result=decodeXM(Module,getMemoryBuffer,new Uint8Array(bytes));self.postMessage({id,result},[result.left.buffer,result.right.buffer]);}
 catch(error){self.postMessage({id,error:error.message??String(error)});}
};
