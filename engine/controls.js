import * as T from 'three';
import {children,descendants} from './definitions.js?v=9ef16e164bdfaa42';
import {controlEnabled,applyPassword} from './interface.js?v=9ef16e164bdfaa42';

const duration=clip=>Math.max(0,...descendants(clip,'Key').map(n=>Number(n.a.Time??0)));
export function presentation(clips,loop=true){return {clips,elapsed:0,duration:Math.max(0,...clips.map(duration)),loop,finished:false};}

export class ScreenControls {
 constructor({definition,root,globals,read,exists,animate,activate,profile,build,overlay,onError}){
  Object.assign(this,{definition,root,globals,read,exists,animate,activate,profile,build,overlay,onError});this.elapsed=0;this.items=[];this.dead=false;
 }
 async prepare(){
  for(const def of children(this.definition,'Controls').flatMap(n=>n.c)){
   const a=def.a,node=this.root.getObjectByName(a.NodeName),item={def,node,clips:{},elapsed:0,state:'',hover:false};node?.traverse(n=>{if(n.userData.hit&&!item.hit)item.hit=n;});this.items.push(item);
   if(a.Name){for(const suffix of ['norm','high','disabled','normhigh','highnorm','disablednorm','checked','notchecked','hchecked','hnotchecked','checkedhchecked','hcheckedchecked','notcheckedhnotchecked','hnotcheckednotchecked']){const path=(a.Name+suffix+'.anim').toLowerCase();if(this.exists(path))item.clips[suffix]=await this.read(path);}}
   if(a.AnimationName){const clip=await this.read(a.AnimationName);item.progressClip=clip;item.duration=duration(clip);item.progress=0;}
   if(def.tag==='ControlInputSelector')await this.hardware(item);
   if(def.tag==='ControlPassword'){item.text='';this.password=item;applyPassword(def,'',this.globals);}
   if(def.tag==='ControlHiscore')this.hiscore(item);
   if(node&&['ControlButton','ControlInputSelector','ControlMusicMute','ControlPassword'].includes(def.tag))this.button(item);
  }
  this.update(0);
 }
 button(item){
  const button=document.createElement('button');button.hidden=true;button.className='native-control';button.dataset.node=item.node.name;
  button.setAttribute('aria-label',item.node.value||item.node.name);this.overlay.append(button);item.button=button;
  button.onpointerenter=()=>this.select(item);button.onfocus=()=>this.select(item);
  button.onclick=()=>this.click(item).catch(this.onError);
 }
 select(item){if(!controlEnabled(item.def.a,this.globals))return;for(const other of this.items)other.hover=other===item;this.selected=item;}
 async click(item){
  if(this.dead||!controlEnabled(item.def.a,this.globals))return;
  const {tag,a}=item.def;
  if(tag==='ControlPassword'){this.password=item;item.button.focus();return;}
  if(tag==='ControlMusicMute'){this.profile.set('MusicMute',!this.profile.data.settings.MusicMute);return;}
  if(tag==='ControlInputSelector'){
   const choices=['GC_KeyboardLayout_1','GC_KeyboardLayout_2'];
   for(const pad of navigator.getGamepads?.()??[])if(pad)choices.push('joystick_'+pad.index);
   const current=this.profile.data.settings[a.HardwarePropertyName]??a.DefaultHardwareName;
   this.profile.set(a.HardwarePropertyName,choices[(choices.indexOf(current)+1)%choices.length]);await this.hardware(item);return;
  }
  this.commitScore();await this.activate(item.def);
 }
 async hardware(item){
  const a=item.def.a,container=this.root.getObjectByName(a.SelectorModelNode);if(!container)return;
  const revision=(item.hardwareRevision??0)+1;item.hardwareRevision=revision;
  const name=this.profile.data.settings[a.HardwarePropertyName]??a.DefaultHardwareName,path=(a.HardwareModelPath+name+'.scene').toLowerCase();
  if(!this.exists(path))throw Error('Input-device model missing: '+path);
  const animation=path.replace(/\.scene$/,'.anim');
  const [model,clip]=await Promise.all([this.read(path).then(n=>this.build(n)),this.exists(animation)?this.read(animation):Promise.resolve(null)]);
  if(this.dead||item.hardwareRevision!==revision){this.disposeModel(model);return;}
  if(item.hardware){container.remove(item.hardware);this.disposeModel(item.hardware);}container.add(model);item.hardware=model;
  item.hardwareAnimation=clip?{presentation:presentation([clip])}:null;
 }
 hiscore(item){const a=item.def.a,rows=[...this.profile.scores(a.PlayerCount??1)];
  const score=Number(this.globals[a.PlayerScorePropertyName]??this.globals.ScoreTotal0??0);
  if(/hiscore.*game\.scene/i.test(this.definition.a.ModelName??'')&&score>0){
   let rank=rows.findIndex(row=>row.score<score);if(rank<0)rank=rows.length;
   if(rank<Number(a.EntryCount??10)){this.editScore={item,text:'',score,players:a.PlayerCount??1,rank};rows.splice(rank,0,{name:'_',score});}
  }
  for(let i=0;i<Number(a.EntryCount??10);i++){
   this.root.getObjectByName(a.ScoreNodeName+i)?.setText?.(rows[i]?.score??'');
   const nick=this.root.getObjectByName(a.NickNodeName+i);if(nick){nick.setText?.(rows[i]?.name??'');}
  }
 }
 commitScore(){if(this.editScore){const e=this.editScore;this.profile.record(e.players,e.text,e.score);this.editScore=null;}}
 key(event){
  if(event.type==='keyup'){if(this.pressedAlias?.code!==event.code)return false;const action=this.pressedAlias.action;this.pressedAlias=null;action();return true;}
  if(event.type!=='keydown'||event.repeat)return false;
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.code)){
   const buttons=this.items.filter(i=>i.button&&!i.button.disabled&&!i.button.hidden),current=buttons.findIndex(i=>i.hover||i.button===document.activeElement);
   if(buttons.length){const delta=['ArrowUp','ArrowLeft'].includes(event.code)?-1:1,next=buttons[current<0?0:(current+delta+buttons.length)%buttons.length];for(const item of this.items)item.hover=false;next.hover=true;next.button.focus();return true;}
  }
  const edit=this.password??this.editScore;
  if(edit&&(event.key.length===1||event.code==='Backspace')){
   const item=this.password??this.editScore.item,limit=Number(item.def.a.MaxLength??20);
   if(event.code==='Backspace')edit.text=edit.text.slice(0,-1);else if(edit.text.length<limit&&/^[\x20-\x7e]$/.test(event.key))edit.text+=event.key;
   if(this.password){applyPassword(item.def,edit.text,this.globals);item.node?.setText?.(edit.text.padStart(limit,'_'));}
   else this.root.getObjectByName(item.def.a.NickNodeName+edit.rank)?.setText?.(edit.text||'_');
   return true;
  }
  const alias=event.code==='Escape'?'GCMenuBack':['Enter','Space'].includes(event.code)?'GCMenuSelect':null;
  if(alias){const item=(alias==='GCMenuSelect'?this.items.find(i=>i.button&&(i.hover||i.button===document.activeElement)&&controlEnabled(i.def.a,this.globals)):null)??this.items.find(i=>i.def.a.KeyboardAlias===alias&&controlEnabled(i.def.a,this.globals));if(item){
   this.pressedAlias={code:event.code,action:()=>this.click(item).catch(this.onError)};return true;
  }if(this.password&&alias==='GCMenuSelect'&&this.globals.EpisodeLink){this.pressedAlias={code:event.code,action:()=>this.activate({tag:'ControlButton',a:{Link:this.password.def.a.Link}}).catch(this.onError)};return true;}}
  return false;
 }
 update(dt){this.elapsed+=dt;
  for(const item of this.items){const {def,node}=item,a=def.a;if(!node)continue;
   if(item.hardwareAnimation){item.hardwareAnimation.presentation.elapsed+=dt;this.animate(item.hardwareAnimation,item.hardware);}
   if(def.tag==='ControlLabel')node.setText?.(a.Timeout!==undefined&&this.elapsed>Number(a.Timeout)?'':this.globals[a.PropertyName]??'');
   if(item.progressClip){const min=Number(a.MinPropertyName?this.globals[a.MinPropertyName]:a.MinValue??0),max=Number(a.MaxPropertyName?this.globals[a.MaxPropertyName]:a.MaxValue??1),target=(Number(this.globals[a.PropertyName]??0)-min)/(max-min||1),speed=Number(a.Speed??0)*dt;
    item.progress=speed?item.progress+Math.max(-speed,Math.min(speed,target-item.progress)):target;
    this.animate({presentation:{clips:[item.progressClip],elapsed:item.progress*item.duration,duration:item.duration,loop:false}},node);
   }
   if(!item.button)continue;
   const enabled=controlEnabled(a,this.globals);item.button.disabled=!enabled;
   let state=!enabled?'disabled':item.hover?'high':'norm';
   if(def.tag==='ControlMusicMute'){const checked=!this.profile.data.settings.MusicMute;state=(item.hover?'h':'')+(checked?'checked':'notchecked');}
   if(state!==item.state){const transition=item.clips[item.state+state];item.presentation=presentation([transition??item.clips[state]].filter(Boolean),false);item.transition=transition?state:null;item.state=state;}
   if(item.presentation){item.presentation.elapsed+=dt;this.animate(item,node);if(item.transition&&item.presentation.elapsed>=item.presentation.duration){item.presentation=presentation([item.clips[item.transition]].filter(Boolean),false);item.transition=null;}}
   if(node.value)item.button.setAttribute('aria-label',node.value);
  }
 }
 project(camera,width,height){
  this.root.updateMatrixWorld(true);
  for(const item of this.items){if(!item.button)continue;const node=item.node,box=new T.Box3();
   let visible=true;for(let n=node;n;n=n.parent)if(!n.visible){visible=false;break;}if(!visible){item.button.hidden=true;continue;}
   // HitNode::hit (0x4345e0) compares the projected origin against fixed
   // normalized half-extents; these rectangles do not follow glyph bounds.
   if(item.hit){const p=new T.Vector3().setFromMatrixPosition(item.hit.matrixWorld).project(camera),a=item.hit.userData.hit,w=Number(a.Width)*width,h=Number(a.Height)*height;
    item.button.hidden=p.z>1||p.z< -1;Object.assign(item.button.style,{left:((p.x+1)*width/2-w/2)+'px',top:((1-p.y)*height/2-h/2)+'px',width:w+'px',height:h+'px',clipPath:'none'});continue;}
   if(node.mesh){node.mesh.geometry.computeBoundingBox();box.copy(node.mesh.geometry.boundingBox);}else{box.setFromObject(node);if(box.isEmpty()){item.button.hidden=true;continue;}box.applyMatrix4(node.matrixWorld.clone().invert());}
   if(box.isEmpty()){item.button.hidden=true;continue;}
   const points=[[box.min.x,box.min.y],[box.max.x,box.min.y],[box.max.x,box.max.y],[box.min.x,box.max.y]].map(([x,y])=>new T.Vector3(x,y,box.min.z).applyMatrix4(node.matrixWorld).project(camera));
   const xs=points.map(p=>(p.x+1)*width/2),ys=points.map(p=>(1-p.y)*height/2),left=Math.min(...xs),top=Math.min(...ys),w=Math.max(...xs)-left,h=Math.max(...ys)-top;
   item.button.hidden=points.every(p=>p.z>1||p.z< -1)||w<=0||h<=0;
   Object.assign(item.button.style,{left:left+'px',top:top+'px',width:w+'px',height:h+'px',clipPath:'polygon('+xs.map((x,i)=>`${(x-left)/w*100}% ${(ys[i]-top)/h*100}%`).join(',')+')'});
  }
 }
 disposeModel(root){root.traverse(n=>{n.geometry?.dispose();if(n.material)for(const m of Array.isArray(n.material)?n.material:[n.material])m.dispose();});}
 hide(){this.pressedAlias=null;for(const item of this.items)if(item.button)item.button.hidden=true;}
 dispose(){this.dead=true;this.pressedAlias=null;for(const item of this.items)item.button?.remove();}
}
