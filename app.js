(()=>{
'use strict';
const DATA=window.OGE_DATA;
if(!DATA){document.body.innerHTML='<p style="padding:30px">Не найден data.js. Распакуй весь архив целиком.</p>';return;}
const tasks=DATA.tasks,contexts=DATA.contexts,topics=DATA.topics;
const byId=Object.fromEntries(tasks.map(t=>[t.id,t]));
const eligible=tasks.filter(t=>!t.tags.includes('OLD')&&!t.tags.includes('SIM'));
const $=id=>document.getElementById(id);
const h=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const practiceKey='sashosha-oge-293-v2', variantKey='sashosha-oge-variant-19-v1';
const read=(k,def)=>{try{return JSON.parse(localStorage.getItem(k))??def}catch(_){return def}};
const store=(k,val)=>{try{localStorage.setItem(k,JSON.stringify(val))}catch(_){}};
let progress=read(practiceKey,{});
let practiceId='1.3', showOld=false, query='';
let variant=read(variantKey,null), variantIndex=0;
if(variant && (!Array.isArray(variant.ids)||variant.ids.length<1||variant.ids.length>60||variant.ids.some(id=>!byId[id])||(!variant.assignmentId&&(variant.ids.length!==19||variant.ids.some((id,i)=>byId[id].n!==i+1)))))variant=null;
const normalize=s=>String(s??'').normalize('NFKC').trim().toLowerCase().replace(/[−–—]/g,'-').replace(/\s+/g,'').replace(/\./g,',').replace(/^[+]/,'').replace(/^0+(?=\d)/,'');
function equalAnswer(typed,ans,id){
 const given=normalize(typed);if(!given)return false;
 if(id==='19.2')return given==='13'||given==='31';
 let acceptable=String(ans??'').split(';').map(x=>normalize(x));
 return acceptable.some(correct=>{
   if(given===correct)return true;
   let parse=s=>/^-?\d+(?:,\d+)?$/.test(s)?Number(s.replace(',','.')):NaN;
   const a=parse(given),b=parse(correct);return Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<1e-8;
 });
}
function getStats(){let tried=eligible.filter(t=>progress[t.id]?.tries>0),good=eligible.filter(t=>progress[t.id]?.right),first=tried.filter(t=>progress[t.id]?.first);return {tried:tried.length,good:good.length,accuracy:tried.length?Math.round(first.length/tried.length*100)+'%':'—',left:eligible.length-good.length};}
function renderStats(){const s=getStats();$('statTried').textContent=s.tried;$('statCorrect').textContent=s.good;$('statAccuracy').textContent=s.accuracy;$('statLeft').textContent=s.left;$('progressFill').style.width=(100*s.good/eligible.length)+'%';}
function numberTile(n){let t=topics[n-1],count=eligible.filter(x=>x.n===n).length;return `<button type="button" class="number-tile ${byId[practiceId].n===n?'active':''}" data-pick-number="${n}"><strong>${String(n).padStart(2,'0')}.</strong><span><span class="topic-title">${h(n<=5?'практические задачи':t)}</span><br><span class="topic-count">${count} прототип${count===1?'':count>=2&&count<=4?'а':'ов'}</span></span></button>`;}
function renderNumbers(){$('numbersGrid').innerHTML=Array.from({length:19},(_,i)=>numberTile(i+1)).join('');}
function currentList(){return tasks.filter(t=>t.n===byId[practiceId].n&&(showOld||!t.tags.includes('OLD'))&&!t.tags.includes('SIM'));}
function renderProtoList(){
 let ls=currentList().filter(t=>`${t.id} ${t.topic} ${t.text}`.toLowerCase().includes(query.toLowerCase()));
 $('protoCount').textContent=`(${ls.length})`;
 $('protoList').innerHTML=ls.map(t=>`<button type="button" data-pick-proto="${h(t.id)}" class="proto-btn ${t.id===practiceId?'active':''}"><span><strong>${h(t.id)}</strong><small>${h(t.topic)} ${t.tags.includes('OLD')?'· архив OLD':''} ${t.tags.includes('DEMO')?'· демо':''}</small></span><span class="proto-status">${progress[t.id]?.right?'✓':progress[t.id]?.tries?'↺':'→'}</span></button>`).join('')||'<p style="padding:15px;color:#777">ничего не найдено</p>';
}
function qHTML(t,mode){
 const c=t.context?contexts[t.context]:null, isVariant=mode==='variant';
 const contextHTML=c?`<div class="q-context"><details open><summary>общие данные: ${h(c.title)} (для заданий 1–5)</summary><div class="label-row"><span class="micro">условие и схема сюжета</span><button class="zoom-control" type="button" data-zoom="${h(c.img)}" data-zoom-title="Данные к заданиям 1–5">увеличить ↗</button></div><img class="source-art" src="${h(c.img)}" alt="${h(c.text)}" loading="eager"></details></div>`:'';
 const old=progress[t.id], vanswer=isVariant?variant.answers[variantIndex]||'':old?.last||'';
 const feedback=isVariant&&variant.checked?(equalAnswer(vanswer,t.answer,t.id)?`<div class="answer-feedback ok">верно ✓</div>`:`<div class="answer-feedback no">неверно. Правильный ответ: ${h(t.id==='19.2'?'13 или 31':t.answer)}</div>`):'';
 return `<div class="q-top"><div><div class="micro">${isVariant?`задание ${variantIndex+1} из ${variant.ids.length} · номер ОГЭ ${t.n}`:`номер ${t.n} · прототип ${h(t.id)}`}</div><h3>${h(isVariant?'№'+t.n:'прототип '+t.id)}</h3></div><div class="q-topic">${h(t.topic)} ${t.tags.includes('DEMO')?'· демо':''}</div></div>
 ${contextHTML}<div class="label-row"><span class="micro">условие задачи</span><button type="button" class="zoom-control" data-zoom="${h(t.img)}" data-zoom-title="Прототип ${h(t.id)}">увеличить ↗</button></div>
 <div class="q-visual"><img class="source-art" src="${h(t.img)}" alt="${h(t.text)}" loading="eager"></div>
 <div class="answer-area"><label for="${mode}Answer">твой ответ</label><form class="answer-row" data-answer-form="${mode}"><input class="answer-input" id="${mode}Answer" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" placeholder="введи ответ..." value="${h(vanswer)}" ${isVariant&&variant.checked?'readonly':''} aria-label="Ответ на задание ${t.n}">${isVariant?'':`<button type="submit" class="btn btn-dark">проверить →</button>`}</form>${isVariant?feedback:`<div class="answer-feedback" id="practiceFeedback" hidden role="status" aria-live="polite"></div>`}</div>
 ${isVariant?'':`<div class="exercise-actions"><button class="quiet-link" id="revealPractice" type="button">показать ответ</button><div class="right-actions"><button type="button" class="btn btn-outline" id="prevProto">← назад</button><button type="button" class="btn btn-pale" id="nextProto">дальше →</button></div></div>`}
 `;
}
function renderPractice(){
 const t=byId[practiceId];$('practiceDescriptor').textContent=`№${t.n} · ${t.topic}`;
 renderNumbers();renderProtoList();$('practiceQuestion').innerHTML=qHTML(t,'practice');renderStats();
}
function selectPractice(id,scroll=true){if(!byId[id])return;practiceId=id;if(byId[id].tags.includes('OLD'))showOld=true;$('showOld').checked=showOld;query='';$('protoSearch').value='';renderPractice();if(scroll)$('practice').scrollIntoView({behavior:'smooth'});}
function selectNumber(n){const arr=eligible.filter(t=>t.n===n),pick=arr.find(t=>t.tags.includes('DEMO'))||arr[0];if(pick)selectPractice(pick.id,true)}
function nextProto(step){const ls=currentList(),i=ls.findIndex(t=>t.id===practiceId);if(!ls.length)return;selectPractice(ls[(i+step+ls.length)%ls.length].id,false);}
function feedback(msg,kind){let e=$('practiceFeedback');if(!e)return;e.hidden=false;e.className='answer-feedback '+kind;e.textContent=msg;}
function submitPractice(){let t=byId[practiceId],input=$('practiceAnswer'),value=input.value.trim();if(!value){input.focus();return;}const ok=equalAnswer(value,t.answer,t.id);let p=progress[t.id]||{tries:0,right:false,first:false};p.tries++;p.last=value;if(ok){if(p.tries===1)p.first=true;p.right=true;feedback('верно! продолжаем ✓','ok')}else{feedback('пока не совпало — попробуй ещё раз','no')}progress[t.id]=p;store(practiceKey,progress);renderProtoList();renderStats();}
function randomFrom(a){return a[Math.floor(Math.random()*a.length)];}
function createVariant(){
 if(variant?.assignmentId && !variant.checked){alert('Сначала заверши назначенную домашнюю работу. Открыть её повторно можно из личного кабинета.');return;}
 if(variant && !variant.checked && Object.values(variant.answers).some(v=>String(v).trim()) && !confirm('Начать новый вариант? Введённые ответы в текущем варианте будут потеряны.'))return;
 const contextsAvailable=Array.from({length:8},(_,i)=>i+1).filter(p=>[1,2,3,4,5].every(n=>eligible.some(t=>t.id===`${n}.${p}`)));
 const p=randomFrom(contextsAvailable),ids=[];
 for(let n=1;n<=19;n++)ids.push(n<=5?`${n}.${p}`:randomFrom(eligible.filter(t=>t.n===n)).id);
 variant={ids,answers:{},checked:false,created:Date.now()};variantIndex=0;store(variantKey,variant);renderVariant();$('variantWork').scrollIntoView({behavior:'smooth',block:'start'});
}
function variantResults(){return Array.isArray(variant.serverResults)?variant.serverResults:variant.ids.map((id,i)=>equalAnswer(variant.answers[i]||'',byId[id].answer,id));}
function renderVariant(){
 $('variantWork').hidden=!variant;if(!variant)return;
 $('variantIdLabel').textContent=variant.assignmentId?`${variant.title||'назначенная работа'} · ${variant.ids.length} заданий`:'собранный вариант · 19 заданий';
 const got=Object.values(variant.answers).filter(v=>String(v).trim()).length;
 $('variantFilled').textContent=`${got} из ${variant.ids.length} ответов заполнено${variant.checked?' · проверено':''}`;
 const results=variant.checked?variantResults():null;
 $('variantNumbers').innerHTML=variant.ids.map((id,i)=>`<button type="button" data-variant-index="${i}" class="variant-num ${i===variantIndex?'current':''} ${String(variant.answers[i]||'').trim()?'filled':''} ${results?(results[i]?'correct':'wrong'):''}" title="Задание ${i+1}: прототип ${h(id)}">${i+1}</button>`).join('');
 $('variantQuestion').innerHTML=qHTML(byId[variant.ids[variantIndex]],'variant');
 $('variantPrev').disabled=variantIndex===0;$('variantNext').textContent=variantIndex===variant.ids.length-1?'к первому →':'следующее →';
 if(variant.checked){
  let correct=results.filter(Boolean).length;
  $('variantSummary').hidden=false;
  $('variantSummary').innerHTML=`<strong>результат: ${correct} из ${variant.ids.length}.</strong><p>Зелёные номера решены правильно, розовые — требуют повторения. Нажми на любой номер, чтобы посмотреть правильный ответ.</p><div class="variant-result-list">${results.map((ok,i)=>`<button type="button" data-variant-index="${i}" class="${ok?'yes':'no'}">${i+1}</button>`).join('')}</div><button class="btn btn-dark" type="button" data-new-variant>собрать ещё один вариант →</button>`;
 }else $('variantSummary').hidden=true;
}
function setVariantAnswer(value){if(!variant||variant.checked)return;variant.answers[variantIndex]=value;store(variantKey,variant);if(variant.assignmentId&&window.SASHOSHA_CLOUD_API){window.SASHOSHA_CLOUD_API.syncDraft(variant.assignmentId,{...variant.answers});}let buttons=$('variantNumbers').querySelectorAll('button');buttons[variantIndex]?.classList.toggle('filled',Boolean(value.trim()));$('variantFilled').textContent=`${Object.values(variant.answers).filter(v=>String(v).trim()).length} из ${variant.ids.length} ответов заполнено`;}
async function checkVariant(){if(!variant||variant.checked)return;let empty=Array.from({length:variant.ids.length},(_,i)=>i).filter(i=>!String(variant.answers[i]||'').trim());if(empty.length&&!confirm(`Не заполнено ${empty.length} заданий. Проверить вариант сейчас?`))return;if(variant.assignmentId){
   if(!window.SASHOSHA_CLOUD_API){alert('Подключи кабинет, чтобы отправить назначенный вариант.');return;}
   const button=$('checkVariantTop');button.disabled=true;button.textContent='отправка...';
   try{
     const data=await window.SASHOSHA_CLOUD_API.submit(variant.assignmentId,{...variant.answers});
     variant.serverResults=data.results;variant.checked=true;
   }catch(e){alert('Не удалось отправить работу: '+(e.message||e));return;}
   finally{button.disabled=false;button.textContent='проверить вариант';}
 }else variant.checked=true;
 store(variantKey,variant);renderVariant();$('variantSummary').scrollIntoView({behavior:'smooth',block:'nearest'});}
window.SASHOSHA_APP={openAssignment(a){
  if(!a||!Array.isArray(a.task_ids)||a.task_ids.length<1||a.task_ids.length>60||a.task_ids.some(id=>!byId[id])){
    alert('Не удалось открыть работу: неизвестные номера задач');return;
  }
  variant={ids:a.task_ids,answers:a.answers||{},checked:a.status==='submitted',created:Date.parse(a.created_at)||Date.now(),assignmentId:a.id,title:a.title,serverResults:a.correct_flags||null};
  variantIndex=0;store(variantKey,variant);renderVariant();$('variant').scrollIntoView({behavior:'smooth'});
}};
// One delegated handler for all dynamically generated controls.
document.addEventListener('click',e=>{
 const zoom=e.target.closest('[data-zoom]');if(zoom){$('zoomImage').src=zoom.dataset.zoom;$('zoomTitle').textContent=zoom.dataset.zoomTitle||'увеличенный рисунок';$('zoomDialog').showModal();return;}
 const num=e.target.closest('[data-pick-number]');if(num){selectNumber(+num.dataset.pickNumber);return;}
 const proto=e.target.closest('[data-pick-proto]');if(proto){selectPractice(proto.dataset.pickProto,false);return;}
 const vi=e.target.closest('[data-variant-index]');if(vi){variantIndex=+vi.dataset.variantIndex;renderVariant();return;}
 if(e.target.closest('[data-new-variant]')){createVariant();return;}
 if(e.target.id==='prevProto')nextProto(-1);
 if(e.target.id==='nextProto')nextProto(1);
 if(e.target.id==='revealPractice'){const t=byId[practiceId];feedback('правильный ответ: '+(t.id==='19.2'?'13 или 31':t.answer),'info');}
});
document.addEventListener('submit',e=>{const f=e.target.closest('[data-answer-form]');if(!f)return;e.preventDefault();if(f.dataset.answerForm==='practice')submitPractice();});
$('practiceQuestion').addEventListener('input',()=>{});
$('variantQuestion').addEventListener('input',e=>{if(e.target.id==='variantAnswer')setVariantAnswer(e.target.value);});
$('protoSearch').addEventListener('input',e=>{query=e.target.value;renderProtoList();});
$('showOld').addEventListener('change',e=>{showOld=e.target.checked;if(!showOld&&byId[practiceId].tags.includes('OLD')){const arr=eligible.filter(t=>t.n===byId[practiceId].n);if(arr.length)practiceId=arr[0].id;}renderPractice();});
$('generateVariant').addEventListener('click',createVariant);
$('checkVariantTop').addEventListener('click',checkVariant);
$('variantPrev').addEventListener('click',()=>{variantIndex=Math.max(0,variantIndex-1);renderVariant();});
$('variantNext').addEventListener('click',()=>{variantIndex=(variantIndex+1)%variant.ids.length;renderVariant();});
$('clearProgress').addEventListener('click',()=>{if(confirm('Сбросить прогресс по прототипам на этом устройстве?')){progress={};store(practiceKey,progress);renderPractice();}});
$('closeZoom').addEventListener('click',()=>$('zoomDialog').close());
$('zoomDialog').addEventListener('click',e=>{if(e.target===$('zoomDialog'))$('zoomDialog').close();});
renderPractice();renderVariant();
})();
