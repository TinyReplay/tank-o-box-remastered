const screen=document.querySelector('#loading-screen');
const message=document.querySelector('#loading-message');
let timer=null,active=false,visible=true,view=null,progress=0;
let shown=0,frame=null,lastTime=0;
function tick(now){
 const dt=lastTime?Math.min(.1,(now-lastTime)/1000):0;lastTime=now;
 shown+=(progress-shown)*(1-Math.exp(-dt/0.09));
 if(!screen.hidden)view?.render(shown);
 frame=requestAnimationFrame(tick);
}
export function installLoadingView(nativeView){
 view=nativeView;screen.prepend(view.canvas);screen.classList.add('native-loading');view.render(shown);frame=requestAnimationFrame(tick);
}
export function loading(messageText,options={}){
 if(options.visible!==undefined)visible=options.visible;
 if(options.progress!==undefined)progress=options.progress;
 else if(!active){progress=0;shown=0;lastTime=0;}
 message.textContent=messageText;
 if(!active){active=true;if(visible&&screen.hidden)timer=setTimeout(()=>{screen.hidden=false;view?.render(shown);},450);}
 document.querySelector('#viewport').inert=true;
}
export async function loaded({immediate=false}={}){
 if(!immediate&&!screen.hidden&&view){progress=1;await new Promise(resolve=>setTimeout(resolve,180));}
 clearTimeout(timer);timer=null;active=false;visible=true;
 screen.hidden=true;
 document.querySelector('#viewport').inert=false;
}
export function disposeLoadingView(){
 clearTimeout(timer);cancelAnimationFrame(frame);view?.dispose?.();view?.canvas.remove();view=null;
}
