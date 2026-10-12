-- 006: itens em destaque (máx. 10 por empresa).
-- Rodar no SQL Editor do Supabase em bancos criados antes desta mudança (depois da 005).

alter table itens add column destaque boolean not null default false;

-- Limite de 10 destaques por empresa. Trava a linha da empresa para duas edições simultâneas
-- não passarem juntas do limite.
create or replace function public._limite_destaques()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.destaque and (tg_op = 'INSERT' or not old.destaque or old.empresa_id <> new.empresa_id) then
    perform 1 from empresas where id = new.empresa_id for update;
    if (select count(*) from itens where empresa_id = new.empresa_id and destaque and id <> new.id) >= 10 then
      raise exception 'Máximo de 10 itens em destaque';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public._limite_destaques() from public, anon, authenticated;

create trigger itens_limite_destaques
  before insert or update of destaque, empresa_id on itens
  for each row execute function public._limite_destaques();
