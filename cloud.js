/* sashosha.math • class rooms and assignments via Supabase Auth + Postgres/RLS */
(async()=>{
 'use strict';
 const $=id=>document.getElementById(id);
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const config=window.SASHOSHA_CLOUD||{};
 const banner=$('cloudBanner'),root=$('cloudDashboard'),signin=$('cloudSignIn'),teacher=$('teacherDashboard'),student=$('studentDashboard');
 let sb=null,user=null,rooms=[],people=[],assignments=[],studentClasses=[];
 const tasks=window.OGE_DATA.tasks;
 const eligible=tasks.filter(t=>!t.tags.includes('OLD')&&!t.tags.includes('SIM'));
 const byNumber=n=>eligible.filter(t=>t.n===n);
 const random=arr=>arr[Math.floor(Math.random()*arr.length)];
 const makeIds=()=>{
  const available=Array.from({length:8},(_,i)=>i+1).filter(p=>[1,2,3,4,5].every(n=>eligible.some(t=>t.id===`${n}.${p}`)));
  const context=random(available);
  return Array.from({length:19},(_,i)=>{let n=i+1;return n<=5?`${n}.${context}`:random(byNumber(n)).id;});
 };
 function msg(text,type='info'){banner.hidden=false;banner.textContent=text;banner.className='cloud-message '+type;}
 function errorMsg(e){msg(e?.message||String(e),'error');}
 function loading(on){root.classList.toggle('busy',on);}
 function enter(view){signin.hidden=view!=='login';teacher.hidden=view!=='teacher';student.hidden=view!=='student';}
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
  $('rosterCount').textContent=String(people.length);
  $('teacherRoster').innerHTML=people.length?people.map(s=>`<label class="roster-item"><input class="roster-check" type="checkbox" value="${esc(s.user_id)}" checked><span><strong>${esc(s.nickname)}</strong><small>вариантов: ${assignments.filter(a=>a.student_id===s.user_id).length}</small></span></label>`).join(''):'<p class="cloud-hint">Ученики появятся здесь после входа по коду группы.</p>';
  const names=Object.fromEntries(people.map(s=>[s.user_id,s.nickname]));
  $('teacherAssignments').innerHTML=assignments.length?`<div class="assignment-list">${assignments.map(a=>`<div class="assignment-line"><div><b>${esc(a.title)}</b><div class="micro">${esc(names[a.student_id]||'ученик')} · ${niceDate(a.created_at)}</div></div><div class="assignment-status">${a.status==='submitted'?`<strong>${a.score} / 19</strong><button class="quiet-link" data-results="${esc(a.id)}">по номерам ↗</button>`:'ожидает сдачи'}</div></div>`).join('')}</div>`:'<p class="cloud-hint">Пока не назначено ни одного варианта.</p>';
 }
 async function refreshStudent(){
  studentClasses=ensure(await sb.rpc('oge_my_classes'))||[];
  $('studentClasses').innerHTML=studentClasses.length?studentClasses.map(c=>`<span class="small-chip">${esc(c.classroom_title)} · ${esc(c.nickname)}</span>`).join(''):'<p class="cloud-hint">Пока нет групп. Введи код от преподавателя.</p>';
  assignments=ensure(await sb.from('oge_assignments').select('*').order('created_at',{ascending:false}).limit(200));
  $('studentAssignments').innerHTML=assignments.length?assignments.map(a=>{
    const clazz=studentClasses.find(c=>c.classroom_id===a.classroom_id);
    return `<div class="student-assignment"><div><div class="micro">${esc(clazz?.classroom_title||'группа')} · ${niceDate(a.created_at)}</div><h4>${esc(a.title)}</h4><span>${a.status==='submitted'?`сдан · ${a.score} из 19`:'19 заданий · ждёт решения'}</span></div><button type="button" class="btn ${a.status==='submitted'?'btn-outline':'btn-dark'}" data-open-assignment="${esc(a.id)}">${a.status==='submitted'?'посмотреть':'решать →'}</button></div>`;
  }).join(''):'<p class="cloud-hint">Назначенные преподавателем варианты появятся здесь.</p>';
 }
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
  if(!confirm(`Назначить ${selected.length} ученик(ам) разные случайные варианты №1–19?`))return;
  try{
   loading(true);
   for(let i=0;i<selected.length;i++){
    const {error}=await sb.rpc('oge_assign_variant',{p_classroom_id:room,p_student_id:selected[i],p_title:title,p_task_ids:makeIds()});
    if(error)throw Error(`Назначено ${i} из ${selected.length}. ${error.message}`);
   }
   msg(`Готово! Назначено ${selected.length} вариантов. Каждый собран отдельно.`, 'success');
   await refreshTeacherClass();
  }catch(e){errorMsg(e);}finally{loading(false);}
 });
 $('teacherAssignments').addEventListener('click',e=>{
  const el=e.target.closest('[data-results]');if(!el)return;
  const a=assignments.find(x=>x.id===el.dataset.results);if(!a)return;
  const flags=a.correct_flags||[];
  const correct=flags.map((x,i)=>`${i+1}: ${x?'✓':'×'}`).join('   ');
  msg(`${a.title} · ${a.score}/19. По номерам: ${correct}`,'info');
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
