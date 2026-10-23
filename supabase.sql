-- sashosha math | Supabase SQL setup
-- Paste the whole file in Supabase SQL Editor once.
-- Do NOT put service-role keys or student data into the GitHub repository.
create extension if not exists pgcrypto;

create table if not exists public.oge_classrooms (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(title) between 2 and 80),
  join_code text not null unique default upper(replace(substr(gen_random_uuid()::text,1,13),'-','')),
  created_at timestamptz not null default now()
);
create table if not exists public.oge_students (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references public.oge_classrooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  nickname text not null check(length(nickname) between 2 and 40),
  joined_at timestamptz not null default now(),
  unique(classroom_id,user_id)
);
create table if not exists public.oge_assignments (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references public.oge_classrooms(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(title) between 2 and 100),
  task_ids text[] not null check (coalesce(array_length(task_ids,1),0)=19),
  answers jsonb not null default '{}'::jsonb check (jsonb_typeof(answers)='object'),
  correct_flags jsonb,
  score integer check (score between 0 and 19),
  status text not null default 'assigned' check (status in ('assigned','submitted')),
  created_at timestamptz not null default now(),
  submitted_at timestamptz
);
create table if not exists public.oge_answer_key (
  task_id text primary key,
  exam_no smallint not null check (exam_no between 1 and 19),
  proto_no smallint not null,
  accepted text[] not null,
  active boolean not null
);

create index if not exists oge_students_by_class on public.oge_students(classroom_id);
create index if not exists oge_assign_by_student on public.oge_assignments(student_id,created_at desc);
create index if not exists oge_assign_by_class on public.oge_assignments(classroom_id,created_at desc);

-- Deny access by default, grant only read operations through RLS policies.
revoke all on public.oge_answer_key from anon,authenticated;
alter table public.oge_answer_key enable row level security;
alter table public.oge_classrooms enable row level security;
alter table public.oge_students enable row level security;
alter table public.oge_assignments enable row level security;

grant select on public.oge_classrooms,public.oge_students,public.oge_assignments to authenticated;
-- Supabase anonymous users have the "authenticated" database role.
drop policy if exists oge_teacher_rooms on public.oge_classrooms;
create policy oge_teacher_rooms on public.oge_classrooms for select to authenticated
 using(teacher_id=auth.uid());
drop policy if exists oge_students_visible on public.oge_students;
create policy oge_students_visible on public.oge_students for select to authenticated
 using(user_id=auth.uid() OR EXISTS (
    SELECT 1 FROM public.oge_classrooms c WHERE c.id=classroom_id AND c.teacher_id=auth.uid()
 ));
drop policy if exists oge_assignments_visible on public.oge_assignments;
create policy oge_assignments_visible on public.oge_assignments for select to authenticated
 using(student_id=auth.uid() OR EXISTS (
    SELECT 1 FROM public.oge_classrooms c WHERE c.id=classroom_id AND c.teacher_id=auth.uid()
  ));

create or replace function public.oge_create_class(p_title text)
returns table(id uuid,title text,join_code text)
language plpgsql security definer set search_path = '' as $$
begin
 if auth.uid() is null OR coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then
  raise exception 'Войти как преподаватель можно только по email';
 end if;
 if length(trim(p_title)) not between 2 and 80 then raise exception 'Введите название группы (2–80 символов)'; end if;
 return query insert into public.oge_classrooms(teacher_id,title)
 values(auth.uid(),trim(p_title)) returning oge_classrooms.id,oge_classrooms.title,oge_classrooms.join_code;
end; $$;

create or replace function public.oge_join_class(p_code text,p_nickname text)
returns table(classroom_id uuid,classroom_title text)
language plpgsql security definer set search_path = '' as $$
declare v_class public.oge_classrooms;
begin
 if auth.uid() is null then raise exception 'Сначала войдите в кабинет'; end if;
 if length(trim(p_nickname)) not between 2 and 40 then raise exception 'Псевдоним: от 2 до 40 символов'; end if;
 select * into v_class from public.oge_classrooms where join_code=upper(trim(p_code));
 if not found then raise exception 'Группа с таким кодом не найдена'; end if;
 insert into public.oge_students(classroom_id,user_id,nickname)
 values(v_class.id,auth.uid(),trim(p_nickname))
 on conflict(classroom_id,user_id) do update set nickname=excluded.nickname;
 return query select v_class.id,v_class.title;
end; $$;

-- Students read their own classrooms through a SECURITY DEFINER function;
-- class join codes are never returned to students.
create or replace function public.oge_my_classes()
returns table(classroom_id uuid,classroom_title text,nickname text)
language sql security definer set search_path = '' as $$
 select c.id,c.title,s.nickname from public.oge_students s
 join public.oge_classrooms c on c.id=s.classroom_id
 where s.user_id=auth.uid() order by s.joined_at desc;
$$;

create or replace function public.oge_assign_variant(
 p_classroom_id uuid,p_student_id uuid,p_title text,p_task_ids text[])
returns uuid
language plpgsql security definer set search_path = '' as $$
declare i integer; v_id uuid; v_task text; v_p integer;
begin
 if auth.uid() is null or not exists (select 1 from public.oge_classrooms
   where id=p_classroom_id and teacher_id=auth.uid()) then
   raise exception 'Только преподаватель группы может назначать работы';
 end if;
 if not exists(select 1 from public.oge_students where classroom_id=p_classroom_id and user_id=p_student_id) then
   raise exception 'Ученик не состоит в группе';
 end if;
 if length(trim(p_title)) not between 2 and 100 then raise exception 'Введите название работы'; end if;
 if coalesce(array_length(p_task_ids,1),0)<>19 then raise exception 'В работе должно быть 19 заданий'; end if;
 for i in 1..19 loop
   v_task:=p_task_ids[i];
   if not exists(select 1 from public.oge_answer_key where task_id=v_task and exam_no=i and active) then
      raise exception 'Недопустимый номер задания: %',v_task;
   end if;
   if i=1 then v_p := split_part(v_task,'.',2)::integer; end if;
   if i <= 5 and split_part(v_task,'.',2)::integer <> v_p then
     raise exception 'Задания №1–5 должны иметь общий сюжет';
   end if;
 end loop;
 insert into public.oge_assignments(classroom_id,student_id,title,task_ids)
 values(p_classroom_id,p_student_id,trim(p_title),p_task_ids) returning id into v_id;
 return v_id;
end; $$;

create or replace function public.oge_save_draft(p_assignment_id uuid,p_answers jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
begin
 if auth.uid() is null or jsonb_typeof(p_answers)<>'object' or pg_catalog.length(p_answers::text)>6000 then
  raise exception 'Недопустимые ответы';
 end if;
 update public.oge_assignments set answers=p_answers
 where id=p_assignment_id and student_id=auth.uid() and status='assigned';
 if not found then raise exception 'Работа не найдена или уже проверена'; end if;
end; $$;

create or replace function public.oge_normalize_answer(p_answer text)
returns text language sql immutable set search_path = '' as $$
 select pg_catalog.replace(pg_catalog.replace(
   pg_catalog.regexp_replace(pg_catalog.lower(pg_catalog.btrim(coalesce(p_answer,''))), '[[:space:]]+', '', 'g'),'.',','), '−','-');
$$;

create or replace function public.oge_submit_variant(p_assignment_id uuid,p_answers jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_variant public.oge_assignments; v_actual text; v_expected text; v_flag boolean;
  v_flags jsonb:='[]'::jsonb; v_score integer:=0; i integer;
begin
 if auth.uid() is null or jsonb_typeof(p_answers)<>'object' or pg_catalog.length(p_answers::text)>6000 then
   raise exception 'Недопустимые ответы';
 end if;
 select * into v_variant from public.oge_assignments
 where id=p_assignment_id and student_id=auth.uid() and status='assigned' for update;
 if not found then raise exception 'Работа не найдена или уже сдана'; end if;
 for i in 1..19 loop
   v_actual := public.oge_normalize_answer(p_answers->> (i-1)::text);
   select exists(select 1 from public.oge_answer_key ak,
     unnest(ak.accepted) as x(ans)
     where ak.task_id=v_variant.task_ids[i] and
     public.oge_normalize_answer(x.ans)=v_actual and v_actual<>'') into v_flag;
   v_flags:=v_flags || jsonb_build_array(v_flag);
   if v_flag then v_score:=v_score+1; end if;
 end loop;
 update public.oge_assignments set answers=p_answers,correct_flags=v_flags,
  score=v_score,status='submitted',submitted_at=now() where id=p_assignment_id;
 return jsonb_build_object('score',v_score,'results',v_flags);
end; $$;

revoke all on function public.oge_create_class(text) from public,anon;
revoke all on function public.oge_join_class(text,text) from public,anon;
revoke all on function public.oge_my_classes() from public,anon;
revoke all on function public.oge_assign_variant(uuid,uuid,text,text[]) from public,anon;
revoke all on function public.oge_save_draft(uuid,jsonb) from public,anon;
revoke all on function public.oge_submit_variant(uuid,jsonb) from public,anon;
grant execute on function public.oge_create_class(text), public.oge_join_class(text,text),
 public.oge_my_classes(), public.oge_assign_variant(uuid,uuid,text,text[]),
 public.oge_save_draft(uuid,jsonb),public.oge_submit_variant(uuid,jsonb) to authenticated;

-- The 293 source prototype IDs and verified numeric/text keys; OLD/SIM not assignable.
insert into public.oge_answer_key(task_id,exam_no,proto_no,accepted,active)
values
('1.1',1,1,ARRAY['142']::text[],true),
('2.1',2,1,ARRAY['41']::text[],true),
('3.1',3,1,ARRAY['29']::text[],true),
('4.1',4,1,ARRAY['116']::text[],true),
('5.1',5,1,ARRAY['930']::text[],true),
('1.2',1,2,ARRAY['4625']::text[],true),
('2.2',2,2,ARRAY['8']::text[],true),
('3.2',3,2,ARRAY['15']::text[],true),
('4.2',4,2,ARRAY['57,2']::text[],true),
('5.2',5,2,ARRAY['9,2']::text[],true),
('1.3',1,3,ARRAY['195']::text[],true),
('2.3',2,3,ARRAY['107,25']::text[],true),
('3.3',3,3,ARRAY['549,8']::text[],true),
('4.3',4,3,ARRAY['2,75']::text[],true),
('5.3',5,3,ARRAY['1,4']::text[],true),
('1.4',1,4,ARRAY['7425']::text[],true),
('2.4',2,4,ARRAY['7']::text[],true),
('3.4',3,4,ARRAY['36']::text[],true),
('4.4',4,4,ARRAY['29']::text[],true),
('5.4',5,4,ARRAY['500']::text[],true),
('1.5',1,5,ARRAY['2413']::text[],true),
('2.5',2,5,ARRAY['2']::text[],true),
('3.5',3,5,ARRAY['1250','1247,4']::text[],true),
('4.5',4,5,ARRAY['840']::text[],true),
('5.5',5,5,ARRAY['1250']::text[],true),
('1.6',1,6,ARRAY['312']::text[],true),
('2.6',2,6,ARRAY['15,4']::text[],true),
('3.6',3,6,ARRAY['2000']::text[],true),
('4.6',4,6,ARRAY['16200']::text[],true),
('5.6',5,6,ARRAY['65']::text[],true),
('1.7',1,7,ARRAY['2346']::text[],true),
('2.7',2,7,ARRAY['3,2']::text[],true),
('3.7',3,7,ARRAY['12']::text[],true),
('4.7',4,7,ARRAY['680']::text[],true),
('5.7',5,7,ARRAY['29700']::text[],true),
('1.8',1,8,ARRAY['76108']::text[],true),
('2.8',2,8,ARRAY['440']::text[],true),
('3.8',3,8,ARRAY['4']::text[],true),
('4.8',4,8,ARRAY['40']::text[],true),
('5.8',5,8,ARRAY['440']::text[],true),
('6.1',6,1,ARRAY['15,3']::text[],true),
('6.2',6,2,ARRAY['1,4']::text[],true),
('6.3',6,3,ARRAY['16,12']::text[],true),
('6.4',6,4,ARRAY['6']::text[],true),
('6.5',6,5,ARRAY['1,6']::text[],true),
('6.6',6,6,ARRAY['−0,4']::text[],true),
('6.7',6,7,ARRAY['10,5']::text[],true),
('6.8',6,8,ARRAY['17,5']::text[],true),
('6.9',6,9,ARRAY['22']::text[],false),
('6.10',6,10,ARRAY['17,5']::text[],true),
('7.1',7,1,ARRAY['2']::text[],true),
('7.2',7,2,ARRAY['1']::text[],true),
('7.3',7,3,ARRAY['1']::text[],true),
('7.4',7,4,ARRAY['2']::text[],true),
('7.5',7,5,ARRAY['3']::text[],true),
('7.6',7,6,ARRAY['3']::text[],true),
('7.7',7,7,ARRAY['3']::text[],true),
('7.8',7,8,ARRAY['1']::text[],true),
('7.9',7,9,ARRAY['1']::text[],true),
('7.10',7,10,ARRAY['4']::text[],true),
('7.11',7,11,ARRAY['3']::text[],true),
('7.12',7,12,ARRAY['1']::text[],true),
('7.13',7,13,ARRAY['2']::text[],true),
('7.14',7,14,ARRAY['4']::text[],true),
('7.15',7,15,ARRAY['2']::text[],true),
('7.16',7,16,ARRAY['4']::text[],true),
('7.17',7,17,ARRAY['4']::text[],true),
('8.1',8,1,ARRAY['32']::text[],true),
('8.2',8,2,ARRAY['8']::text[],true),
('8.3',8,3,ARRAY['16']::text[],true),
('8.4',8,4,ARRAY['8']::text[],true),
('8.5',8,5,ARRAY['8']::text[],true),
('8.6',8,6,ARRAY['49']::text[],true),
('8.7',8,7,ARRAY['12']::text[],true),
('8.8',8,8,ARRAY['20']::text[],true),
('8.9',8,9,ARRAY['16']::text[],true),
('8.10',8,10,ARRAY['30']::text[],true),
('8.11',8,11,ARRAY['260']::text[],true),
('8.12',8,12,ARRAY['2']::text[],true),
('8.13',8,13,ARRAY['3']::text[],true),
('8.14',8,14,ARRAY['6']::text[],true),
('8.15',8,15,ARRAY['2']::text[],true),
('8.16',8,16,ARRAY['19']::text[],true),
('8.17',8,17,ARRAY['2']::text[],true),
('8.18',8,18,ARRAY['0,4']::text[],true),
('8.19',8,19,ARRAY['3']::text[],true),
('8.20',8,20,ARRAY['4']::text[],true),
('8.21',8,21,ARRAY['4']::text[],false),
('8.22',8,22,ARRAY['27']::text[],true),
('8.23',8,23,ARRAY['125']::text[],true),
('8.24',8,24,ARRAY['64']::text[],true),
('8.25',8,25,ARRAY['64']::text[],true),
('8.26',8,26,ARRAY['9']::text[],true),
('8.27',8,27,ARRAY['16']::text[],true),
('8.28',8,28,ARRAY['125']::text[],true),
('8.29',8,29,ARRAY['9']::text[],true),
('8.30',8,30,ARRAY['16']::text[],true),
('8.31',8,31,ARRAY['40']::text[],true),
('8.32',8,32,ARRAY['50']::text[],true),
('8.33',8,33,ARRAY['2']::text[],true),
('8.34',8,34,ARRAY['6']::text[],true),
('8.35',8,35,ARRAY['15']::text[],true),
('9.1',9,1,ARRAY['−0,3']::text[],true),
('9.2',9,2,ARRAY['−5']::text[],true),
('9.3',9,3,ARRAY['13']::text[],true),
('9.4',9,4,ARRAY['−2,7']::text[],true),
('9.5',9,5,ARRAY['18']::text[],true),
('9.6',9,6,ARRAY['24']::text[],true),
('9.7',9,7,ARRAY['−32']::text[],true),
('9.8',9,8,ARRAY['−3']::text[],true),
('9.9',9,9,ARRAY['2']::text[],true),
('9.10',9,10,ARRAY['0']::text[],true),
('9.11',9,11,ARRAY['1']::text[],true),
('9.12',9,12,ARRAY['6']::text[],true),
('9.13',9,13,ARRAY['0,5']::text[],true),
('9.14',9,14,ARRAY['−0,8']::text[],false),
('10.1',10,1,ARRAY['0,9']::text[],true),
('10.2',10,2,ARRAY['0,9']::text[],true),
('10.3',10,3,ARRAY['0,1']::text[],true),
('10.4',10,4,ARRAY['0,3']::text[],true),
('10.5',10,5,ARRAY['0,1']::text[],true),
('10.6',10,6,ARRAY['0,95']::text[],true),
('10.7',10,7,ARRAY['0,55']::text[],true),
('10.8',10,8,ARRAY['0,42']::text[],true),
('10.9',10,9,ARRAY['0,65']::text[],true),
('10.10',10,10,ARRAY['0,25']::text[],true),
('10.11',10,11,ARRAY['0,55']::text[],true),
('10.12',10,12,ARRAY['0,9']::text[],true),
('10.13',10,13,ARRAY['0,98']::text[],true),
('10.14',10,14,ARRAY['0,8']::text[],true),
('10.15',10,15,ARRAY['0,6']::text[],true),
('10.16',10,16,ARRAY['0,7']::text[],true),
('10.17',10,17,ARRAY['0,6']::text[],true),
('10.18',10,18,ARRAY['0,75']::text[],true),
('11.1',11,1,ARRAY['213']::text[],true),
('11.2',11,2,ARRAY['231']::text[],true),
('11.3',11,3,ARRAY['231']::text[],true),
('11.4',11,4,ARRAY['321']::text[],true),
('11.5',11,5,ARRAY['321']::text[],true),
('11.6',11,6,ARRAY['132']::text[],true),
('11.7',11,7,ARRAY['132']::text[],true),
('11.8',11,8,ARRAY['321']::text[],true),
('11.9',11,9,ARRAY['132']::text[],true),
('11.10',11,10,ARRAY['132']::text[],true),
('12.1',12,1,ARRAY['22400']::text[],true),
('12.2',12,2,ARRAY['50500']::text[],true),
('12.3',12,3,ARRAY['−80']::text[],true),
('12.4',12,4,ARRAY['−148']::text[],true),
('12.5',12,5,ARRAY['490']::text[],true),
('12.6',12,6,ARRAY['20']::text[],true),
('12.7',12,7,ARRAY['20']::text[],true),
('12.8',12,8,ARRAY['4']::text[],true),
('12.9',12,9,ARRAY['5']::text[],true),
('12.10',12,10,ARRAY['6']::text[],true),
('12.11',12,11,ARRAY['0,0072']::text[],false),
('13.1',13,1,ARRAY['2']::text[],true),
('13.2',13,2,ARRAY['2']::text[],true),
('13.3',13,3,ARRAY['1']::text[],true),
('13.4',13,4,ARRAY['4']::text[],true),
('13.5',13,5,ARRAY['4']::text[],true),
('13.6',13,6,ARRAY['1']::text[],true),
('13.7',13,7,ARRAY['3']::text[],true),
('13.8',13,8,ARRAY['1']::text[],true),
('13.9',13,9,ARRAY['1']::text[],true),
('13.10',13,10,ARRAY['3']::text[],true),
('14.1',14,1,ARRAY['46']::text[],true),
('14.2',14,2,ARRAY['54']::text[],true),
('14.3',14,3,ARRAY['325']::text[],true),
('14.4',14,4,ARRAY['−60']::text[],true),
('14.5',14,5,ARRAY['110']::text[],true),
('14.6',14,6,ARRAY['60']::text[],true),
('14.7',14,7,ARRAY['6,3']::text[],true),
('14.8',14,8,ARRAY['130']::text[],false),
('14.9',14,9,ARRAY['12,5']::text[],true),
('14.10',14,10,ARRAY['243']::text[],true),
('14.11',14,11,ARRAY['6']::text[],true),
('15.1',15,1,ARRAY['59']::text[],true),
('15.2',15,2,ARRAY['83']::text[],true),
('15.3',15,3,ARRAY['72']::text[],true),
('15.4',15,4,ARRAY['39']::text[],true),
('15.5',15,5,ARRAY['66']::text[],false),
('15.6',15,6,ARRAY['12']::text[],true),
('15.7',15,7,ARRAY['105']::text[],true),
('15.8',15,8,ARRAY['81']::text[],true),
('15.9',15,9,ARRAY['33']::text[],true),
('15.10',15,10,ARRAY['6']::text[],true),
('15.11',15,11,ARRAY['18']::text[],true),
('15.12',15,12,ARRAY['22']::text[],true),
('15.13',15,13,ARRAY['22']::text[],true),
('15.14',15,14,ARRAY['15']::text[],true),
('15.15',15,15,ARRAY['15']::text[],true),
('15.16',15,16,ARRAY['15']::text[],true),
('15.17',15,17,ARRAY['13']::text[],true),
('15.18',15,18,ARRAY['18']::text[],true),
('15.19',15,19,ARRAY['10']::text[],true),
('15.20',15,20,ARRAY['124']::text[],true),
('15.21',15,21,ARRAY['25']::text[],true),
('15.22',15,22,ARRAY['12']::text[],true),
('15.23',15,23,ARRAY['0,8']::text[],true),
('15.24',15,24,ARRAY['9']::text[],true),
('15.25',15,25,ARRAY['0,35']::text[],true),
('15.26',15,26,ARRAY['4']::text[],true),
('15.27',15,27,ARRAY['9']::text[],true),
('15.28',15,28,ARRAY['0,6']::text[],true),
('16.1',16,1,ARRAY['68']::text[],true),
('16.2',16,2,ARRAY['148']::text[],true),
('16.3',16,3,ARRAY['58']::text[],true),
('16.4',16,4,ARRAY['81']::text[],true),
('16.5',16,5,ARRAY['29,5']::text[],true),
('16.6',16,6,ARRAY['5']::text[],true),
('16.7',16,7,ARRAY['24']::text[],true),
('16.8',16,8,ARRAY['5']::text[],true),
('16.9',16,9,ARRAY['2']::text[],true),
('16.10',16,10,ARRAY['6']::text[],true),
('16.11',16,11,ARRAY['16']::text[],true),
('16.12',16,12,ARRAY['1']::text[],true),
('16.13',16,13,ARRAY['12']::text[],true),
('16.14',16,14,ARRAY['149']::text[],true),
('16.15',16,15,ARRAY['148']::text[],true),
('16.16',16,16,ARRAY['32']::text[],true),
('16.17',16,17,ARRAY['66']::text[],true),
('16.18',16,18,ARRAY['147']::text[],true),
('16.19',16,19,ARRAY['4']::text[],true),
('16.20',16,20,ARRAY['8']::text[],true),
('16.21',16,21,ARRAY['3,2']::text[],true),
('16.22',16,22,ARRAY['36']::text[],true),
('16.23',16,23,ARRAY['12']::text[],true),
('16.24',16,24,ARRAY['3']::text[],true),
('16.25',16,25,ARRAY['33']::text[],true),
('16.26',16,26,ARRAY['3']::text[],true),
('16.27',16,27,ARRAY['196']::text[],true),
('16.28',16,28,ARRAY['8']::text[],true),
('16.29',16,29,ARRAY['4,8']::text[],true),
('16.30',16,30,ARRAY['24']::text[],true),
('16.31',16,31,ARRAY['20']::text[],true),
('16.32',16,32,ARRAY['32']::text[],true),
('16.33',16,33,ARRAY['9']::text[],true),
('16.34',16,34,ARRAY['19']::text[],true),
('17.1',17,1,ARRAY['154']::text[],true),
('17.2',17,2,ARRAY['89']::text[],true),
('17.3',17,3,ARRAY['18']::text[],true),
('17.4',17,4,ARRAY['125']::text[],true),
('17.5',17,5,ARRAY['45']::text[],true),
('17.6',17,6,ARRAY['6']::text[],true),
('17.7',17,7,ARRAY['20']::text[],true),
('17.8',17,8,ARRAY['5']::text[],true),
('17.9',17,9,ARRAY['3']::text[],true),
('17.10',17,10,ARRAY['70']::text[],true),
('17.11',17,11,ARRAY['156']::text[],true),
('17.12',17,12,ARRAY['87']::text[],true),
('17.13',17,13,ARRAY['59']::text[],true),
('17.14',17,14,ARRAY['64']::text[],true),
('17.15',17,15,ARRAY['69']::text[],true),
('17.16',17,16,ARRAY['2']::text[],true),
('17.17',17,17,ARRAY['12,5']::text[],true),
('17.18',17,18,ARRAY['18']::text[],true),
('17.19',17,19,ARRAY['88']::text[],true),
('17.20',17,20,ARRAY['14']::text[],true),
('17.21',17,21,ARRAY['4']::text[],true),
('17.22',17,22,ARRAY['143']::text[],true),
('17.23',17,23,ARRAY['78']::text[],true),
('17.24',17,24,ARRAY['49']::text[],true),
('17.25',17,25,ARRAY['114']::text[],true),
('17.26',17,26,ARRAY['82']::text[],true),
('17.27',17,27,ARRAY['157']::text[],true),
('17.28',17,28,ARRAY['102']::text[],true),
('17.29',17,29,ARRAY['35']::text[],true),
('17.30',17,30,ARRAY['44']::text[],true),
('17.31',17,31,ARRAY['4,5']::text[],true),
('17.32',17,32,ARRAY['3']::text[],true),
('17.33',17,33,ARRAY['13']::text[],true),
('17.34',17,34,ARRAY['5']::text[],true),
('17.35',17,35,ARRAY['10']::text[],true),
('17.36',17,36,ARRAY['4']::text[],true),
('17.37',17,37,ARRAY['33']::text[],true),
('17.38',17,38,ARRAY['4']::text[],true),
('17.39',17,39,ARRAY['63']::text[],true),
('17.40',17,40,ARRAY['3,5']::text[],true),
('18.1',18,1,ARRAY['6']::text[],true),
('18.2',18,2,ARRAY['4']::text[],true),
('18.3',18,3,ARRAY['2']::text[],true),
('18.4',18,4,ARRAY['3']::text[],true),
('18.5',18,5,ARRAY['1']::text[],true),
('18.6',18,6,ARRAY['4']::text[],true),
('18.7',18,7,ARRAY['5']::text[],true),
('18.8',18,8,ARRAY['9']::text[],true),
('18.9',18,9,ARRAY['10']::text[],true),
('18.10',18,10,ARRAY['6']::text[],true),
('18.11',18,11,ARRAY['10']::text[],true),
('18.12',18,12,ARRAY['2']::text[],true),
('18.13',18,13,ARRAY['16']::text[],true),
('19.1',19,1,ARRAY['1']::text[],true),
('19.2',19,2,ARRAY['13','31']::text[],true)
on conflict(task_id) do update set exam_no=excluded.exam_no,proto_no=excluded.proto_no,
 accepted=excluded.accepted,active=excluded.active;
