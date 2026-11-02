import * as T from 'three';
export function adaptedFov(fov,aspect){return aspect<4/3?2*Math.atan(Math.tan(fov/2)*(4/3)/aspect):fov;}
// Source bounds/speeds from StrategyCameraAngle. Rotation/event behaviour still
// needs native trajectory captures; this host supplies bounded player tracking.
export class PlayerCamera {
 constructor(settings={}){this.settings=settings;this.shift=new T.Vector3();this.zoom=0;}
 update(camera,position,dt){
  const a=this.settings,box=(a.Box??'20 120 10').split(/\s+/).map(Number),center=(a.BoxCenter??'0 58 -2').split(/\s+/).map(Number);
  const target=new T.Vector3();
  if(position){target.set(T.MathUtils.clamp(position.x,center[0]-box[0]/2,center[0]+box[0]/2),0,T.MathUtils.clamp(position.z,center[2]-box[2]/2,center[2]+box[2]/2));}
  const delta=target.sub(this.shift),distance=delta.length();
  if(distance)this.shift.addScaledVector(delta,Math.min(1,Math.sqrt(distance)*Number(a.Speed??6)*dt/distance));
  const start=(a.Start??'0 58 35').split(/\s+/).map(Number),wanted=position?Math.max(0,Math.hypot(...start)-Number(a.MinDistance??60)):0;
  this.zoom+=T.MathUtils.clamp(wanted-this.zoom,-Number(a.ZoomSpeed??8)*dt,Number(a.ZoomSpeed??8)*dt);
  camera.position.add(this.shift).addScaledVector(camera.getWorldDirection(new T.Vector3()),this.zoom);camera.updateMatrixWorld(true);
 }
}
