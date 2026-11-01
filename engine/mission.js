import {children,descendants,properties,values} from './definitions.js';
import {StrategyWorld} from './strategies.js';
import {NativeMask,firePositions,collisionEvents} from './spatial.js';
import {NativeGridMotion,NativeFireClock,NativeTimedFire} from './native.js';
import {NativeEnemyAI} from './ai.js';

const strategies=n=>children(n,'Strategies').flatMap(n=>n.c);
const normalize=p=>p.replaceAll('\\','/').toLowerCase();
const stateViews=n=>children(n,'GameObjectStateView');

// Reconstruction host for original object states, generators and combat strategies.
export class NativeMissionPreview {
 static async prepare(level,resolve,read){
  const definitions=new Map(),animations=new Map(),generators=[],placements=[],offField=[],unavailableTemplates=new Map(),globals={...properties(await resolve('data/interface/game.screen')),...properties(level)};
  async function add(path){
   path=normalize(path);if(definitions.has(path))return;
   const def=await resolve(path);definitions.set(path,def);
   const nodes=[];function walk(n){nodes.push(n);for(const c of n.c)walk(c);}walk(def);
   // Preload future reinforcement/bonus templates too. Stock data contains absent
   // tutorial templates behind zero counters; only those inactive failures defer.
   for(const node of nodes.filter(n=>n.tag==='StrategyGenerator')){
    try{await add(node.a.TemplateName);}catch(error){if(Number(globals[node.a.DecPropertyName]??0)>0||Number(globals[node.a.DecPropertyName+'Total']??0)>0)throw error;unavailableTemplates.set(node.a.TemplateName,error.message);}
   }
   for(const node of nodes.filter(n=>n.tag==='StrategyFireByKey'||n.tag==='StrategyFireByTime'))await add(node.a.TemplateName);
   for(const view of nodes.filter(n=>n.tag==='GameObjectStateView'))for(const path of values(view.a,'AnimationName')){
    const key=normalize(path);if(!animations.has(key))animations.set(key,await read(key));
   }
  }
  for(const item of children(level,'Level').flatMap(n=>children(n,'OffFieldObject'))){await add(item.a.TemplateName);offField.push({definition:await resolve(item.a.TemplateName)});}
  for(const item of children(level,'Level').flatMap(n=>children(n,'Object'))){
   const def=await resolve(item.a.TemplateName);
   const p=children(item,'Position')[0]?.a;if(!p)continue;
   await add(item.a.TemplateName);
   const placement={definition:def,index:placements.length,position:{x:Number(p.X),y:Number(p.Y),direction:Number(p.Direction.split(/\s+/)[0])}};
   placements.push(placement);if(descendants(def,'StrategyGenerator').length)generators.push(placement);
  }
  return {definitions,animations,generators,placements,offField,globals,unavailableTemplates};
 }
 constructor(prepared,field,{input=()=>null,fire=()=>false,spawn=()=>{},state=()=>{},exitState=()=>{},remove=()=>{},seed=Date.now()>>>0}={}){
  Object.assign(this,{prepared,field,input,fire,onSpawn:spawn,onState:state,onStateExit:exitState,onRemove:remove});this.tanks=[];this.masks=new Map();this.fieldActors=new Map();this.presentationGaps=new Set();
  field.cells.clear();field.objects.clear();
  field.onContact=(movingId,otherId)=>{
   const moving=this.fieldActors.get(movingId),other=this.fieldActors.get(otherId);if(!moving||!other)return;
   for(const event of collisionEvents(moving,other))this.world.enqueue(event.actor,event.name,event.source);
  };
  this.world=new StrategyWorld({globals:prepared.globals,seed,adapter:{
   spawn:(source,path,position)=>this.spawn(path,position),
   episode:(name,actor)=>{this.requestedLink={name,actorId:actor.id,time:this.world.time};},
   mask:(actor,text)=>this.setMask(actor,text),
   exitState:actor=>this.onStateExit(actor),
   lifecycle:(actor,s,phase)=>{
    if(s.node.tag==='StrategyFireByKey'){s.fireClock??=new NativeFireClock({minPeriod:Number(s.node.a.MinPeriod??100),period:Number(s.node.a.Period??0),maxBulletCount:Number(s.node.a.MaxBulletCount??1)});if(phase==='stop')s.fireClock.elapsed=0;}
    if(s.node.tag==='StrategyFireByTime'&&phase==='start')s.fireClock=new NativeTimedFire(Number(s.node.a.MinTime??0),Number(s.node.a.MaxTime??0),s.rng);
    if(s.node.tag.startsWith('StrategyMove')){
     if(phase==='start'){
      this.setMask(actor,s.node.a.Mask??'1');
      actor.motion??=new NativeGridMotion(actor.position);
      if(['StrategyMoveRandom','StrategyMoveFind'].includes(s.node.tag)){
       s.ai??=new NativeEnemyAI({minTime:Number(s.node.a.MinTime??1),maxTime:Number(s.node.a.MaxTime??2),headingSeed:s.rng.state,targetSeed:this.world.seed++,targetType:s.node.a.TargetType??null});s.ai.start();
      }
     }else this.setMask(actor,'');
    }
   },
   state:(actor,definition)=>{
    const views=stateViews(definition),clips=views.flatMap(v=>values(v.a,'AnimationName').map(p=>prepared.animations.get(normalize(p))));
    const duration=Math.max(0,...clips.flatMap(c=>[...descendants(c,'Key'),...descendants(c,'Execute')].map(k=>Number(k.a.Time??0))));
    actor.presentation={clips,elapsed:0,duration,loop:views.at(-1)?.a.Loop!=='false',finished:false};
    this.onState(actor);
   },
   afterStep:(actor,dt)=>{
    const p=actor.presentation;if(!p||p.finished)return;p.elapsed=Math.fround(p.elapsed+dt);
    if(!p.loop&&p.elapsed>p.duration){p.finished=true;this.world.enqueue(actor,'AnimFinished');}
   },
   remove:actor=>{this.field.remove('dynamic:'+actor.id);this.fieldActors.delete('dynamic:'+actor.id);this.onRemove(actor);},
   process:(actor,s,dt)=>this.process(actor,s,dt),
  }});
  for(const placement of prepared.offField??[]){const actor=this.world.create(placement.definition);actor.offField=true;actor.nodeName=children(placement.definition,'GameObjectView').at(-1)?.a.NodeName;this.onSpawn(actor);}
  for(const placement of prepared.placements??prepared.generators){
   const actor=this.world.create(placement.definition,placement.position);actor.staticIndex=placement.index;
   actor.modelPath=children(placement.definition,'GameObjectView').at(-1)?.a.ModelName;this.onSpawn(actor);
  }
 }
 setMask(actor,text){
  let mask=null;if(text){if(!this.masks.has(text))this.masks.set(text,new NativeMask(text));mask=this.masks.get(text);}
  actor.nativeMask=mask;this.fieldActors.set('dynamic:'+actor.id,actor);this.field.replace('dynamic:'+actor.id,mask,actor.position);
 }
 spawn(path,position){
  const definition=this.prepared.definitions.get(normalize(path));if(!definition)throw Error('Spawn definition was not prepared: '+path);
  const actor=this.world.create(definition,position);actor.modelPath=children(definition,'GameObjectView').at(-1)?.a.ModelName;
  this.tanks.push(actor);this.onSpawn(actor);
  return actor;
 }
 process(actor,s,dt){
  const {tag,a}=s.node;
  if(tag==='StrategyMoveByKey'||tag==='StrategyMoveRandom'||tag==='StrategyMoveFind'||tag==='StrategyMoveBullet'){
   const speed=Number(actor.props.Speed??0),motion=actor.motion;
   const canEnter=(x,y,direction)=>{
    const next={...actor.position,x,y,direction};
    const hit=this.field.query('dynamic:'+actor.id,actor.nativeMask,next),allowed=!hit.boundary&&(tag==='StrategyMoveBullet'||!hit.objects.length);
    if(allowed)this.field.move('dynamic:'+actor.id,actor.nativeMask,next);
    return allowed;
   };
   if(tag==='StrategyMoveByKey')motion.step(dt,this.input(actor,a.InputDevicePropertyName),speed,canEnter);
   else if(tag==='StrategyMoveBullet'){
    // Native constructor disables solid blocking. DOUBLE POWER uses this strategy
    // for its boss tank as well as the game using it for projectiles.
    let boundary=false;
    motion.stepAutonomous(dt,motion.direction,speed,(x,y,direction)=>{const allowed=canEnter(x,y,direction);boundary=!allowed;return allowed;});
    actor.position=motion.snapshot();
    if(boundary&&a.CollisionState)actor.changeState(a.CollisionState);
   }
   else{
    const targets=this.world.active.filter(t=>!t.disposed).map(t=>({type:t.type,position:t.position,mask:t.nativeMask}));
    const direction=s.ai.step(dt,motion.snapshot(),this.field,targets);
    motion.stepAutonomous(dt,direction,speed,canEnter);
   }
   actor.position=motion.snapshot();this.field.move('dynamic:'+actor.id,actor.nativeMask,actor.position);return false;
  }
  if(tag==='StrategyBonus'){
   const remaining=Math.max(0,Math.fround(Number(actor.props[a.TimePropertyName]??0)-dt));actor.props[a.TimePropertyName]=remaining;
   actor.props[a.ValuePropertyName]=Number(remaining>0?a.BonusValue:a.NoBonusValue);
   return false;
  }
  if(tag==='StrategyFireByKey'||tag==='StrategyFireByTime'){
   const fires=tag==='StrategyFireByKey'?s.fireClock.step(dt,this.fire(actor,a.InputDevicePropertyName),Number(this.world.globals[a.BulletCounterPropertyName]??0)):s.fireClock.step(dt);
   if(fires){
    const masks=[['FireMask',actor.position.direction],...Array.from({length:4},(_,i)=>['FireMask'+i,i])];
    for(const [key,direction]of masks)if(a[key]){
     if(!s[key])s[key]=new NativeMask(a[key]);
     for(const position of firePositions(s[key],actor.position,this.field.width,this.field.height,direction))this.spawn(a.TemplateName,position);
    }
   }
   return false;
  }
  if(['StrategyRandomize','StrategyShadow','StrategyCameraAngle','StrategyCameraFollow','StrategyForceEffect'].includes(tag)){this.presentationGaps.add(tag);return false;}
  throw Error('Preview strategy is not implemented: '+tag);
 }
 step(dt){
  this.world.step(dt);
  this.tanks=this.tanks.filter(a=>!a.disposed);
 }
 dispose(){this.field.onContact=null;for(const actor of [...this.world.actors].reverse()){actor.dispose();this.field.remove('dynamic:'+actor.id);}}
}

const clipCache=new WeakMap();
function compiledClip(clip){
 if(!clipCache.has(clip)){
  const parse=v=>(v??'0').trim().split(/\s+/).map(Number);
  const tracks=descendants(clip,'PrimitiveAnimation').map(track=>({target:track.a.Target,param:track.a.Param,behave:children(track,'Envelope')[0]?.a??{},keys:descendants(track,'Key').map(k=>({time:Number(k.a.Time),base:track.a.Param==='Text'?k.a.Value:parse(k.a.Value),linear:parse(k.a.Linear),quadratic:parse(k.a.Quadratic),cubic:parse(k.a.Cubic)}))}));
  const commands=descendants(clip,'Command').flatMap(c=>children(c,'Execute').map(e=>({target:c.a.Target,name:e.a.Name,time:Number(e.a.Time??0)})));
  clipCache.set(clip,{tracks,commands});
 }
 return clipCache.get(clip);
}
// Compile original numeric keys once; sampling preserves the previous polynomial arithmetic.
export function animationTracks(clips,time){
 return clips.flatMap(clip=>compiledClip(clip).tracks.map(track=>{
  const keys=track.keys;if(!keys.length)return null;
  let sampled=time;const start=keys[0].time,end=keys.at(-1).time,period=end-start;
  if(period>0&&((sampled<start&&track.behave.PreBehave==='REPEAT')||(sampled>end&&track.behave.PostBehave==='REPEAT')))sampled=start+((sampled-start)%period+period)%period;
  const key=keys.findLast(k=>k.time<=sampled)??keys[0];
  const delta=Math.max(0,sampled-key.time),last=key===keys.at(-1),{base,linear,quadratic,cubic}=key;
  const value=typeof base==='string'?base:base.map((v,i)=>last?v:v+(linear[i]??0)*delta+(quadratic[i]??0)*delta**2+(cubic[i]??0)*delta**3);
  return {target:track.target,param:track.param,value};
 }).filter(Boolean));
}

export function animationCommands(clips,from,to,duration,loop){
 const result=[];
 for(const clip of clips)for(const command of compiledClip(clip).commands){
  const at=command.time,first=loop&&duration>0?Math.max(0,Math.ceil((from-at)/duration)):0,last=loop&&duration>0?Math.floor((to-at)/duration):0;
  for(let cycle=first;cycle<=last;cycle++){const time=at+cycle*duration;if(time>from&&time<=to)result.push({target:command.target,name:command.name,time});}
 }
 return result.sort((a,b)=>a.time-b.time);
}
