import {children,properties,scalar} from './definitions.js?v=2f94353fbe10d5bf';
export const resourcePath=p=>p.replaceAll('\\','/').toLowerCase();

// Data-driven screen/episode navigation. Rendering and paused scene ownership
// are host operations; all links stay inside the user's imported resources.
export class InterfaceFlow {
 constructor({resolve,show,restore,exit,storage}){Object.assign(this,{resolve,show,restore,exit,storage});this.globals={};this.stack=[];this.current=null;this.episode=null;this.node=null;this.busy=false;}
 async open(path,{push=false,options={}}={}){
  path=resourcePath(path);const definition=await this.resolve(path);
  if(definition.tag==='InterfaceScreenGame'){
   Object.assign(this.globals,properties(definition),options);
   const episodePath=this.globals.EpisodeLink;if(!episodePath)throw Error('EpisodeLink is empty');
   this.episode=await this.resolve(resourcePath(episodePath));Object.assign(this.globals,properties(this.episode));
   this.node=children(this.episode,'EpisodeNode').find(n=>n.a.GraphNodeName===String(this.globals.GraphNodeName||'Start'));
   if(!this.node)throw Error('Unknown episode start: '+this.globals.GraphNodeName);
   return this.open(this.node.a.ScreenName);
  }
  if(push&&this.current)this.stack.push(this.current);
  else if(!push)this.stack=[];
  Object.assign(this.globals,properties(definition),options);
  if(definition.tag==='InterfaceScreenMenuScore')applyScoreSummary(this.globals);
  const screen={path,definition,elapsed:0};this.current=screen;
  await this.show(screen,{push});return screen;
 }
 async link(link,{push=false,options={}}={}){
  if(this.busy||!link)return;this.busy=true;
  try{
   Object.assign(this.globals,options);
   if(link==='Return'){const previous=this.stack.pop();if(previous){this.current=previous;await this.restore(previous);}return;}
   if(link==='Exit'){this.stack=[];this.current=null;await this.exit();return;}
   if(link==='Restart'&&this.node)return await this.open(this.node.a.ScreenName);
   if(link==='Next'||link==='GameOver'){
    if(!this.episode||!this.node)throw Error('Episode link outside an episode: '+link);
    const edge=children(this.node,'Links').flatMap(n=>children(n,'Link')).find(n=>n.a.Name===link);
    const destination=edge?.a.GraphNodeName;
    if(destination&&destination!=='GameOver'){
     const next=children(this.episode,'EpisodeNode').find(n=>n.a.GraphNodeName===destination);
     if(!next)throw Error('Unknown episode node: '+destination);
     this.node=next;this.globals.GraphNodeName=destination;return await this.open(next.a.ScreenName);
    }
    if(link==='GameOver'||destination==='GameOver'){if(this.episode.a.GameOverLink)return await this.open(this.episode.a.GameOverLink);return;}
    throw Error('Missing original episode link: '+link);
   }
   return await this.open(link,{push,options});
  }finally{this.busy=false;}
 }
 async activate(control){const a=control.a;if(!controlEnabled(a,this.globals))return;
  const options=a.OptionName?{[a.OptionName]:scalar(a.OptionValue)}:{};
  const link=a.SelectLinkPropertyName&&Number(this.globals[a.SelectLinkPropertyName]??0)<=0?a.Link2:a.Link;
  if(link)await this.link(link,{push:a.PushScreen==='true',options});
 }
}

// ControlButton::process (0x43b300) tests an empty property string, not numeric
// truthiness. Password removes EpisodeLink when no table entry matches.
export function controlEnabled(a,globals){return !a.PropertyEnabledName||String(globals[a.PropertyEnabledName]??'')!=='';}
export function passwordEntry(control,text){return children(control,'Entry').find(n=>n.a.Password.toLowerCase()===text.toLowerCase());}
export function applyPassword(control,text,globals){const entry=passwordEntry(control,text);for(const key of ['EpisodeName','EpisodeLink','GraphNodeName','LevelName']){if(entry)globals[key]=entry.a[key]??'';else delete globals[key];}return !!entry;}

export function applyScoreSummary(g){
 const score=Number(g.Score??0)|0,bonus=Number(g.ScoreBonus??0)|0,total=Number(g.ScoreTotal0??0)|0,cost=Number(g.ScoreLifeCost??500)|0;
 if(cost<=0)throw Error('Invalid original ScoreLifeCost');
 const added=(score+bonus)|0,newTotal=(total+added)|0,extra=Math.trunc((((total%cost)+added)|0)/cost);
 Object.assign(g,{Score:0,ScoreBonus:0,ScoreTotal0:newTotal,Lives:((Number(g.Lives??0)|0)+extra)|0,MenuScore:score,MenuScoreBonus:bonus,MenuScoreTotal:newTotal,MenuScoreLives:extra});
}

export class LocalProfile {
 constructor(storage){this.storage=storage;try{this.data=JSON.parse(storage?.getItem('tank-o-box-profile-v1')??'{}');}catch{this.data={};}if(!this.data||typeof this.data!=='object'||Array.isArray(this.data))this.data={};for(const key of ['settings','scores'])if(!this.data[key]||typeof this.data[key]!=='object'||Array.isArray(this.data[key]))this.data[key]={};}
 save(){try{this.storage?.setItem('tank-o-box-profile-v1',JSON.stringify(this.data));}catch{/* Storage may be disabled; keep this session usable. */}}
 seed(defaults){
  for(const key of ['Player1InputDevice','Player2InputDevice'])if(this.data.settings[key]===undefined&&defaults[key])this.data.settings[key]=defaults[key];
  if(this.data.settings.MusicMute===undefined&&defaults.MusicFlag!==undefined)this.data.settings.MusicMute=Number(defaults.MusicFlag)===0;
  for(const [players,suffix]of [[1,''],[2,'2C']])if(this.data.scores[players]===undefined){const rows=[];for(let i=0;i<10;i++)if(defaults['ScoreTableScore'+suffix+i]!==undefined)rows.push({name:defaults['ScoreTableNick'+suffix+i]??'',score:Number(defaults['ScoreTableScore'+suffix+i])});this.data.scores[players]=rows;}
 }
 set(key,value){this.data.settings[key]=value;this.save();}
 scores(players){const rows=this.data.scores[String(players)];return Array.isArray(rows)?rows.filter(r=>r&&typeof r.name==='string'&&Number.isFinite(r.score)):[];}
 record(players,name,score){const rows=this.scores(players);rows.push({name:String(name).slice(0,20),score:Number(score)||0});rows.sort((a,b)=>b.score-a.score);this.data.scores[String(players)]=rows.slice(0,10);this.save();}
}
