import * as T from 'three';
const vector=(s,f=[0,0,0])=>new T.Vector3(...(s?s.split(/\s+/).map(Number):f));
const varying=(v,d=0)=>Number(v??d);
const random=v=>(Math.random()*2-1)*Number(v??0);
// Presentation-only RNG: never consumes the deterministic mission random stream.
export class NativeParticles {
 constructor(texture){this.texture=texture;this.worlds=new WeakMap();}
 state(world,node){
  let states=this.worlds.get(world);if(!states)this.worlds.set(world,states=new Map());
  if(states.has(node))return states.get(node);
  const config=node.userData.particles,a=config.attributes,capacity=256;
  const geometry=new T.BufferGeometry();for(const [name,size]of [['position',3],['particleColor',4],['particleSize',1]])geometry.setAttribute(name,new T.Float32BufferAttribute(new Float32Array(capacity*size),size).setUsage(T.DynamicDrawUsage));
  geometry.setDrawRange(0,0);
  const material=new T.ShaderMaterial({uniforms:{map:{value:this.texture(config.texture)},projectionScale:{value:1}},transparent:true,depthWrite:false,depthTest:true,blending:config.additive?T.AdditiveBlending:T.NormalBlending,
   vertexShader:'attribute vec4 particleColor;attribute float particleSize;varying vec4 tint;uniform float projectionScale;void main(){tint=particleColor;vec4 p=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*p;gl_PointSize=clamp(particleSize*projectionScale/max(.01,-p.z),1.,192.);}',
   fragmentShader:'uniform sampler2D map;varying vec4 tint;void main(){vec4 c=texture2D(map,vec2(gl_PointCoord.x,1.-gl_PointCoord.y))*tint;if(c.a<.003)discard;gl_FragColor=c;}'
  });
  const points=new T.Points(geometry,material);points.frustumCulled=false;points.name='Native particles';world.add(points);
  const state={node,a,config,points,particles:[],remainder:0};states.set(node,state);return state;
 }
 emit(world,node,count){
  if(!node?.userData.particles)return;
  const s=this.state(world,node),a=s.a;node.updateWorldMatrix(true,false);
  count=Math.min(256-s.particles.length,Math.max(0,Math.floor(count??a.ParticlesEmit??0)));
  const positions=s.config.source.Positions??[],normals=s.config.source.Normals??[],normalMatrix=new T.Matrix3().getNormalMatrix(node.matrixWorld);
  for(let i=0;i<count;i++){
   const tri=Math.floor(Math.random()*(positions.length/9))*9,u=Math.sqrt(Math.random()),v=Math.random(),weights=[1-u,u*(1-v),u*v];
   const position=new T.Vector3(),direction=new T.Vector3();
   for(let j=0;j<3;j++){position.addScaledVector(new T.Vector3().fromArray(positions,tri+j*3),weights[j]);if(normals.length)direction.addScaledVector(new T.Vector3().fromArray(normals,tri+j*3),weights[j]);}
   if(!positions.length)position.set(0,0,0);
   if(!direction.lengthSq())direction.set(Math.random()-.5,Math.random()-.5,Math.random()-.5);
   position.applyMatrix4(node.matrixWorld);direction.applyMatrix3(normalMatrix).normalize().multiplyScalar(varying(a.Speed)+random(a.SpeedVar));
   const color=vector(a.ColorStart,[1,1,1]),cv=vector(a.ColorVar);color.add(new T.Vector3(random(cv.x),random(cv.y),random(cv.z)));
   s.particles.push({position,velocity:direction,gravity:vector(a.Gravity).transformDirection(node.matrixWorld).multiplyScalar(vector(a.Gravity).length()),age:0,life:Math.max(.02,varying(a.LifeTime,1)+random(a.LifeVar)),size:random(a.SizeVar),color,alpha:random(a.AlphaVar)});
  }
 }
 update(world,dt,camera,height){
  dt=Math.max(0,Math.min(dt,.1));const active=new Set();
  world.traverse(node=>{if(!node.userData.particles)return;let visible=true;for(let n=node;n;n=n.parent)if(!n.visible){visible=false;break;}if(!visible)return;active.add(node);const a=node.userData.particles.attributes,rate=Number(a.ParticlesPerSec??0);if(rate>0){const s=this.state(world,node);s.remainder+=rate*dt;const count=Math.floor(s.remainder);s.remainder-=count;this.emit(world,node,count);}});
  const states=this.worlds.get(world);if(!states)return;let total=0;
  for(const [node,s]of states){
   const a=s.a,g=s.points.geometry;s.points.material.uniforms.projectionScale.value=height/(2*Math.tan(camera.fov*Math.PI/360));
   s.particles=s.particles.filter(p=>(p.age+=dt)<p.life);
   for(let i=0;i<s.particles.length;i++){
    const p=s.particles[i],t=p.age/p.life;p.velocity.addScaledVector(p.gravity,dt);p.position.addScaledVector(p.velocity,dt);
    g.attributes.position.setXYZ(i,p.position.x,p.position.y,p.position.z);const end=vector(a.ColorEnd);
    const color=p.color.clone().lerp(end,t);g.attributes.particleColor.setXYZW(i,Math.max(0,color.x),Math.max(0,color.y),Math.max(0,color.z),T.MathUtils.clamp(varying(a.AlphaStart,1)*(1-t)+varying(a.AlphaEnd)*t+p.alpha,0,1));
    g.attributes.particleSize.setX(i,Math.max(0,varying(a.SizeStart,1)*(1-t)+varying(a.SizeEnd)*t+p.size));
   }
   g.setDrawRange(0,s.particles.length);for(const attr of Object.values(g.attributes))attr.needsUpdate=true;total+=s.particles.length;
   if(!s.particles.length&&!active.has(node)){world.remove(s.points);g.dispose();s.points.material.dispose();states.delete(node);}
  }
  return total;
 }
}
