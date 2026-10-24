(()=>{'use strict';
const pages=[...document.querySelectorAll('.book-page')], toc=[...document.querySelectorAll('.toc>a[data-start]')], state=document.getElementById('pageState'), stack=document.getElementById('pageStack');
let scale=100,current=1;
function updateScale(){ const pct=scale/100; stack.querySelectorAll('.book-page').forEach(el=>{el.style.width=pct*100+'%'});document.getElementById('zoomReset').textContent=scale+'%'; }
document.getElementById('zoomIn').addEventListener('click',()=>{scale=Math.min(160,scale+20);updateScale()});
document.getElementById('zoomOut').addEventListener('click',()=>{scale=Math.max(60,scale-20);updateScale()});
document.getElementById('zoomReset').addEventListener('dblclick',()=>{scale=100;updateScale()});
const observer=new IntersectionObserver(entries=>{for(const e of entries){if(!e.isIntersecting)continue; const n=Number(e.target.dataset.page);if(!n)continue;current=n;state.textContent=`страница ${n} из 22`;const start=[2,7,8,9,10,12,14,15].filter(v=>v<=n).pop()||2;toc.forEach(a=>a.classList.toggle('active',Number(a.dataset.start)===start));}},{rootMargin:'-10% 0px -65% 0px',threshold:0});pages.forEach(p=>observer.observe(p));
})();
