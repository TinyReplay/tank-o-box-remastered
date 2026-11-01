const screen=document.querySelector('#loading-screen');
const message=document.querySelector('#loading-message');
export function loading(messageText){
 message.textContent=messageText;
 screen.hidden=false;
 document.querySelector('#viewport').inert=true;
}
export function loaded(){
 screen.hidden=true;
 document.querySelector('#viewport').inert=false;
}
