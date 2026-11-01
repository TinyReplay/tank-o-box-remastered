const screen=document.querySelector('#loading-screen');
const message=document.querySelector('#loading-message');
let timer=null,active=false,visible=true,view=null,progress=0;
export function installLoadingView(nativeView){
 view=nativeView;screen.prepend(view.canvas);screen.classList.add('native-loading');view.render(progress);
}
export function loading(messageText,options={}){
 if(options.visible!==undefined)visible=options.visible;
 if(options.progress!==undefined)progress=options.progress;
 else if(!active)progress=0;
 message.textContent=messageText;
 if(!active){active=true;if(visible&&screen.hidden)timer=setTimeout(()=>{screen.hidden=false;view?.render(progress);},450);}
 if(!screen.hidden)view?.render(progress);
 document.querySelector('#viewport').inert=true;
}
export function loaded(){
 clearTimeout(timer);timer=null;active=false;visible=true;
 screen.hidden=true;
 document.querySelector('#viewport').inert=false;
}
export function disposeLoadingView(){
 clearTimeout(timer);view?.dispose?.();view?.canvas.remove();view=null;
}
