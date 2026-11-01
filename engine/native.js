// Behavioral reconstruction. See docs/REVERSE_ENGINEERING.md for native evidence.
export class NativeRandom {
  constructor(seed=1){this.state=seed>>>0;}
  next(){this.state=(Math.imul(this.state,0x343fd)+0x269ec3)>>>0;return Math.fround(((this.state>>>16)&0x7fff)*3.051850947599719e-5);}
  nextInt(bound){if(!Number.isInteger(bound)||bound<=0)throw Error('Invalid random bound');this.state=(Math.imul(this.state,0x343fd)+0x269ec3)>>>0;return ((this.state>>>16)&0x7fff)%bound;}
  between(min,max){return Math.fround(min+Math.fround(Math.fround(max-min)*this.next()));}
}

export function counterContains(value,min=-2147483648,max=2147483647){return value>=min&&value<max;}

export class NativeTimeCounter {
 constructor({startValue=0,step=-1,min=0,max=2147483647}={}){Object.assign(this,{startValue,step,min,max});this.elapsed=0;}
 update(dt){this.elapsed=Math.fround(this.elapsed+dt);const value=(this.startValue+Math.imul(Math.trunc(this.elapsed)|0,this.step))|0;return value<this.min?this.min:value>this.max?this.max:value;}
}

export class NativeStateTimer {
  constructor(min,max,random){this.min=min;this.max=max;this.random=random;this.start();}
  start(){this.elapsed=0;this.deadline=this.random.between(this.min,this.max);}
  step(dt){this.elapsed=Math.fround(this.elapsed+dt);return this.elapsed>this.deadline;}
}

export class NativeFireClock {
  constructor({minPeriod=100,period=0,maxBulletCount=1}={}){
    this.minPeriod=minPeriod;this.period=period;this.maxBulletCount=maxBulletCount;this.elapsed=100;
  }
  step(dt,held,bulletCount){
    this.elapsed=Math.fround(this.elapsed+dt);
    const ready=(bulletCount<this.maxBulletCount&&this.elapsed>this.minPeriod)||this.elapsed>this.period;
    if(held&&ready){this.elapsed=0;return true;}return false;
  }
}

export class NativeTimedFire {
  constructor(min,max,random){this.min=min;this.max=max;this.random=random;this.remaining=random.between(min,max);}
  step(dt){this.remaining=Math.fround(this.remaining-dt);if(this.remaining<=0){this.remaining=this.random.between(this.min,this.max);return true;}return false;}
}

// The numerator is second in the original two-word Direction structure.
export function oppositeDirection({count,index}){return {count,index:index===-1?-1:(index+2)%count};}

export function playerTravelBudget(speed,dt,remaining,hasInput){return hasInput?Math.fround(speed*dt):Math.min(Math.fround(speed*dt),Math.max(0,Math.fround(remaining-.01)));}

const deltas=[[0,-1],[1,0],[0,1],[-1,0]];
// Cardinal movement reconstructed from MoveByKey -> MoveBase -> field query.
// canEnter delegates the occupancy query to NativeField; collision events are separate.
export class NativeGridMotion {
 constructor({x,y,direction=0,progress=.01,divisor=4,angle=0}){Object.assign(this,{x,y,direction,progress,divisor,angle});}
 snapshot(){return {progress:this.progress,x:this.x,y:this.y,direction:this.direction,divisor:this.divisor,angle:this.angle};}
 step(dt,inputDirection,speed,canEnter=()=>true){
  if(speed<=0)return this.snapshot();
  const distance=playerTravelBudget(speed,dt,this.progress,inputDirection!==null);
  return this.travel(Math.fround(speed*Math.fround(distance/speed)),inputDirection,canEnter);
 }
 stepAutonomous(dt,direction,speed,canEnter=()=>true){return this.travel(Math.fround(speed*dt),direction,canEnter);}
 travel(budget,inputDirection,canEnter){
  // MoveBase immediately reverses a partially travelled cell. Its target anchor
  // changes back by one cell, with complementary remaining travel.
  if(budget>0&&this.progress>0&&inputDirection===(this.direction+2)%4){
   const [dx,dy]=deltas[inputDirection];this.x+=dx;this.y+=dy;
   this.progress=Math.fround(1-this.progress);this.direction=inputDirection;
  }
  let guard=4096;
  while(budget>0){
   if(--guard===0)throw Error('Movement budget exceeds supported frame size');
   if(this.progress>0){
    const remainder=Math.fround(this.progress-budget);
    if(remainder>=0){this.progress=remainder;break;}
    budget=Math.fround(budget-this.progress);this.progress=0;
   }
   const direction=inputDirection??this.direction,[dx,dy]=deltas[direction];
   this.direction=direction;
   if(!canEnter(this.x+dx,this.y+dy,direction))break;
   this.x+=dx;this.y+=dy;
   if(budget<=1){this.progress=Math.fround(1-budget);budget=0;}
   else{budget=Math.fround(budget-1);this.progress=0;}
  }
  return this.snapshot();
 }
 continuous(){const [dx,dy]=deltas[this.direction];return {x:this.x-dx*this.progress,y:this.y-dy*this.progress};}
}
