export async function compileReady(renderer,scene,camera,target){
 let timeout;
 try{return await Promise.race([renderer.compileAsync(scene,camera,target).then(()=>true),new Promise(resolve=>{timeout=setTimeout(()=>resolve(false),1500);})]);}
 finally{clearTimeout(timeout);}
}
