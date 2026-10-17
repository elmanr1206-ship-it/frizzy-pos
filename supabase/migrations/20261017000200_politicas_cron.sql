-- Políticas RLS (requieren public.es_admin() de la migración de funciones).
create policy clientes_admin on public.clientes as permissive for all to authenticated using (es_admin()) with check (es_admin());
create policy config_admin on public.configuracion_sistema as permissive for all to authenticated using (es_admin()) with check (es_admin());
create policy detalles_admin on public.pedido_detalles as permissive for all to authenticated using (es_admin()) with check (es_admin());
create policy pedidos_admin on public.pedidos as permissive for all to authenticated using (es_admin()) with check (es_admin());
create policy menu_lectura on public.productos as permissive for select to anon, authenticated using (true);
create policy menu_admin on public.productos as permissive for all to authenticated using (es_admin()) with check (es_admin());

-- Permisos de ejecución
revoke execute on function public.cerrar_jornada_y_notificar(text, boolean) from public, anon;
revoke execute on function public.actualizar_pedido_existente(uuid, varchar, varchar) from public, anon;
do $$ begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;

-- Cierre automático 00:00 Bogotá (05:00 UTC).
-- El token de Telegram NO va en el repo: crear con  select vault.create_secret('<TOKEN>', 'telegram_token');
select cron.schedule('cierre-automatico-frizzy-12am', '0 5 * * *', 'SELECT public.cerrar_jornada_y_notificar();');
