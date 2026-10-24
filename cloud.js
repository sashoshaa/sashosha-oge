/* sashosha.math • class rooms and assignments via Supabase Auth + Postgres/RLS */
(async()=>{
 'use strict';
 const $=id=>document.getElementById(id);
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const config=window.SASHOSHA_CLOUD||{};
 const banner=$('cloudBanner'),root=$('cloudDashboard'),signin=$('cloudSignIn'),teacher=$('teacherDashboard'),student=$('studentDashboard');
 let sb=null,user=null,rooms=[],people=[],assignments=[],studentClasses=[];
 const tasks=window.OGE_DATA.tasks;
 let schoolMaterials=[];
 const eligible=tasks.filter(t=>!t.tags.includes('OLD')&&!t.tags.includes('SIM'));
 const byNumber=n=>eligible.filter(t=>t.n===n);
 const random=arr=>arr[Math.floor(Math.random()*arr.length)];
 const PRESETS={full:[...Array(19)].map((_,i)=>i+1),algebra:[6,7,8,9,10,11,12,13,14],geometry:[15,16,17,18,19],practice:[1,2,3,4,5]};
 const allNumbers=[...Array(19)].map((_,i)=>i+1);
 const hwPools={};
 let lastExample=null;
 const shuffle=a=>{const b=[...a];for(let i=b.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[b[i],b[j]]=[b[j],b[i]];}return b;};
 function chosenNumbers(){return [...document.querySelectorAll('.hw-num-check:checked')].map(x=>+x.value).sort((a,b)=>a-b);}
 function setupHomeworkBuilder(){
  $('hwNumbers').innerHTML=allNumbers.map(n=>`<label class="hw-num-option"><input type="checkbox" class="hw-num-check" value="${n}" ${n===6||n===7?'checked':''}><span>${n}</span></label>`).join('');
  $('hwPreset').addEventListener('change',()=>{syncPreset();renderHomeworkOptions();});
  $('hwNumbers').addEventListener('change',renderHomeworkOptions);
  $('hwPerNumber').addEventListener('change',renderHomeworkOptions);
  $('hwVariants').addEventListener('change',renderHomeworkOptions);
  $('hwSelectAll').addEventListener('click',()=>{document.querySelectorAll('.hw-num-check').forEach(e=>{e.checked=true;});renderHomeworkOptions();});
  $('hwPools').addEventListener('change',e=>{if(e.target.matches('.hw-proto-check')){const n=+e.target.dataset.n;hwPools[n]=new Set([...document.querySelectorAll(`.hw-proto-check[data-n="${n}"]:checked`)].map(x=>x.value));renderHomeworkOptions(false);}});
  $('hwAllPrototypes').addEventListener('click',()=>{for(const n of allNumbers)delete hwPools[n];renderHomeworkOptions();});
  $('hwPreview').addEventListener('click',()=>{try{const ids=buildHomework();lastExample=ids;$('hwPreviewResult').hidden=false;$('hwPreviewResult').innerHTML=`<b>пример варианта · ${ids.length} задач</b><div>${ids.map((id,i)=>`<span>${i+1}. ${esc(id)}</span>`).join('')}</div><small>Это прототипы ФИПИ. При назначении задания будут выбраны заново.</small>`;}catch(e){lastExample=null;$('hwPreviewResult').hidden=true;errorMsg(e);}});
  syncPreset();renderHomeworkOptions();
 }
 function syncPreset(){const preset=$('hwPreset').value;const custom=preset==='custom';$('hwNumbersWrap').hidden=!custom;if(!custom){const selected=new Set(PRESETS[preset]);document.querySelectorAll('.hw-num-check').forEach(e=>e.checked=selected.has(+e.value));}}
 function availablePool(n){return byNumber(n).filter(t=>!hwPools[n]||hwPools[n].has(t.id));}
 function renderHomeworkOptions(rebuildPools=true){
  const numbers=chosenNumbers(),per=+$('hwPerNumber').value, variants=+$('hwVariants').value;
  $('hwSummary').textContent=numbers.length?`${numbers.length} номеров · ${numbers.length*per} заданий в работе · ${variants} вариант(ов) каждому ученику`:'Выбери хотя бы один номер.';
  if(rebuildPools){$('hwPools').innerHTML=numbers.map(n=>`<div class="hw-pool-group"><strong>№${n} · ${esc(tasks.find(t=>t.n===n)?.topic||'')}</strong><div class="hw-proto-grid">${byNumber(n).map(t=>`<label><input type="checkbox" class="hw-proto-check" data-n="${n}" value="${esc(t.id)}" ${!hwPools[n]||hwPools[n].has(t.id)?'checked':''}><span>${esc(t.id)}</span></label>`).join('')}</div></div>`).join('');}
  lastExample=null;$('hwPreviewResult').hidden=true;
 }
 function buildHomework(){
  const numbers=chosenNumbers(), per=+$('hwPerNumber').value;
  if(!numbers.length)throw Error('Выбери номера для домашней работы');
  if(!Number.isInteger(per)||per<1||per>3)throw Error('Некорректное количество заданий');
  if(numbers.length*per>60)throw Error('Слишком много заданий в одной работе (максимум 60)');
  const chosen=new Map();
  const practice=numbers.filter(n=>n<=5);
  if(practice.length){
   const allContexts=Array.from({length:8},(_,i)=>i+1).filter(p=>practice.every(n=>availablePool(n).some(t=>t.id===`${n}.${p}`)));
   if(allContexts.length<per)throw Error(`Для практических номеров не хватает общих сюжетов: нужно ${per}, доступно ${allContexts.length}.`);
   const selections=shuffle(allContexts).slice(0,per);
   for(const n of practice)chosen.set(n,selections.map(proto=>`${n}.${proto}`));
  }
  for(const n of numbers.filter(n=>n>5)){
   const pool=availablePool(n);
   if(pool.length<per)throw Error(`Для №${n} выбрано только ${pool.length} прототипов. Уменьши количество задач или разреши больше прототипов.`);
   chosen.set(n,shuffle(pool).slice(0,per).map(t=>t.id));
  }
  return numbers.flatMap(n=>chosen.get(n));
 }
 setupHomeworkBuilder();
 function msg(text,type='info'){banner.hidden=false;banner.textContent=text;banner.className='cloud-message '+type;}
 function errorMsg(e){msg(e?.message||String(e),'error');}
 function loading(on){root.classList.toggle('busy',on);}
 function enter(view){signin.hidden=view!=='login';teacher.hidden=view!=='teacher';student.hidden=view!=='student';$('materialGuest').hidden=view!=='login';$('teacherMaterials').hidden=view!=='teacher';if(view==='login')$('materialsList').innerHTML='';}
 function niceDate(iso){return new Date(iso).toLocaleDateString('ru-RU',{day:'2-digit',month:'short',year:'numeric'});}
 function ensure(res){if(res.error)throw res.error;return res.data;}
 if(!/^https:\/\/[^/]+\.supabase\.co\/?$/.test(config.url||'')||!(config.anonKey||'').trim()){
  enter('login');
  $('cloudDisabled').hidden=false;
  $('cloudForms').hidden=true;
  msg('Режим кабинетов подготовлен. Для входа учеников нужно один раз подключить Supabase по инструкции из README. Обычная тренировка и сборка вариантов уже работают.');
  return;
 }
 try {
  const {createClient}=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  sb=createClient(config.url,config.anonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  $('cloudDisabled').hidden=true;
  $('cloudForms').hidden=false;
  const {data:{user:initial}}=await sb.auth.getUser();user=initial;
  if(user)await refresh();else enter('login');
  sb.auth.onAuthStateChange((event,session)=>{user=session?.user||null;setTimeout(()=>refresh().catch(errorMsg),0);});
 }catch(e){errorMsg(e);enter('login');return;}

 async function refresh(){
  if(!user){enter('login');return;}
  loading(true);
  try{
   if(user.is_anonymous){enter('student');await refreshStudent();}
   else{
    // A verified email user can be a teacher, or can join a class as a student.
    rooms=ensure(await sb.from('oge_classrooms').select('*').order('created_at',{ascending:false}));
    studentClasses=ensure(await sb.rpc('oge_my_classes'))||[];
    if(studentClasses.length && !rooms.length){enter('student');await refreshStudent();}
    else {enter('teacher');await refreshTeacher();}
   }
  }finally{loading(false);}
 }
 async function refreshTeacher(){
  $('teacherIdentity').textContent=user.email||'преподаватель';
  rooms=ensure(await sb.from('oge_classrooms').select('*').order('created_at',{ascending:false}));
  const select=$('teacherClass');let chosen=select.value;
  select.innerHTML=rooms.map(r=>`<option value="${esc(r.id)}">${esc(r.title)}</option>`).join('');
  select.value=rooms.some(r=>r.id===chosen)?chosen:(rooms[0]?.id||'');
  $('teacherClassBox').hidden=rooms.length===0;
  if(!rooms.length){$('teacherRoster').innerHTML='<p class="cloud-hint">Создай первую группу — получишь код, который отправишь ученикам.</p>';$('teacherAssignments').innerHTML='';return;}
  await refreshTeacherClass();
 }
 async function refreshTeacherClass(){
  let room=rooms.find(r=>r.id===$('teacherClass').value);if(!room)return;
  $('teacherCode').textContent=room.join_code;
  $('teacherGroupTitle').textContent=room.title;
  people=ensure(await sb.from('oge_students').select('*').eq('classroom_id',room.id).order('joined_at',{ascending:false}));
  assignments=ensure(await sb.from('oge_assignments').select('*').eq('classroom_id',room.id).order('created_at',{ascending:false}).limit(200));
  await refreshMaterials();
  $('rosterCount').textContent=String(people.length);
  $('teacherRoster').innerHTML=people.length?people.map(s=>`<label class="roster-item"><input class="roster-check" type="checkbox" value="${esc(s.user_id)}" checked><span><strong>${esc(s.nickname)}</strong><small>вариантов: ${assignments.filter(a=>a.student_id===s.user_id).length}</small></span></label>`).join(''):'<p class="cloud-hint">Ученики появятся здесь после входа по коду группы.</p>';
  const names=Object.fromEntries(people.map(s=>[s.user_id,s.nickname]));
  $('teacherAssignments').innerHTML=assignments.length?`<div class="assignment-list">${assignments.map(a=>`<div class="assignment-line"><div><b>${esc(a.title)}</b><div class="micro">${esc(names[a.student_id]||'ученик')} · ${niceDate(a.created_at)}</div></div><div class="assignment-status">${a.status==='submitted'?`<strong>${a.score} / ${(a.task_ids||[]).length}</strong><button class="quiet-link" data-results="${esc(a.id)}">по номерам ↗</button>`:'ожидает сдачи'}</div></div>`).join('')}</div>`:'<p class="cloud-hint">Пока не назначено ни одного варианта.</p>';
 }
 async function refreshStudent(){
  studentClasses=ensure(await sb.rpc('oge_my_classes'))||[];
  $('studentClasses').innerHTML=studentClasses.length?studentClasses.map(c=>`<span class="small-chip">${esc(c.classroom_title)} · ${esc(c.nickname)}</span>`).join(''):'<p class="cloud-hint">Пока нет групп. Введи код от преподавателя.</p>';
  assignments=ensure(await sb.from('oge_assignments').select('*').order('created_at',{ascending:false}).limit(200));
  await refreshMaterials();
  const completed=assignments.filter(a=>a.status==='submitted');const pts=completed.reduce((sum,a)=>sum+(a.score||0),0);const total=completed.reduce((sum,a)=>sum+(a.task_ids||[]).length,0);$('studentProgressSummary').innerHTML=`<span>сдано работ: ${completed.length}</span><span>верных ответов: ${pts} / ${total}</span><span>точность: ${total?Math.round(100*pts/total)+'%':'—'}</span>`;
  $('studentAssignments').innerHTML=assignments.length?assignments.map(a=>{
    const clazz=studentClasses.find(c=>c.classroom_id===a.classroom_id);
    return `<div class="student-assignment"><div><div class="micro">${esc(clazz?.classroom_title||'группа')} · ${niceDate(a.created_at)}</div><h4>${esc(a.title)}</h4><span>${a.status==='submitted'?`сдан · ${a.score} из ${a.task_ids.length}`:`${a.task_ids.length} заданий · ждёт решения`}</span></div><button type="button" class="btn ${a.status==='submitted'?'btn-outline':'btn-dark'}" data-open-assignment="${esc(a.id)}">${a.status==='submitted'?'посмотреть':'решать →'}</button></div>`;
  }).join(''):'<p class="cloud-hint">Назначенные преподавателем варианты появятся здесь.</p>';
 }

 function materialTypeLabel(t){return ({notes:'конспект',video:'видео',pdf:'PDF / файл',link:'ссылка'})[t]||'материал';}
 async function refreshMaterials(){
  if(!sb||!user)return;
  let result;
  if(user.is_anonymous || !rooms.length || studentClasses.length && !rooms.length){
    result=await sb.from('school_materials').select('id,classroom_id,title,description,url,material_type,created_at').order('created_at',{ascending:false}).limit(100);
  }else{
    const id=$('teacherClass').value;
    if(!id){$('materialsList').innerHTML='';return;}
    result=await sb.from('school_materials').select('id,classroom_id,title,description,url,material_type,created_at').eq('classroom_id',id).order('created_at',{ascending:false}).limit(100);
  }
  if(result.error){$('materialsList').innerHTML='<p class="cloud-hint">Материалы пока не загружены. Если только что установила обновление, выполни school_upgrade.sql в Supabase.</p>';return;}
  schoolMaterials=result.data||[];
  const isTeacher=!teacher.hidden;
  $('materialsList').innerHTML=schoolMaterials.length?'<div class="school-materials-list">'+schoolMaterials.map(m=>`<div class="school-material"><div class="micro">${esc(materialTypeLabel(m.material_type))}</div><h4>${esc(m.title)}</h4><p>${esc(m.description||'')}</p><a target="_blank" rel="noopener noreferrer" href="${esc(m.url)}">открыть материал ↗</a>${isTeacher?`<button type="button" class="quiet-link delete-material" data-delete-material="${esc(m.id)}">удалить</button>`:''}</div>`).join('')+'</div>':'<p class="cloud-hint">Пока нет материалов в выбранных группах.</p>';
 }
 $('materialForm').addEventListener('submit',async e=>{
  e.preventDefault();if(!sb||!user)return;
  const room=$('teacherClass').value;
  const url=$('materialUrl').value.trim();
  if(!room||!url.startsWith('https://')){msg('Выбери группу и ссылку https://','error');return;}
  try{loading(true);ensure(await sb.from('school_materials').insert({classroom_id:room,title:$('materialTitle').value.trim(),description:$('materialDescription').value.trim(),url,material_type:$('materialType').value}));$('materialForm').reset();await refreshMaterials();msg('Материал опубликован ✓','success');}
  catch(e){errorMsg(e);}finally{loading(false);}
 });
 $('materialsList').addEventListener('click',async e=>{
  const b=e.target.closest('[data-delete-material]');if(!b||!confirm('Удалить материал из группы?'))return;
  try{ensure(await sb.from('school_materials').delete().eq('id',b.dataset.deleteMaterial));await refreshMaterials();msg('Материал удалён','success');}catch(e){errorMsg(e);}
 });
 $('teacherLogin').addEventListener('submit',async e=>{
  e.preventDefault();let email=$('teacherEmail').value.trim();
  try {loading(true);ensure(await sb.auth.signInWithOtp({email,options:{emailRedirectTo:location.href.split('#')[0]}}));msg('Письмо со ссылкой для входа отправлено. Открой его на этом устройстве.','success');}
  catch(e){errorMsg(e);}finally{loading(false);}
 });
 $('studentJoin').addEventListener('submit',async e=>{
  e.preventDefault();let code=$('joinCode').value.trim(),nick=$('studentNickname').value.trim();
  try {
   loading(true);
   if(!user){ensure(await sb.auth.signInAnonymously());user=(await sb.auth.getUser()).data.user;}
   ensure(await sb.rpc('oge_join_class',{p_code:code,p_nickname:nick}));
   msg('Ты в группе! Теперь преподаватель может назначать варианты.','success');
   enter('student');await refreshStudent();
  }catch(e){errorMsg(e);}finally{loading(false);}
 });
 $('joinAnother').addEventListener('submit',async e=>{
  e.preventDefault();try{loading(true);ensure(await sb.rpc('oge_join_class',{p_code:$('anotherCode').value,p_nickname:$('anotherNick').value}));msg('Группа добавлена ✓','success');await refreshStudent();}catch(e){errorMsg(e);}finally{loading(false);}
 });
 $('makeClass').addEventListener('submit',async e=>{
  e.preventDefault();try{loading(true);ensure(await sb.rpc('oge_create_class',{p_title:$('newClassTitle').value.trim()}));$('newClassTitle').value='';msg('Группа создана ✓','success');await refreshTeacher();}catch(e){errorMsg(e);}finally{loading(false);}
 });
 $('teacherClass').addEventListener('change',()=>refreshTeacherClass().catch(errorMsg));
 $('refreshClass').addEventListener('click',()=>refreshTeacher().catch(errorMsg));
 $('refreshStudent').addEventListener('click',()=>refreshStudent().catch(errorMsg));
 $('assignChosen').addEventListener('click',async()=>{
  const room=$('teacherClass').value;
  const selected=[...document.querySelectorAll('.roster-check:checked')].map(el=>el.value);
  const title=$('assignTitle').value.trim()||`ОГЭ · вариант ${new Date().toLocaleDateString('ru-RU')}`;
  if(!selected.length){msg('Выбери хотя бы одного ученика.','error');return;}
  const versions=+$('hwVariants').value;
  if(!versions||versions>5)return msg('Количество вариантов: от 1 до 5.','error');
  let preview;try{preview=buildHomework();}catch(e){return errorMsg(e);}
  const total=selected.length*versions;
  if(!confirm(`Назначить ${total} работ(ы): ${selected.length} ученик(ам), по ${versions} вариантов, в каждом по ${preview.length} заданий?`))return;
  try{
   loading(true);
   let done=0;const usedByStudent=new Map();
   for(let i=0;i<selected.length;i++){
    const used=new Set();usedByStudent.set(selected[i],used);
    for(let v=0;v<versions;v++){
      let ids,signature;let tries=0;
      do{ids=buildHomework();signature=ids.join('|');tries++;}while(used.has(signature)&&tries<24);
      if(used.has(signature))throw Error(`Не хватает разных наборов для ${versions} вариантов: назначено ${done}. Добавь больше прототипов.`);
      used.add(signature);
      const workTitle=versions>1?`${title} · вариант ${v+1}`:title;
      const {error}=await sb.rpc('oge_assign_variant',{p_classroom_id:room,p_student_id:selected[i],p_title:workTitle,p_task_ids:ids});
      if(error)throw Error(`Назначено ${done} из ${total}. ${error.message}`);
      done++;
    }
   }
   msg(`Готово! Назначено ${done} работ. Каждому ученику собраны индивидуальные задания.`, 'success');
   await refreshTeacherClass();
  }catch(e){errorMsg(e);}finally{loading(false);}
 });
 $('teacherAssignments').addEventListener('click',e=>{
  const el=e.target.closest('[data-results]');if(!el)return;
  const a=assignments.find(x=>x.id===el.dataset.results);if(!a)return;
  const flags=a.correct_flags||[];
  const correct=flags.map((x,i)=>`${i+1}: ${x?'✓':'×'}`).join('   ');
  msg(`${a.title} · ${a.score}/${a.task_ids.length}. По заданиям: ${correct}`,'info');
 });
 $('studentAssignments').addEventListener('click',e=>{
  const el=e.target.closest('[data-open-assignment]');if(!el)return;
  const a=assignments.find(x=>x.id===el.dataset.openAssignment);if(!a)return;
  window.SASHOSHA_APP.openAssignment(a);
  msg(a.status==='submitted'?'Результат проверенной работы открыт.':'Вариант открыт в разделе «сборка варианта».','success');
 });
 document.querySelectorAll('[data-signout]').forEach(b=>b.addEventListener('click',async()=>{
  try{ensure(await sb.auth.signOut());user=null;enter('login');msg('Ты вышел(а) из кабинета.','success');}
  catch(e){errorMsg(e);}
 }));

 let syncTimer=null;
 async function syncDraft(id,answers){
  clearTimeout(syncTimer);
  syncTimer=setTimeout(async()=>{
   if(!sb||!user)return;
   const {error}=await sb.rpc('oge_save_draft',{p_assignment_id:id,p_answers:answers});
   if(error)errorMsg(error);
  },750);
 }
 async function submit(id,answers){
  if(!sb||!user)throw Error('Войди в личный кабинет');
  clearTimeout(syncTimer);
  const data=ensure(await sb.rpc('oge_submit_variant',{p_assignment_id:id,p_answers:answers}));
  await refreshStudent();
  return data;
 }
 window.SASHOSHA_CLOUD_API={syncDraft,submit};
})();
