import * as T from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {NativeMask,NativeField} from './engine/spatial.js';
import {DefinitionRepository,children} from './engine/definitions.js';
import {nativePlacement,NativeDirectionInput,nativeEulerMatrix} from './engine/presentation.js';
import {NativeMissionPreview,animationTracks,animationCommands} from './engine/mission.js';
import {GameAudio} from './engine/audio.js';
import {FrameProfiler} from './engine/profiler.js';
import {PointLightPool} from './engine/lighting.js';
import {BitmapText} from './engine/text.js';
import {InterfaceFlow,LocalProfile,resourcePath} from './engine/interface.js';
import {ScreenControls,presentation} from './engine/controls.js';
import {GameDevices} from './engine/devices.js';
import {GameMusic} from './engine/music.js';
import {loading,loaded as finishLoading} from './engine/loading.js';
const debugMode=new URLSearchParams(location.search).get('debug')==='1';
document.body.classList.toggle('debug',debugMode);
const profile=new LocalProfile(localStorage);
const devices=new GameDevices(profile.data.settings);
let uiControls=null,screenAnimation=null,screenCamera=null,interfaceFlow=null,catalog=null,viewLoading=false;
let hudRoot=null,hudScene=null,hudCameraNode=null,hudAnimation=null;
const hudCamera=new T.PerspectiveCamera();
const overlay=document.querySelector('#native-ui');
const lightPool=new PointLightPool();
const profiler=new FrameProfiler();let lastProfile=0;
const audio=new GameAudio();
const music=new GameMusic(()=>audio.context,{muted:()=>profile.data.settings.MusicMute===true});
const viewport=document.querySelector('#viewport'),status=document.querySelector('#status'),badge=document.querySelector('#badge');
const renderer=new T.WebGLRenderer({antialias:true,alpha:false});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor(0x14170f);
renderer.outputColorSpace=T.LinearSRGBColorSpace;
renderer.info.autoReset=false;
viewport.prepend(renderer.domElement);
const camera=new T.PerspectiveCamera(38,1,.1,500),controls=new OrbitControls(camera,renderer.domElement);
controls.enabled=debugMode;controls.enableDamping=true;controls.target.set(0,0,0);
let world=new T.Scene(),loaded=null,revision=0,movementPreview=null,lastFrame=0,fireHeld=false;
const input=new NativeDirectionInput();
const jsonCache=new Map(),textureCache=new Map();
const vec=(s,d=[0,0,0])=>s?s.trim().split(/\s+/).map(Number):d;
function descendants(n,tag){return [...(n.tag===tag?[n]:[]),...n.c.flatMap(c=>descendants(c,tag))];}
const definitions=new DefinitionRepository(json);
async function definition(path){return definitions.resolve(path);}
function stateMask(object,name='Default'){
 const state=children(object,'GameObjectStates').flatMap(n=>children(n,'GameObjectState')).find(n=>n.a.Name===name);
 const strategies=[...children(object,'Strategies').flatMap(n=>n.c),...(state?children(state,'Strategies').flatMap(n=>n.c):[])];
 const value=strategies.filter(n=>n.a.Mask!==undefined).at(-1)?.a.Mask;
 return value===undefined?null:new NativeMask(value);
}
async function level(path){const def=await definition(path),root=await build(await json(def.a.ModelName)),objects=def.c.filter(x=>x.tag==='Level').flatMap(x=>x.c.filter(c=>c.tag==='Object'));
 const dimensions=children(def,'Level').at(-1).a,field=new NativeField(Number(dimensions.Width),Number(dimensions.Height));
 root.updateMatrixWorld(true);const corner=new T.Vector3();root.getObjectByName(dimensions.CornerNode)?.getWorldPosition(corner);
 const basis={corner:corner.toArray(),vectorX:vec(dimensions.VectorX,[-1,0,0]),vectorY:vec(dimensions.VectorY,[0,0,1])};root.userData.basis=basis;
 // Register in source order: the native occupancy table holds one owner per cell.
 const objectDefs=await Promise.all(objects.map(item=>definition(item.a.TemplateName)));
 objects.forEach((item,i)=>{const p=children(item,'Position')[0]?.a,mask=stateMask(objectDefs[i]);if(p&&mask)field.replace(i,mask,{x:Number(p.X),y:Number(p.Y),direction:vec(p.Direction,[0])[0]});});
 root.userData.field=field;
 const placements=await Promise.all(objects.map(async(item,i)=>{const p=item.c.find(x=>x.tag==='Position')?.a;if(!p)return null;const object=objectDefs[i],view=object.c.findLast(x=>x.tag==='GameObjectView');if(!view?.a.ModelName)return null;const model=await build(await json(view.a.ModelName)),group=new T.Group();place(group,{x:Number(p.X),y:Number(p.Y),direction:vec(p.Direction,[0,4])[0]},stateMask(object),basis);group.add(model);return group;}));
 for(const o of placements)if(o)root.add(o);root.userData.placements=placements;root.userData.objectCount=placements.filter(Boolean).length;root.userData.levelDefinition=def;return root;}
async function json(path){path=resourcePath(path);if(!jsonCache.has(path))jsonCache.set(path,fetch('assets/'+path+'.json').then(r=>{if(!r.ok)throw Error('Ресурс не найден: '+path);return r.json();}));return jsonCache.get(path);}
function texture(path){path=path.toLowerCase().replace(/\.bmp$/,'');if(!textureCache.has(path)){
 let ready,failed;const promise=new Promise((resolve,reject)=>{ready=resolve;failed=reject;});
 const tex=new T.TextureLoader().load('assets/'+path+'.png',ready,undefined,()=>failed(Error('Texture not found: '+path)));
 tex.userData.ready=promise;tex.colorSpace=T.LinearSRGBColorSpace;tex.wrapS=tex.wrapT=T.RepeatWrapping;textureCache.set(path,tex);
 }return textureCache.get(path);}
async function warmTextures(){const textures=[...textureCache.values()];await Promise.all(textures.map(t=>t.userData.ready));for(const t of textures)renderer.initTexture(t);}

function material(shader){const a=shader.c.find(x=>x.tag==='Material')?.a||{},diff=shader.c.find(x=>x.tag==='Diffuse')?.a.Image,em=shader.c.find(x=>x.tag==='Emissive')?.a.Image;
 const m=new T.MeshPhongMaterial({color:new T.Color(...vec(a.Diffuse,em&&!diff?[0,0,0]:[1,1,1])),specular:new T.Color(...vec(a.Specular,[0,0,0])),shininess:Number(a.SpecularPower||30),emissive:new T.Color(...vec(a.Emissive,em?[1,1,1]:[0,0,0])),map:diff?texture(diff):em?texture(em):null,emissiveMap:em?texture(em):null,side:T.DoubleSide,transparent:!!a.Transparency||!!diff||!!em,opacity:1-Number(a.Transparency||0),alphaTest:.015,depthWrite:Number(a.Transparency||0)<.2});m.name=shader.a.Name??'';return m;}
const rotationMatrix=new T.Matrix4();
function rotate(model,angles){model.quaternion.setFromRotationMatrix(rotationMatrix.fromArray(nativeEulerMatrix(angles)));}
async function build(node,chain=[]){const a=node.a,o=node.tag==='Text'?new BitmapText(await json(a.Font),texture(a.Font.toLowerCase().replace(/_pasw(?=\.font$)/,'').replace(/\.font$/,'')),a):new T.Group();o.name=a.Name||node.tag;o.userData.sceneRoot=node.tag==='Scene';o.visible=a.Visibility!=='false';o.position.fromArray(vec(a.Position));rotate(o,vec(a.Rotation));o.scale.fromArray(vec(a.Scale,[1,1,1]));
 if(node.tag==='Text'){const shader=children(node,'Shader')[0],m=shader&&children(shader,'Material')[0]?.a;if(m){o.textMaterial.color.fromArray(vec(m.Emissive,[1,1,1]));o.textMaterial.opacity=1-Number(m.Transparency??0);}}
 if(node.tag==='CameraPerspective')o.userData.camera=a;
 if(node.tag==='HitNode')o.userData.hit=a;
 if(node.tag==='SoundSource')o.userData.sound=a;
 if(a.Children&&!chain.includes(a.Children.toLowerCase()))o.add(await build(await json(a.Children),[...chain,a.Children.toLowerCase()]));
 if(node.tag.startsWith('Model')&&a.Source){const data=await json(a.Source),g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(data.Positions,3));if(data.Normals)g.setAttribute('normal',new T.Float32BufferAttribute(data.Normals,3));else g.computeVertexNormals();if(data.UV0)g.setAttribute('uv',new T.Float32BufferAttribute(data.UV0,2));const shaders=node.c.find(x=>x.tag==='Shaders')?.c||[];let offset=0;const mats=shaders.map((s,i)=>{const n=Number(s.a.TrianglesCount)*3;g.addGroup(offset,n,i);offset+=n;return material(s);});const mesh=new T.Mesh(g,mats.length?mats:new T.MeshPhongMaterial({color:0xb2b0a4,side:T.DoubleSide}));if(node.tag==='ModelMorph'&&a.Source2)mesh.userData.morph={base:data,target:await json(a.Source2)};o.add(mesh);}
 if(node.tag==='Light'){if(a.Type==='AMBIENT')o.add(new T.AmbientLight(new T.Color(...vec(a.Ambient,[1,1,1])),Number(a.Intensity??1)));else o.userData.pointLight={color:vec(a.Diffuse,[1,1,1]),intensity:Number(a.Intensity??1),distance:0,decay:a.Attenuation==='QUADRATIC'?2:1};}
 for(const child of node.c)if(!['Shaders','Shader','Material','Diffuse','Emissive'].includes(child.tag))o.add(await build(child,chain));return o;}
function reset(){const tank=document.querySelector('#scene').value.includes('/objects/');camera.position.set(...(tank?[6,7,9]:[0,75,44]));camera.fov=tank?38:38;camera.updateProjectionMatrix();controls.target.set(0,tank?.5:0,0);controls.update();}
function disposeScene(scene){scene.traverse(o=>{o.geometry?.dispose();if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();});}
function place(model,position,mask,basis){const transform=nativePlacement(position,mask,basis);model.position.fromArray(transform.position);rotate(model,transform.rotation);}
function disposeMaterials(model){model.traverse(o=>{if(o.userData.morph?.owned)o.geometry?.dispose();if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();});}
function stopPreview(){if(!movementPreview)return;audio.stopAll();movementPreview.mission.dispose();for(const model of movementPreview.models.values())if(model.userData.previewDynamic){loaded.remove(model);disposeMaterials(model);}for(const prototype of movementPreview.prototypes.values())disposeScene(prototype);movementPreview=null;input.clear();devices.clear();fireHeld=false;document.querySelector('#combat-stats').hidden=true;}
async function load(){document.querySelector('#motion').disabled=true;stopPreview();input.clear();lastFrame=0;document.querySelector('#motion').textContent='Проверить бой';const id=++revision,path=document.querySelector('#scene').value;status.textContent='Загрузка…';document.querySelector('#error').textContent='';try{const tree=path.endsWith('.level')?await level(path):await build(await json(path),[path]);if(id!==revision){disposeScene(tree);return;}disposeScene(world);world=new T.Scene();loaded=tree;tree.scale.x *= -1;world.add(tree);const tank=path.includes('/objects/');if(tank){world.add(new T.HemisphereLight(0xfff7db,0x3a4030,2));const l=new T.DirectionalLight(0xfff6e3,2);l.position.set(-4,10,8);world.add(l);if(path.includes('tank_01_')){const names=['locator1','tank_01_3x3_0_locator1','tank_01_3x3_1_locator2','tank_01_3x3_2_locator3'];tree.children.filter(o=>names.includes(o.name)).forEach(o=>o.visible=o.name===names[Number(document.querySelector('#variant').value)]);}}
 else if(!world.getObjectsByProperty('isLight',true).length){world.add(new T.AmbientLight(0xffffff,1));}
 document.querySelector('#motion').disabled=false;reset();status.textContent='Оригинальная сцена загружена';badge.textContent=tank?'Оригинальная модель · просмотр ресурсов':path.endsWith('.level')?`Оригинальная карта · объектов: ${tree.userData.objectCount}`:'Оригинальная сцена стола · WebGL';window.portDebug={world,loaded,renderer,camera};
 }catch(e){if(id!==revision)return;document.querySelector('#motion').disabled=false;status.textContent='Ошибка загрузки';document.querySelector('#error').textContent=e.message;console.error(e);}}
document.querySelector('#scene').onchange=load;document.querySelector('#variant').onchange=load;document.querySelector('#reset').onclick=reset;document.querySelector('#spin').onclick=e=>{controls.autoRotate=!controls.autoRotate;e.target.textContent='Вращение: '+(controls.autoRotate?'вкл.':'выкл.');};
new ResizeObserver(()=>{const w=viewport.clientWidth,h=viewport.clientHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();}).observe(viewport);
renderer.domElement.tabIndex=0;renderer.domElement.setAttribute('aria-label','Игровое поле');
const keyDirection={ArrowUp:0,KeyW:0,ArrowRight:1,KeyD:1,ArrowDown:2,KeyS:2,ArrowLeft:3,KeyA:3};
window.addEventListener('keydown',e=>{if(!movementPreview||e.target.closest('select,input,textarea,[contenteditable]'))return;if(!debugMode){if(devices.down(e.code))e.preventDefault();return;}if(e.code==='Space'){e.preventDefault();fireHeld=true;}else if(keyDirection[e.code]!==undefined){e.preventDefault();input.down(e.code,keyDirection[e.code]);}});
window.addEventListener('keyup',e=>{input.up(e.code);devices.up(e.code);if(e.code==='Space')fireHeld=false;});
window.addEventListener('blur',()=>{input.clear();devices.clear();fireHeld=false;lastFrame=0;if(uiControls)uiControls.pressedAlias=null;});
document.addEventListener('visibilitychange',()=>{input.clear();devices.clear();fireHeld=false;lastFrame=0;});
async function startBattle(){
 if(movementPreview){await load();return;}
 const button=document.querySelector('#motion');let id=revision;button.disabled=true;
 try{
  await audio.unlock();if(id!==revision)return;
  if(debugMode&&!document.querySelector('#scene').value.endsWith('.level')){document.querySelector('#scene').value='data/levels/farm.level';await load();if(document.querySelector('#scene').value!=='data/levels/farm.level')return;id=revision;button.disabled=true;}
  const def=loaded.userData.levelDefinition;if(!def)return;status.textContent='Подготовка генераторов и танков…';if(!debugMode)loading('Подготовка танков и уровня…');
  const prepared=await NativeMissionPreview.prepare(def,definition,json),prototypes=new Map();
  if(!debugMode)prepared.globals={...prepared.globals,...interfaceFlow.globals};
  for(const object of prepared.definitions.values()){
   const path=children(object,'GameObjectView').at(-1)?.a.ModelName;
   if(path&&!prototypes.has(path))prototypes.set(path,await build(await json(path)));
  }
  await Promise.all([loaded,...prototypes.values()].map(model=>audio.prepare(model)));
  status.textContent='Подготовка графики и эффектов…';if(!debugMode)loading(status.textContent);await warmTextures();await lightPool.warm(renderer,camera,world,prototypes);
  if(id!==revision){for(const model of prototypes.values())disposeScene(model);return;}
  const models=new Map();
  const mission=new NativeMissionPreview(prepared,loaded.userData.field,{input:(actor,property)=>debugMode?actor.type==='Player'?input.direction:null:devices.direction(property),fire:(actor,property)=>debugMode?actor.type==='Player'&&fireHeld:devices.fire(property),exitState:actor=>{const model=models.get(actor.id);if(model)animateActor(actor,model);},spawn:actor=>{
   if(actor.offField){const model=loaded.getObjectByName(actor.nodeName);if(model)models.set(actor.id,model);}
   else if(actor.staticIndex!==undefined){const model=loaded.userData.placements[actor.staticIndex];if(model)models.set(actor.id,model);}
   else if(actor.modelPath){const model=prototypes.get(actor.modelPath).clone(true);model.userData.previewDynamic=true;model.traverse(o=>{if(o.geometry)o.userData.sharedGeometry=true;if(o.material)o.material=Array.isArray(o.material)?o.material.map(m=>m.clone()):o.material.clone();});models.set(actor.id,model);loaded.add(model);}
  },remove:actor=>{const model=models.get(actor.id);if(model){audio.remove(model);if(model.userData.previewDynamic){loaded.remove(model);disposeMaterials(model);}else model.visible=false;models.delete(actor.id);}}});
  movementPreview={mission,models,prototypes};
  if(!debugMode){interfaceFlow.globals=mission.world.globals;if(uiControls)uiControls.globals=interfaceFlow.globals;}input.clear();devices.clear();fireHeld=false;lastFrame=0;profiler.reset();
  button.textContent='Остановить проверку';badge.textContent='WASD / стрелки · пробел: огонь · тест боя по оригинальным определениям';status.textContent='Проверка боя';renderer.domElement.focus();
 }catch(error){if(!debugMode)throw error;if(id===revision){document.querySelector('#error').textContent=error.message;console.error(error);}}finally{if(id===revision)button.disabled=false;}
}
document.querySelector('#motion').onclick=startBattle;
function animateActor(actor,model){
 const p=actor.presentation;if(!p)return;
 const time=p.loop&&p.duration>0?p.elapsed%p.duration:Math.min(p.elapsed,p.duration);
 for(const track of animationTracks(p.clips,time)){
  let target=model;
  const parts=track.target.split('|');
  for(let i=0;i<parts.length;i++){
   const name=parts[i];
   if(name==='#AnyNode#'||name==='')continue;
   if(name==='#Shader#'){target=target.textMaterial??target.children.find(n=>n.isMesh)?.material;break;}
   if(name==='#Shaders#'){
    const materials=target.children.filter(n=>n.isMesh).flatMap(n=>Array.isArray(n.material)?n.material:[n.material]);target=materials.find(m=>m.name===parts[++i]);break;
   }
   target=findChild(target,name);if(!target)break;
  }
  if(!target)continue;
  if(target.isMaterial){if(track.param==='Emissive'&&target.isMeshBasicMaterial){target.color.fromArray(track.value);}else if(track.param==='Transparency'){target.opacity=1-track.value[0];target.transparent=true;target.depthWrite=target.opacity>=.999;}else if(track.param==='Diffuse')target.color.fromArray(track.value);else if(track.param==='Emissive')target.emissive.fromArray(track.value);}
  else if(track.param==='Text')target.setText?.(track.value);
  else if(track.param==='MorphWeight')applyMorph(target,track.value[0]);
  else if(track.param==='Position')target.position.fromArray(track.value);
  else if(track.param==='Rotation')rotate(target,track.value);
  else if(track.param==='Scale')target.scale.fromArray(track.value);
  else if(track.param==='Visibility')target.visible=track.value[0]!==0;
  else if(track.param==='Intensity'){if(target.userData.pointLight)target.userData.pointLight.intensity=track.value[0];else for(const child of target.children)if(child.isLight)child.intensity=track.value[0];}
 }
 const previous=p.commandTime??-Number.EPSILON;
 for(const command of animationCommands(p.clips,previous,p.elapsed,p.duration,p.loop)){
  let target=model;for(const name of command.target.split('|')){target=findChild(target,name);if(!target)break;}
  if(target?.userData.sound){if(command.name==='Play')audio.play(target,target.getWorldPosition(new T.Vector3())).catch(error=>{document.querySelector('#error').textContent=error.message;});else if(command.name==='Stop')audio.stop(target);}
 }
 p.commandTime=p.elapsed;
}
function applyMorph(target,weight){
 const mesh=target.children.find(n=>n.isMesh&&n.userData.morph);if(!mesh)return;const morph=mesh.userData.morph;if(morph.weight===weight)return;
 if(!morph.owned){const shared=mesh.geometry;mesh.geometry=shared.clone();if(!mesh.userData.sharedGeometry)shared.dispose();morph.owned=true;}
 for(const [name,key,size]of [['position','Positions',3],['normal','Normals',3],['uv','UV0',2]]){const a=morph.base[key],b=morph.target[key];if(!a||!b)continue;if(a.length!==b.length)throw Error('Original morph array sizes differ');const array=mesh.geometry.getAttribute(name)?.array;if(!array)continue;for(let i=0;i<a.length;i++)array[i]=a[i]+(b[i]-a[i])*weight;mesh.geometry.getAttribute(name).needsUpdate=true;}
 mesh.geometry.computeBoundingBox();mesh.geometry.computeBoundingSphere();morph.weight=weight;
}
function findChild(target,name){const direct=target.children.find(n=>n.name===name);if(direct)return direct;for(const child of target.children)if(child.userData.sceneRoot){const found=findChild(child,name);if(found)return found;}return null;}
renderer.setAnimationLoop(now=>{music.updateMute();if(viewLoading){lastFrame=0;return;}const frameStart=performance.now();let simulationMs=0;const dt=Math.fround(lastFrame?(now-lastFrame)/1000:0);lastFrame=document.hidden?0:now;
 if(movementPreview&&!document.hidden){try{
  const p=movementPreview;const simStart=performance.now();p.mission.step(dt);simulationMs=performance.now()-simStart;
  for(const actor of p.mission.world.actors){const model=p.models.get(actor.id);if(model){if(!actor.offField)place(model,actor.position,actor.nativeMask,loaded.userData.basis);animateActor(actor,model);}}
  const player=p.mission.tanks.find(a=>a.type==='Player');
  if(player&&p.models.has(player.id))audio.updateListener(p.models.get(player.id).getWorldPosition(new T.Vector3()));audio.updateSources();
  renderer.domElement.dataset.position=JSON.stringify(player?.position??null);
  renderer.domElement.dataset.worldPosition=JSON.stringify(player?p.models.get(player.id)?.position.toArray():null);
  renderer.domElement.dataset.actors=JSON.stringify(p.mission.tanks.map(a=>({id:a.id,type:a.type,state:a.stateName,position:a.position})));
  renderer.domElement.dataset.globals=JSON.stringify(p.mission.world.globals);
  renderer.domElement.dataset.episodeLink=JSON.stringify(p.mission.requestedLink??null);
  renderer.domElement.dataset.audioPlays=String(audio.playCount);
  renderer.domElement.dataset.missionTime=String(p.mission.world.time);
  const g=p.mission.world.globals,stats=document.querySelector('#combat-stats'),summary=`Счёт: ${g.Score??0} · Жизни: ${g.Lives??0} · HP: ${g.HitPoints??0}/${g.HitPointsMax??0} · Враги: ${g.TankCountEnemy??0}`;stats.hidden=false;if(stats.textContent!==summary)stats.textContent=summary;
  if(g.MissionStatus&&status.textContent!==g.MissionStatus)status.textContent=g.MissionStatus;
  renderer.domElement.dataset.frameSeconds=String(dt);
 }catch(error){document.querySelector('#error').textContent=error.message;console.error(error);stopPreview();}}
 if(!debugMode&&interfaceFlow?.current){
  const screen=interfaceFlow.current;screen.elapsed+=dt;
  if(screenAnimation){screenAnimation.presentation.elapsed+=dt;animateActor(screenAnimation,loaded);}
  uiControls?.update(dt);syncNativeCamera();if(hudRoot){hudRoot.updateMatrixWorld(true);nativeCamera(hudCameraNode,hudCamera);if(hudAnimation){hudAnimation.presentation.elapsed+=dt;animateActor(hudAnimation,hudRoot);}}uiControls?.project(hudRoot?hudCamera:camera,viewport.clientWidth,viewport.clientHeight);
  const request=movementPreview?.mission.requestedLink;if(request&&!request.handled&&!interfaceFlow.busy){request.handled=true;interfaceFlow.link(request.name).catch(showError);}
 }
 if(debugMode)controls.update();if(lightPool.warming)return;lightPool.attach(world);lightPool.update(world);const renderStart=performance.now();renderer.info.reset();renderer.render(world,camera);if(hudScene){renderer.autoClear=false;renderer.clearDepth();renderer.render(hudScene,hudCamera);renderer.autoClear=true;}const renderMs=performance.now()-renderStart;
 profiler.record({frameMs:performance.now()-frameStart,intervalMs:dt*1000,simulationMs,renderMs,programs:renderer.info.programs.length,calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,actors:movementPreview?.mission.world.actors.length??0,models:movementPreview?.models.size??0,voices:audio.voices.size,lights:lightPool.sources.length,lightCapacity:lightPool.capacity});
 if(now-lastProfile>500){renderer.domElement.dataset.profile=JSON.stringify(profiler.summary());renderer.domElement.dataset.music=JSON.stringify(music.snapshot());lastProfile=now;}
});
async function init(){const cat=await fetch('assets/catalog.json').then(r=>r.json());catalog=cat;profile.seed(await fetch('assets/ui-defaults.json').then(r=>r.ok?r.json():{}));if(!debugMode){await interfaceFlow.open('data/interface/mainmenu.screen');return;}const select=document.querySelector('#scene'),group=document.createElement('optgroup');group.label='Оригинальные карты';for(const path of cat.definitions.filter(p=>p.endsWith('.level')&&!p.includes('/surv/'))){const data=await json(path);if(data.a.ModelName&&descendants(data,'Object').length){const option=document.createElement('option');option.value=path;option.textContent=descendants(data,'Property').find(p=>p.a.Name==='LevelName')?.a.Value||path.split('/').pop().replace('.level','');group.append(option);}}select.append(group);if(debugMode)await load();else await interfaceFlow.open('data/interface/mainmenu.screen');}
function showError(error){viewLoading=false;finishLoading();document.querySelector('#error').textContent=error.message;document.body.classList.add('has-error');console.error(error);}
function syncNativeCamera(){
 if(!screenCamera)return;loaded.updateMatrixWorld(true);
 nativeCamera(screenCamera,camera);
}
function nativeCamera(node,target){
 if(!node)return;const a=node.userData.camera;
 const matrix=node.matrixWorld.clone().multiply(new T.Matrix4().makeScale(1,1,-1));
 matrix.decompose(target.position,target.quaternion,new T.Vector3());target.scale.set(1,1,1);
 target.fov=Number(a.Fov)*180/Math.PI;target.near=Number(a.NearPlane??.5);target.far=Number(a.FarPlane??200);target.aspect=4/3;target.updateProjectionMatrix();target.updateMatrixWorld(true);
}
function captureView(screen){screen.view={world,loaded,movementPreview,uiControls,screenAnimation,screenCamera,hudRoot,hudScene,hudCameraNode,hudAnimation,pausedAudio:audio.pauseAll()};uiControls?.hide();}
function disposeView(view){view.uiControls?.dispose();if(view.movementPreview){view.movementPreview.mission.dispose();for(const p of view.movementPreview.prototypes.values())disposeScene(p);}disposeScene(view.world);if(view.hudScene)disposeScene(view.hudScene);}
let activeScreen=null;const suspendedScreens=[];
async function displayScreen(screen,{push}){
 viewLoading=true;loading(screen.path.endsWith('.level')?'Загрузка уровня…':'Загрузка интерфейса…');renderer.domElement.dataset.phase='loading';
 const previous=activeScreen;
 if(push&&previous){captureView(previous);movementPreview=null;suspendedScreens.push(previous);}
 else{
  uiControls?.dispose();stopPreview();disposeScene(world);if(hudScene)disposeScene(hudScene);
  for(const old of suspendedScreens){if(old.view){disposeView(old.view);old.view=null;}}suspendedScreens.length=0;
 }
 activeScreen=screen;uiControls=null;screenCamera=null;screenAnimation=null;hudRoot=null;hudScene=null;hudCameraNode=null;hudAnimation=null;audio.stopAll();input.clear();devices.clear();fireHeld=false;lastFrame=0;
 document.querySelector('#error').textContent='';document.body.classList.remove('has-error');status.textContent='Загрузка…';
 const def=screen.definition,isLevel=screen.path.endsWith('.level');
 loaded=isLevel?await level(screen.path):await build(await json(def.a.ModelName));world=new T.Scene();loaded.scale.x*=-1;world.add(loaded);lightPool.attach(world);
 if(isLevel)document.querySelector('#scene').value=screen.path;
 loaded.traverse(node=>{if(node.userData.camera&&(!screenCamera||node.name==='Camera'))screenCamera=node;});
 if(!screenCamera)throw Error('Original screen camera is missing: '+screen.path);
 if(def.a.AnimationName)screenAnimation={presentation:presentation([await json(def.a.AnimationName)])};
 loading('Загрузка звуков…');await audio.prepare(loaded);
 if(def.a.InterfaceModelName){hudRoot=await build(await json(def.a.InterfaceModelName));hudRoot.scale.x*=-1;hudScene=new T.Scene();hudScene.add(hudRoot);hudRoot.traverse(n=>{if(n.userData.camera)hudCameraNode=n;});if(def.a.InterfaceAnimationName)hudAnimation={presentation:presentation([await json(def.a.InterfaceAnimationName)])};}
 uiControls=new ScreenControls({definition:def,root:hudRoot??loaded,globals:interfaceFlow.globals,read:json,exists:path=>catalog.animations.includes(resourcePath(path))||catalog.scenes.includes(resourcePath(path)),animate:animateActor,activate:c=>interfaceFlow.activate(c),profile,build:async node=>{const model=await build(node);await warmTextures();return model;},overlay,onError:showError});
 loading('Подготовка графики…');await uiControls.prepare();await warmTextures();syncNativeCamera();lightPool.update(world);await renderer.compileAsync(world,camera);uiControls.project(camera,viewport.clientWidth,viewport.clientHeight);
 if(hudScene){hudRoot.updateMatrixWorld(true);nativeCamera(hudCameraNode,hudCamera);await renderer.compileAsync(hudScene,hudCamera);}
 viewport.style.cursor='none';document.querySelector('#original-cursor').hidden=!def.a.Cursor;
 renderer.domElement.dataset.screen=screen.path;status.textContent='';
 if(isLevel)await startBattle();music.select(def.a.Music).catch(reportMusicError);viewLoading=false;lastFrame=0;renderer.domElement.dataset.phase=isLevel?'battle':'menu';finishLoading();
}
interfaceFlow=new InterfaceFlow({resolve:definition,storage:localStorage,show:displayScreen,restore:async screen=>{
 uiControls?.dispose();disposeScene(world);if(hudScene)disposeScene(hudScene);const view=screen.view;if(!view)throw Error('Paused screen is missing');
 ({world,loaded,movementPreview,uiControls,screenAnimation,screenCamera,hudRoot,hudScene,hudCameraNode,hudAnimation}=view);screen.view=null;activeScreen=screen;suspendedScreens.pop();
 input.clear();devices.clear();fireHeld=false;lastFrame=0;syncNativeCamera();renderer.domElement.dataset.screen=screen.path;renderer.domElement.dataset.phase=movementPreview?'battle':'menu';
 await audio.resume(view.pausedAudio);viewport.style.cursor='none';document.querySelector('#original-cursor').hidden=!screen.definition.a.Cursor;
 music.select(screen.definition.a.Music,{resume:true}).catch(reportMusicError);
},exit:async()=>{
 uiControls?.dispose();uiControls=null;stopPreview();audio.stopAll();music.dispose();for(const old of suspendedScreens)if(old.view)disposeView(old.view);suspendedScreens.length=0;
 disposeScene(world);if(hudScene)disposeScene(hudScene);world=new T.Scene();loaded=null;screenCamera=null;screenAnimation=null;activeScreen=null;hudScene=null;hudRoot=null;hudCameraNode=null;hudAnimation=null;
 document.querySelector('#original-cursor').hidden=true;viewport.style.cursor='default';renderer.domElement.dataset.phase='exit';renderer.setAnimationLoop(null);renderer.setClearColor(0);renderer.clear();renderer.dispose();await audio.context?.close();
}});
window.addEventListener('keydown',event=>{
 if(debugMode||interfaceFlow.busy)return;
 if(uiControls?.key(event)){event.preventDefault();return;}
 if(event.code==='Escape'&&movementPreview){event.preventDefault();interfaceFlow.link(activeScreen.definition.a.GameMenuLink??'data/interface/gamemenu.screen',{push:true}).catch(showError);}
},true);
window.addEventListener('keyup',event=>{if(!debugMode&&!interfaceFlow.busy&&uiControls?.key(event))event.preventDefault();},true);
function reportMusicError(error){if(!music.disposed)showError(error);}
viewport.addEventListener('pointermove',event=>{const r=viewport.getBoundingClientRect(),cursor=document.querySelector('#original-cursor');cursor.style.left=(event.clientX-r.left)+'px';cursor.style.top=(event.clientY-r.top)+'px';});
viewport.addEventListener('pointerdown',()=>audio.unlock().catch(showError),{once:true});
window.addEventListener('keydown',()=>audio.unlock().catch(showError),{once:true});
loading('Чтение ресурсов…');init().then(()=>{if(debugMode)finishLoading();}).catch(showError);



