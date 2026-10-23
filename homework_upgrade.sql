-- sashosha.math | ДОПОЛНЕНИЕ К УЖЕ УСТАНОВЛЕННОЙ БАЗЕ
-- Выполнить в том же Supabase SQL Editor ОДИН РАЗ после исходного supabase.sql.
-- НЕ удаляет группы, учеников, старые домашние работы или результаты.
-- Допускает домашки от 1 до 60 задач вместо строго 19.
begin;

alter table public.oge_assignments
  drop constraint if exists oge_assignments_task_ids_check;
alter table public.oge_assignments
  add constraint oge_assignments_task_ids_check
  check (coalesce(cardinality(task_ids),0) between 1 and 60);

alter table public.oge_assignments
  drop constraint if exists oge_assignments_score_check;
alter table public.oge_assignments
  add constraint oge_assignments_score_check
  check (score is null or (score between 0 and coalesce(cardinality(task_ids),0)));

-- Учитель может назначить любой набор проверенных прототипов ФИПИ.
-- Запрещено подменять ID, включать OLD/SIM и дублировать задачу в одной работе.
create or replace function public.oge_assign_variant(
 p_classroom_id uuid,p_student_id uuid,p_title text,p_task_ids text[])
returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_task text; v_length integer;
begin
 if auth.uid() is null or not exists(
    select 1 from public.oge_classrooms
    where id=p_classroom_id and teacher_id=auth.uid()) then
   raise exception 'Только преподаватель группы может назначать работы';
 end if;
 if not exists(select 1 from public.oge_students
    where classroom_id=p_classroom_id and user_id=p_student_id) then
   raise exception 'Ученик не состоит в группе';
 end if;
 if length(trim(p_title)) not between 2 and 100 then
   raise exception 'Введите название работы (2–100 символов)';
 end if;
 v_length:=coalesce(cardinality(p_task_ids),0);
 if v_length < 1 or v_length > 60 then
   raise exception 'В работе должно быть от 1 до 60 заданий';
 end if;
 if exists(select 1 from unnest(p_task_ids) as t(id) group by t.id having count(*)>1) then
   raise exception 'В одной работе нельзя повторять один прототип';
 end if;
 foreach v_task in array p_task_ids loop
   if v_task is null or not exists(
      select 1 from public.oge_answer_key where task_id=v_task and active) then
     raise exception 'Недопустимый прототип: %',v_task;
   end if;
 end loop;
 insert into public.oge_assignments(classroom_id,student_id,title,task_ids)
 values(p_classroom_id,p_student_id,trim(p_title),p_task_ids) returning id into v_id;
 return v_id;
end; $$;

-- Проверка ответов по реальной длине работы (прежде всегда было 19).
create or replace function public.oge_submit_variant(p_assignment_id uuid,p_answers jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_variant public.oge_assignments; v_actual text; v_flag boolean;
 v_flags jsonb:='[]'::jsonb; v_score integer:=0; i integer; v_count integer;
begin
 if auth.uid() is null or jsonb_typeof(p_answers)<>'object' or
    pg_catalog.length(p_answers::text)>10000 then
   raise exception 'Недопустимые ответы';
 end if;
 select * into v_variant from public.oge_assignments
 where id=p_assignment_id and student_id=auth.uid() and status='assigned' for update;
 if not found then raise exception 'Работа не найдена или уже сдана'; end if;
 v_count:=cardinality(v_variant.task_ids);
 for i in 1..v_count loop
   v_actual:=public.oge_normalize_answer(p_answers ->> (i-1)::text);
   select exists(
    select 1 from public.oge_answer_key ak,
         unnest(ak.accepted) as x(ans)
    where ak.task_id=v_variant.task_ids[i]
      and public.oge_normalize_answer(x.ans)=v_actual
      and v_actual<>''
   ) into v_flag;
   v_flags:=v_flags || jsonb_build_array(v_flag);
   if v_flag then v_score:=v_score+1; end if;
 end loop;
 update public.oge_assignments
 set answers=p_answers,correct_flags=v_flags,score=v_score,
     status='submitted',submitted_at=now()
 where id=p_assignment_id;
 return jsonb_build_object('score',v_score,'results',v_flags);
end; $$;

revoke all on function public.oge_assign_variant(uuid,uuid,text,text[]) from public,anon;
revoke all on function public.oge_submit_variant(uuid,jsonb) from public,anon;
grant execute on function public.oge_assign_variant(uuid,uuid,text,text[]),
 function public.oge_submit_variant(uuid,jsonb) to authenticated;

commit;
