import {NativeRandom} from './native.js?v=2f94353fbe10d5bf';

// MoveBase::direction chooses an axis using a separate RNG (0x4845b0).
export function nativeDirectionTo(x,y,targetX,targetY,random){
 if(random.next()<=.5){
  if(targetY>y)return 2;if(targetY<y)return 0;
  if(targetX>x)return 1;if(targetX<x)return 3;
 }else{
  if(targetX>x)return 1;if(targetX<x)return 3;
  if(targetY>y)return 2;if(targetY<y)return 0;
 }
 return random.nextInt(4);
}

export class NativeEnemyAI {
 constructor({minTime=1,maxTime=2,headingSeed=1,targetSeed=2,targetType=null}={}){
  Object.assign(this,{minTime,maxTime,targetType});this.headingRandom=new NativeRandom(headingSeed);this.targetRandom=new NativeRandom(targetSeed);this.start();
 }
 start(){this.remaining=0;this.direction=null;}
 step(dt,position,field,targets=[]){this.remaining=Math.fround(this.remaining-dt);return this.select(position,field,targets);}
 select(position,field,targets=[]){
  if(this.remaining<0){
   let target=null,best=Infinity;
   if(this.targetType)for(const candidate of targets){
    if(candidate.type!==this.targetType)continue;
    const distance=Math.abs(position.x-candidate.position.x)+Math.abs(position.y-candidate.position.y);
    if(distance<best){target=candidate;best=distance;}
   }
   let targetX,targetY;
   if(target?.mask){
    const [width,height]=target.mask.size(target.position.direction);
    // MoveFind samples Y before X inside the target's rotated mask.
    targetY=target.position.y+this.targetRandom.nextInt(height);
    targetX=target.position.x+this.targetRandom.nextInt(width);
   }else{
    targetX=this.targetRandom.nextInt(field.width);targetY=this.targetRandom.nextInt(field.height);
   }
   this.direction=nativeDirectionTo(position.x,position.y,targetX,targetY,this.headingRandom);
   this.remaining=this.targetRandom.between(this.minTime,this.maxTime);
  }
  return this.direction;
 }
}
