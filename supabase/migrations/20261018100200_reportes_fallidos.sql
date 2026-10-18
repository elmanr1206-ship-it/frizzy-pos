-- Los reportes de Telegram que no se pudieron entregar ya no se descartan: quedan guardados
-- para que el admin los vea en el dashboard.
create table if not exists public.reportes_fallidos (
    id uuid primary key default gen_random_uuid(),
    creado timestamptz not null default now(),
    chat_id text,
    texto text not null
);
alter table public.reportes_fallidos enable row level security;
revoke all on public.reportes_fallidos from anon;
drop policy if exists reportes_fallidos_admin on public.reportes_fallidos;
create policy reportes_fallidos_admin on public.reportes_fallidos
    for all to authenticated using ((select public.es_admin())) with check ((select public.es_admin()));

create or replace function private.telegram_reintentar()
returns void language plpgsql security definer set search_path to 'pg_catalog', 'public', 'pg_temp'
as $function$
declare v_token text;
begin
  -- entregado (200)
  delete from private.telegram_outbox o using net._http_response h
  where h.id = o.request_id and h.status_code = 200;

  -- no entregado (rechazo permanente de Telegram, 6 intentos o más de 2 horas): se guarda, no se descarta
  with perdidos as (
    delete from private.telegram_outbox o
    where o.id in (
      select o2.id from private.telegram_outbox o2
      left join net._http_response h on h.id = o2.request_id
      where (h.status_code between 400 and 499 and h.status_code <> 429)
         or (h.id is not null and o2.intentos >= 6)
         or o2.creado < now() - interval '2 hours')
    returning o.chat_id, o.texto, o.creado)
  insert into public.reportes_fallidos (chat_id, texto, creado)
  select chat_id, texto, creado from perdidos;

  select trim(decrypted_secret) into v_token from vault.decrypted_secrets where name = 'telegram_token' limit 1;
  if v_token is null then
    select trim(valor) into v_token from public.configuracion_sistema where clave = 'telegram_token';
  end if;
  if v_token is null or v_token = '' then return; end if;

  -- lo que queda con respuesta fallida (timeout, 5xx, 429) se reenvía
  update private.telegram_outbox o set
    intentos = o.intentos + 1,
    request_id = net.http_post(
      url := 'https://api.telegram.org/bot' || v_token || '/sendMessage',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object('chat_id', o.chat_id, 'text', o.texto, 'parse_mode', 'HTML'),
      timeout_milliseconds := 8000)
  from net._http_response h
  where h.id = o.request_id;
end $function$;
