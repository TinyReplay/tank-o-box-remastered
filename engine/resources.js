import config from '../asset-config.js';
let bundle=null;
export async function prepareResources(){
 if(!config.bundle)return;
 const response=await fetch(config.bundle);if(!response.ok)throw Error('Resource bundle not found');
 const decoded=new Response(response.body.pipeThrough(new DecompressionStream('gzip')));
 bundle=await decoded.json();
}
export function bundledResource(path){
 if(!bundle)return null;
 if(!(path in bundle))throw Error('Ресурс не найден: '+path);
 return bundle[path];
}
export function textureURL(path){return config.textures[path]??'assets/'+path+'.png';}
