const screen=document.querySelector('#loading-screen');
const message=document.querySelector('#loading-message');
let timer=null,active=false,visible=true;
export function loading(messageText,options={}){
 if(options.visible!==undefined)visible=options.visible;
 message.textContent=messageText;
 if(!active){active=true;if(visible&&screen.hidden)timer=setTimeout(()=>{screen.hidden=false;},450);}
 document.querySelector('#viewport').inert=true;
}
export function loaded(){
 clearTimeout(timer);timer=null;active=false;visible=true;
 screen.hidden=true;
 document.querySelector('#viewport').inert=false;
}
