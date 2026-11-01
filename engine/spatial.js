// Reconstructed behavior of native Mask/Field, not exported game source.
const deltas=[[0,-1],[1,0],[0,1],[-1,0]];

export class NativeMask {
 constructor(text){
  this.bits=[];this.width=0;
  for(const char of text){
   if(char==='0'||char==='1')this.bits.push(char==='1');
   else if(this.width===0)this.width=this.bits.length;
   else if(this.bits.length%this.width!==0)throw Error('Bad mask dimensions');
  }
  this.height=this.width===0?1:Math.trunc(this.bits.length/this.width);
  if(this.width===0)this.width=this.bits.length;
  // The original bit vector is resized to the string length, including separators.
  this.count=text.length;
 }
 size(direction){return direction%2===0?[this.width,this.height]:[this.height,this.width];}
 visit({x,y,direction},fieldWidth,fieldHeight,callback){
  if(!Number.isInteger(direction)||direction<0||direction>3)throw Error('Invalid direction');
  for(let i=0;i<this.count;i++){
   const column=i%this.width,row=Math.floor(i/this.width);
   let dx,dy;
   switch(direction){
    case 0:dx=column;dy=row;break;
    case 1:dx=this.height-row-1;dy=column;break;
    case 2:dx=this.width-column-1;dy=this.height-row-1;break;
    case 3:dx=row;dy=this.width-column-1;break;
   }
   const px=x+dx,py=y+dy;
   if(px>=0&&py>=0&&px<fieldWidth&&py<fieldHeight&&callback(px,py,this.bits[i]===true))break;
  }
 }
}

export class NativeField {
 constructor(width,height){this.width=width;this.height=height;this.cells=new Map();this.objects=new Map();this.onContact=null;}
 replace(id,mask,position){
  this.remove(id);
  if(mask)this.contacts(id,mask,position,this.width*this.height);
  this.insert(id,mask,position);
 }
 remove(id){
  const previous=this.objects.get(id);
  if(previous)previous.mask.visit(previous.position,this.width,this.height,(x,y,active)=>{
   const key=y*this.width+x;if(active&&this.cells.get(key)===id)this.cells.delete(key);return false;
  });
  this.objects.delete(id);
 }
 insert(id,mask,position){
  if(mask){
   this.objects.set(id,{mask,position:{...position}});
   mask.visit(position,this.width,this.height,(x,y,active)=>{
    const key=y*this.width+x;if(active&&!this.cells.has(key))this.cells.set(key,id);return false;
   });
  }
 }
 move(id,mask,position){this.remove(id);this.insert(id,mask,position);}
 contacts(id,mask,position,limit=1){
  const objects=[];
  mask.visit(position,this.width,this.height,(x,y,active)=>{
   const owner=this.cells.get(y*this.width+x);
   if(active&&owner!==undefined&&owner!==id){objects.push(owner);this.onContact?.(id,owner);return objects.length>=limit;}
   return false;
  });
  return objects;
 }
 query(id,mask,position){
  const [width,height]=mask.size(position.direction);
  if(position.x<0||position.y<0||position.x+width>this.width||position.y+height>this.height)return {boundary:true,objects:[]};
  return {boundary:false,objects:this.contacts(id,mask,position)};
 }
 canEnter(id,mask,position){const hit=this.query(id,mask,position);return !hit.boundary&&hit.objects.length===0;}
}

export function collisionEvents(moving,occupant){
 return [{actor:occupant,name:'Collision'+moving.type+moving.stateName,source:moving},
  {actor:moving,name:'Collision'+occupant.type+occupant.stateName,source:occupant}];
}

// Fire visitor creates an object one cell ahead of every active fire-mask cell,
// preserving the shooter's remaining travel (0x480ae0).
export function firePositions(mask,position,fieldWidth,fieldHeight,bulletDirection=position.direction){
 const result=[],[dx,dy]=deltas[bulletDirection];
 mask.visit(position,fieldWidth,fieldHeight,(x,y,active)=>{
  if(active)result.push({x:x+dx,y:y+dy,direction:bulletDirection,progress:position.progress,divisor:4,angle:0});return false;
 });
 return result;
}
