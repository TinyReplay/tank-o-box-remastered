const f=Math.fround;
const deltas=[[0,-1],[1,0],[0,1],[-1,0]];
const angles=[f(Math.PI),f(Math.PI/2),0,f(-Math.PI/2)];

// Native Position::world (0x484c20): the anchor is a mask corner, not a model origin.
export function nativePlacement(position,mask,{corner=[22.5,0,-22.5],vectorX=[-1,0,0],vectorY=[0,0,1]}={}){
 const {x,y,direction,progress=0,angle=0}=position,[dx,dy]=deltas[direction];
 const [width,height]=mask?mask.size(direction):[0,0];
 const ox=f(f(width*.5)+f(dx*-progress)),oy=f(f(height*.5)+f(dy*-progress));
 return {
  position:corner.map((value,i)=>f(f(f(f(value+f(vectorX[i]*x))+f(vectorY[i]*y))+f(vectorX[i]*ox))+f(vectorY[i]*oy))),
  rotation:[0,f(angles[direction]-f(f(angle)*f(1.57))),0],
 };
}

// Native movement selects the tail of the pressed-direction list (0x47efc0).
export class NativeDirectionInput {
 constructor(){this.keys=new Map();}
 down(code,direction){if(!this.keys.has(code))this.keys.set(code,direction);}
 up(code){this.keys.delete(code);}
 clear(){this.keys.clear();}
 get direction(){return [...this.keys.values()].at(-1)??null;}
}

// Native row-vector Euler matrix (0x461d80), stored as Three.js column-major.
// Reusing the native angles as Three Euler angles reverses tank headings.
export function nativeEulerMatrix([x,y,z]){
 const cx=f(Math.cos(x)),sx=f(Math.sin(x)),cy=f(Math.cos(y)),sy=f(Math.sin(y)),cz=f(Math.cos(z)),sz=f(Math.sin(z));
 return [f(cy*cz),f(cy*sz),sy,0,
  f(-f(f(cz*sx)*sy)-f(cx*sz)),f(f(cx*cz)-f(f(sx*sy)*sz)),f(sx*cy),0,
  f(f(sx*sz)-f(f(cx*sy)*cz)),f(-f(f(cx*sy)*sz)-f(sx*cz)),f(cx*cy),0,
  0,0,0,1];
}
