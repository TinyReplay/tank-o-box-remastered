import * as T from 'three';

// Text::on_change_text, 0x467a60. Native glyphs advance toward negative X;
// the imported left-handed scene is reflected once by the renderer.
export function layoutText(font,text,alignment='LEFT'){
 const a=font.a,size=Number(a.Size),width=Number(a.Width),height=Number(a.Height),f=Math.fround,factor=f(1/f(size/height));
 const letters=new Map(font.c.filter(n=>n.tag==='Letter').map(n=>[Number(n.a.Code),n.a]));
 const glyphs=Array.from(String(text),c=>letters.get(c.charCodeAt(0))??letters.get(0)??{Width:0,Height:0,BaseWidth:0,X:0,Y:0});
 const advance=g=>f(f(Number(g.BaseWidth)/height)*factor),total=glyphs.reduce((s,g)=>f(s+advance(g)),0);
 let x=alignment==='CENTER'?f(total/2):alignment==='RIGHT'?total:0;
 const positions=[],uvs=[];const bottom=f(-1-f(factor*f(Number(a.Base)/height)));
 for(const g of glyphs){
  // The original uses signed integer division for this offset.
  const left=f(x-f(Math.trunc(Number(g.BaseSkip??0)/width)*factor)),right=f(left+f(f(-Number(g.Width)/height)*factor)),top=f(bottom+f(f(Number(g.Height)/height)*factor));
  const u=f(f(Number(g.X)+.5)/width),dh=f((Number(g.Height)-1)/height),v=f(f(1-f(f(Number(g.Y)+.5)/height))-dh);
  const u1=f(u+f((Number(g.Width)-1)/width)),v1=f(v+dh);
  positions.push(left,bottom,0,left,top,0,right,bottom,0,right,bottom,0,left,top,0,right,top,0);
  uvs.push(u,v,u,v1,u1,v,u1,v,u,v1,u1,v1);x=f(x-advance(g));
 }
 return {positions,uvs,width:total};
}

export class BitmapText extends T.Group {
 constructor(font,atlas,attributes){
  super();this.userData.text=attributes;this.font=font;this.value=null;
  this.textMaterial=new T.MeshBasicMaterial({map:atlas,color:0xffffff,transparent:true,side:T.DoubleSide,depthWrite:false,depthTest:false,alphaTest:1/255,toneMapped:false});
  this.textMaterial.name='#Shader#';this.mesh=new T.Mesh(new T.BufferGeometry(),this.textMaterial);this.mesh.renderOrder=1000;this.add(this.mesh);this.setText(attributes.Text??'');
 }
 setText(value){value=String(value??'');if(value===this.value)return;this.value=value;
  const layout=layoutText(this.font,value,this.userData.text.Alignment),g=new T.BufferGeometry();
  g.setAttribute('position',new T.Float32BufferAttribute(layout.positions,3));g.setAttribute('uv',new T.Float32BufferAttribute(layout.uvs,2));g.computeBoundingBox();g.computeBoundingSphere();
  this.mesh.geometry.dispose();this.mesh.geometry=g;
 }
}
