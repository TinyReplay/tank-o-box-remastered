import * as T from 'three';
import {compileReady} from './shader-ready.js?v=f12ca5453f00c325';

// Reuse light slots so spawning a zero-intensity muzzle/explosion light does not
// change NUM_POINT_LIGHTS and synchronously rebuild every material shader.
// Every visible nonzero source is retained; capacity grows rather than dropping lights.
export class PointLightPool {
 constructor(){this.group=new T.Group();this.group.name='render-light-slots';this.slots=[];this.capacity=0;this.sources=[];this.position=new T.Vector3();this.setCapacity(4);}
 attach(scene){if(this.group.parent!==scene)scene.add(this.group);}
 setCapacity(capacity){
  while(this.slots.length<capacity){const light=new T.PointLight(0xffffff,0,0,2);this.slots.push(light);this.group.add(light);}
  this.capacity=capacity;for(let i=0;i<this.slots.length;i++)this.slots[i].visible=i<capacity;
 }
 update(scene){
  if(this.warming)return;
  scene.updateMatrixWorld(true);this.sources.length=0;
  scene.traverseVisible(node=>{if(node.userData.pointLight&&node.userData.pointLight.intensity!==0)this.sources.push(node);});
  let capacity=4;while(capacity<this.sources.length)capacity*=2;if(capacity!==this.capacity)this.setCapacity(capacity);
  for(let i=0;i<this.capacity;i++){
   const light=this.slots[i],node=this.sources[i];
   if(!node){light.intensity=0;continue;}
   const source=node.userData.pointLight;
   light.userData.nativeSpecular=source.specular??[0,0,0];
   light.position.setFromMatrixPosition(node.matrixWorld);light.color.fromArray(source.color);light.intensity=source.intensity;
   light.distance=source.distance;light.decay=source.decay;
  }
 }
 async warm(renderer,camera,scene,prototypes){
  this.attach(scene);this.warming=true;
  const staging=new T.Group();for(const prototype of prototypes.values())staging.add(prototype);
  const materials=new Set();staging.traverse(node=>{if(node.material)for(const m of Array.isArray(node.material)?node.material:[node.material])materials.add(m);});
  const original=[...materials].map(m=>[m,m.transparent]);
  // compile() traverses hidden meshes too. Keep prototypes/materials alive for the
  // mission so actor deletion cannot evict these precompiled shader variants.
  try{
   for(const capacity of [4,8,16,32,64]){
    this.setCapacity(capacity);
    if(!await compileReady(renderer,scene,camera))break;
    if(!await compileReady(renderer,staging,camera,scene))break;
    for(const m of materials)m.transparent=true;
    if(!await compileReady(renderer,staging,camera,scene))break;
    for(const [m,transparent]of original)m.transparent=transparent;
   }
  }finally{for(const [m,transparent]of original)m.transparent=transparent;this.warming=false;this.update(scene);}
 }
}
