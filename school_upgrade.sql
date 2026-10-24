-- sashosha math | Mini-school materials schema update
-- Run once AFTER existing supabase.sql and homework_upgrade.sql.
-- No existing classes, students, assignments or results are deleted.
create table if not exists public.school_materials (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references public.oge_classrooms(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 120),
  description text not null default '' check (char_length(description)<=500),
  url text not null check (url ~ '^https://[^[:space:]]+$' and char_length(url)<=2000),
  material_type text not null default 'link' check (material_type in ('notes','video','pdf','link')),
  created_at timestamptz not null default now()
);
create index if not exists school_materials_by_class on public.school_materials(classroom_id,created_at desc);
alter table public.school_materials enable row level security;
revoke all on public.school_materials from anon;
grant select,insert,delete on public.school_materials to authenticated;
drop policy if exists school_materials_select on public.school_materials;
create policy school_materials_select on public.school_materials for select to authenticated using (
 exists(select 1 from public.oge_classrooms c where c.id=classroom_id and c.teacher_id=auth.uid())
 or exists(select 1 from public.oge_students s where s.classroom_id=school_materials.classroom_id and s.user_id=auth.uid())
);
drop policy if exists school_materials_insert on public.school_materials;
create policy school_materials_insert on public.school_materials for insert to authenticated with check (
 coalesce((auth.jwt()->>'is_anonymous')::boolean,false)=false
 and exists(select 1 from public.oge_classrooms c where c.id=classroom_id and c.teacher_id=auth.uid())
);
drop policy if exists school_materials_delete on public.school_materials;
create policy school_materials_delete on public.school_materials for delete to authenticated using (
 exists(select 1 from public.oge_classrooms c where c.id=classroom_id and c.teacher_id=auth.uid())
);
