import config from '../asset-config.js?v=2f94353fbe10d5bf';
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
export function textureURL(path){return config.textures[path]??assetURL('assets/'+path+'.png');}
export function assetURL(path){return path+(config.release?'?v='+config.release:'');}
