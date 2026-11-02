import {NativeRandom,NativeStateTimer,NativeTimeCounter,counterContains} from './native.js?v=e3fb8a7f95a14d79';
import {children,properties,scalar} from './definitions.js?v=e3fb8a7f95a14d79';

const number=(a,k,d=0)=>a[k]===undefined?d:Number(a[k]);
const strategies=node=>children(node,'Strategies').flatMap(n=>n.c);
const handlers=node=>children(node,'EventHandlers').flatMap(n=>n.c);
const int=value=>Number(value)|0;

// Methods reconstructed from native routines. Spatial strategies are delegated
// to a host adapter until their collision algorithm is reconstructed and verified.
export class StrategyWorld {
 constructor({globals={},seed=1,adapter={},traceLimit=2048}={}){this.globals={...globals};this.seed=seed>>>0;this.adapter=adapter;this.actors=[];this.active=[];this.pending=[];this.events=[];this.time=0;this.trace=[];this.traceLimit=traceLimit;this.nextId=1;}
 // Native Random constructor 0x49f260 accumulates GetTickCount, not adjacent +1 seeds.
 random(){const tick=(this.seed+Math.trunc(this.time*1000))>>>0;this.randomAccumulator=((this.randomAccumulator??0)+tick)>>>0;return new NativeRandom(this.randomAccumulator);}
 create(definition,{id,x=0,y=0,direction=0,progress=.01,angle=0,divisor=4}={}){
  const actor=new StrategyActor(this,definition,{id:id??this.nextId++,x,y,direction,progress,angle,divisor});
  this.actors.push(actor);this.pending.push(actor);actor.start();return actor;
 }
 enqueue(actor,name,source=actor){this.events.push({actor,name,source});}
 broadcast(name,source){this.enqueue(null,name,source);}
 step(dt){if(!Number.isFinite(dt)||dt<0)throw Error('Invalid frame duration');this.time+=dt;
  // Field::process (0x483cf0): transfer pending LIFO, remove Dead, then update
  // active actors backwards, draining the FIFO event queue before EACH actor.
  while(this.pending.length)this.active.push(this.pending.pop());
  for(const actor of this.active)if(actor.stateName==='Dead'&&!actor.disposed){actor.dispose();this.adapter.remove?.(actor);}
  this.active=this.active.filter(a=>!a.disposed);this.events=this.events.filter(e=>!e.actor?.disposed);
  this.actors=this.actors.filter(a=>!a.disposed);
  let budget=100000;
  for(let i=this.active.length-1;i>=0;i--){
   while(this.events.length){if(--budget===0)throw Error('Event loop did not settle');const event=this.events.shift();
    if(event.actor){if(!event.actor.disposed)event.actor.dispatch(event.name,event.source);}
    else{this.adapter.broadcast?.(event.name,event.source);for(const actor of this.active)if(!actor.disposed)actor.dispatch(event.name,event.source);}
   }
   if(!this.active[i].disposed){this.active[i].step(dt);this.adapter.afterStep?.(this.active[i],dt);}
  }
 }
}

export class StrategyActor {
 constructor(world,definition,position){this.world=world;this.definition=definition;this.id=position.id;this.position={...position};delete this.position.id;this.type=definition.a.Type||'Object';this.props=properties(definition);this.stateName=null;this.disposed=false;this.mask='';this.stateRevision=0;
  this.root=this.compile(strategies(definition));this.rootHandlers=handlers(definition);this.states=new Map();
  for(const group of children(definition,'GameObjectStates'))for(const n of group.c)this.states.set(n.a.Name,{definition:n,strategies:this.compile(strategies(n)),handlers:handlers(n)});
 }
 compile(nodes){return nodes.map(node=>({node,rng:this.world.random(),clock:null,cachedStep:0}));}
 start(){for(const s of this.root)this.lifecycle(s,'start');this.changeState('Default');}
 changeState(name){
  if(name===this.stateName)return true;
  const next=this.states.get(name);if(!next)throw Error(`Object ${this.id}: unknown state ${name}`);
  const old=this.states.get(this.stateName);if(old){this.world.adapter.exitState?.(this,old.definition);for(const s of [...old.strategies].reverse())this.lifecycle(s,'stop');}
  this.stateName=name;this.stateRevision++;if(this.world.traceLimit>0){this.world.trace.push({time:this.world.time,id:this.id,state:name});if(this.world.trace.length>this.world.traceLimit)this.world.trace.splice(0,this.world.trace.length-this.world.traceLimit);}
  for(const s of next.strategies)this.lifecycle(s,'start');
  this.world.adapter.state?.(this,next.definition);
  this.world.enqueue(this,'AnimStart');return true;
 }
 lifecycle(s,phase){const {tag,a}=s.node,global=tag.includes('Global'),props=global?this.world.globals:this.props;
  if(tag==='StrategyGlobalCounter'){const step=number(a,'Step',1)*(phase==='start'?1:-1);this.world.globals[a.PropertyName]=int(int(this.world.globals[a.PropertyName])+step);}
  if(tag==='StrategySetProperty'||tag==='StrategySetGlobalProperty'){const key=phase==='start'?'StartValue':'StopValue';if(a[key]!==undefined)props[a.PropertyName]=scalar(a[key]);}
  if(tag==='StrategyChangeStateByRandomTime'&&phase==='start')s.clock=new NativeStateTimer(number(a,'TimeMin'),number(a,'TimeMax'),s.rng);
  if(tag==='StrategyMask'&&phase==='start'){this.mask=a.Mask;this.world.adapter.mask?.(this,a.Mask);}
  if(tag==='StrategyMask'&&phase==='stop'){this.mask='';this.world.adapter.mask?.(this,'');}
  this.world.adapter.lifecycle?.(this,s,phase);
 }
 run(list,dt){for(const s of list)if(this.process(s,dt))return true;return false;}
 step(dt){this.run(this.root,dt);const state=this.states.get(this.stateName);if(state)this.run(state.strategies,dt);}
 dispatch(name,source){const selected=[...this.rootHandlers,...(this.states.get(this.stateName)?.handlers||[])];
  for(const h of selected)if(children(h,'EventNames').some(n=>n.c.some(e=>e.a.Name===name))){
   const key=h;this.handlerCache??=new Map();if(!this.handlerCache.has(key))this.handlerCache.set(key,this.compile(strategies(h)));
   this.run(this.handlerCache.get(key),0);
  }
 }
 process(s,dt){const {tag,a}=s.node,g=this.world.globals,local=this.props,p=tag.includes('Global')?g:local;
  switch(tag){
   case 'StrategySetProperty':case 'StrategySetGlobalProperty':if(a.ProcValue!==undefined)p[a.PropertyName]=scalar(a.ProcValue);return false;
   case 'StrategyGlobalCounter':case 'StrategyMask':return false;
   case 'StrategyChangeCounter':case 'StrategyChangeGlobalCounter':{
    if(a.StepPropertyName)s.cachedStep=Number(local[a.StepPropertyName]??0);
    else s.cachedStep=number(a,'Step');
    p[a.PropertyName]=Math.fround(Number(p[a.PropertyName]??0)+s.cachedStep);return false;
   }
   case 'StrategyCheckCounter':case 'StrategyCheckGlobalCounter':return !counterContains(int(p[a.PropertyName]),number(a,'MinValue',-2147483648),number(a,'MaxValue',2147483647));
   case 'StrategyCheckUpgrade':return !counterContains(int(g[a.HPPropertyName]),number(a,'MinHP',-2147483648),number(a,'MaxHP',2147483647))&&!counterContains(int(g[a.UpgradePropertyName]),number(a,'MinUpgrade',-2147483648),number(a,'MaxUpgrade',2147483647));
   case 'StrategyChangeStateByCounter':case 'StrategyChangeStateByGlobalCounter':{
    const value=Number(p[a.PropertyName]??0);
    if(counterContains(value,number(a,'MinValue',-Number.MAX_VALUE),number(a,'MaxValue',Number.MAX_VALUE)))return this.changeState(a.StateName);
    return false;
   }
   case 'StrategyChangeState':{
    const probability=a.ProbabilityProperty===undefined?number(a,'Probability',1):Number(g[a.ProbabilityProperty]??0);
    if(s.rng.next()<=probability)return this.changeState(a.StateName);return false;
   }
   case 'StrategyChangeStateByRandomTime':if(s.clock.step(dt))this.changeState(a.StateName);return false;
   case 'StrategyTransmitGlobalCounter':{
    const source=int(g[a.SourcePropertyName]);if(source>number(a,'MinSourceValue')){const amount=number(a,'Amount');g[a.SourcePropertyName]=source-amount;g[a.DestinationPropertyName]=int(g[a.DestinationPropertyName])+amount;}return false;
   }
   case 'StrategyGlobalEvent':this.world.broadcast(a.EventName,this);return false;
   case 'StrategyTimeCounter':s.timeCounter??=new NativeTimeCounter({startValue:number(a,'StartValue'),step:number(a,'Step',-1),min:number(a,'MinValue'),max:number(a,'MaxValue',2147483647)});g[a.PropertyName]=s.timeCounter.update(dt);return false;
   case 'StrategyEpisodeLink':if(!this.world.adapter.episode)throw Error('Episode link requires a host');this.world.adapter.episode(a.LinkName,this);return false;
   case 'StrategyGenerator':{
    if(int(g[a.DecPropertyName])<1)return false;
    if(!this.world.adapter.spawn)throw Error('Generator requires a spawn adapter');
    g[a.DecPropertyName]=int(g[a.DecPropertyName])-1;
    if(a.IncPropertyName)g[a.IncPropertyName]=int(g[a.IncPropertyName])+1;
    this.world.adapter.spawn(this,a.TemplateName,{...this.position,progress:.01,angle:0});
    if(a.StateName)this.changeState(a.StateName);
    return true;
   }
   default:{
    if(!this.world.adapter.process)throw Error('Strategy is not ported: '+tag);
    return !!this.world.adapter.process(this,s,dt);
   }
  }
 }
 dispose(){if(this.disposed)return;const state=this.states.get(this.stateName);if(state)for(const s of [...state.strategies].reverse())this.lifecycle(s,'stop');for(const s of [...this.root].reverse())this.lifecycle(s,'stop');this.disposed=true;}
}
