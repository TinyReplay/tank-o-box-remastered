export function children(node,tag){return node.c.filter(n=>n.tag===tag);}
export function descendants(node,tag){return [...(node.tag===tag?[node]:[]),...node.c.flatMap(n=>descendants(n,tag))];}
export function values(attributes,key){return Object.entries(attributes).filter(([k])=>k===key||k.startsWith(key+'__')).map(([,v])=>v);}
export function scalar(value){if(typeof value!=='string')return value;return value.trim()!==''&&Number.isFinite(Number(value))?Number(value):value;}
export function properties(node){return Object.fromEntries(children(node,'Properties').flatMap(n=>n.c).filter(n=>n.tag==='Property').map(n=>[n.a.Name,scalar(n.a.Value)]));}
const sections=new Set(['Properties','Strategies','EventHandlers','GameObjectStates','Controls','Level']);
function merge(a,b){
 const result={tag:b.tag,a:{...a.a,...b.a},c:a.c.map(n=>structuredClone(n))};
 for(const n of b.c){const index=sections.has(n.tag)?result.c.findIndex(x=>x.tag===n.tag):-1;if(index<0){result.c.push(structuredClone(n));continue;}
  const old=result.c[index];
  if(n.tag==='Properties'){
   for(const p of n.c){const i=old.c.findIndex(x=>x.a.Name===p.a.Name);if(i<0)old.c.push(structuredClone(p));else old.c[i]=structuredClone(p);}
  }else if(n.tag==='GameObjectStates'){
   for(const s of n.c){const i=old.c.findIndex(x=>x.a.Name===s.a.Name);if(i<0)old.c.push(structuredClone(s));else old.c[i]=merge(old.c[i],s);}
  }else{old.a={...old.a,...n.a};old.c.push(...structuredClone(n.c));}
 }
 return result;
}
export class DefinitionRepository {
 constructor(read){this.read=read;this.cache=new Map();}
 async resolve(path,ancestors=[]){
  path=path.replaceAll('\\','/').toLowerCase();if(ancestors.includes(path))throw Error('Template cycle: '+[...ancestors,path].join(' -> '));
  if(this.cache.has(path))return structuredClone(await this.cache.get(path));
  const promise=this.expand(await this.read(path),[...ancestors,path]);this.cache.set(path,promise);
  try{return structuredClone(await promise);}catch(e){this.cache.delete(path);throw e;}
 }
 async expand(node,ancestors){
  let result={tag:node.tag,a:{},c:[]};
  for(const path of values(node.a,'TemplateName'))result=merge(result,await this.resolve(path,ancestors));
  const own={tag:node.tag,a:{...node.a},c:[]};
  // TemplateName on StrategyGenerator/Fire identifies a new object; it is not inheritance.
  for(const child of node.c){if(child.tag.startsWith('Strategy')||child.tag==='Object'||child.tag==='OffFieldObject')own.c.push(structuredClone(child));else own.c.push(await this.expand(child,ancestors));}
  return merge(result,own);
 }
}
