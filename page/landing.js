// Shared gallery behaviour for game detail pages. The game runtime lives in
// play.html and is deliberately never imported or prefetched on this page.
const shots=[...document.querySelectorAll('.gallery .shot')];
const viewer=document.querySelector('.lightbox'),image=viewer.querySelector('.viewer-image');
let current=0;
function show(index){
 current=(index+shots.length)%shots.length;
 image.src=shots[current].href;image.alt=shots[current].querySelector('img').alt;
 document.querySelector('#viewer-counter').textContent=String(current+1).padStart(2,'0')+' / '+String(shots.length).padStart(2,'0');
}
document.querySelectorAll('[data-shot]').forEach(trigger=>trigger.addEventListener('click',event=>{
 event.preventDefault();show(Number(trigger.dataset.shot));viewer.showModal();document.body.classList.add('no-scroll');
}));
shots.forEach((thumbnail,index)=>thumbnail.addEventListener('click',event=>{
 event.preventDefault();document.querySelector('#main-image').src=thumbnail.href;
 document.querySelector('.main-shot').dataset.shot=String(index);
 for(const shot of shots)shot.removeAttribute('aria-current');thumbnail.setAttribute('aria-current','true');
}));
viewer.querySelector('[data-close]').addEventListener('click',()=>viewer.close());
viewer.querySelector('[data-prev]').addEventListener('click',()=>show(current-1));
viewer.querySelector('[data-next]').addEventListener('click',()=>show(current+1));
viewer.addEventListener('close',()=>document.body.classList.remove('no-scroll'));
viewer.addEventListener('click',event=>{if(event.target===viewer){const r=viewer.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)viewer.close();}});
viewer.addEventListener('keydown',event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();show(current+(event.key==='ArrowLeft'?-1:1));}});
// The back arrow intentionally has no navigation handler until the catalogue exists.
