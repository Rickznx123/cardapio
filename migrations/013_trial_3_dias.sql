-- 013: novos cadastros recebem 3 dias de teste gratis.
-- Alterar somente o default nao modifica trial_ate de empresas ja cadastradas.
alter table public.empresas
  alter column trial_ate set default now() + interval '3 days';
