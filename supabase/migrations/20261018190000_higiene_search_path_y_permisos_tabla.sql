-- search_path fijo en funciones de private (todas usan nombres calificados)
alter function private.ip_cliente() set search_path = pg_catalog, pg_temp;
alter function private.pin_bloqueado() set search_path = pg_catalog, pg_temp;
alter function private.registrar_fallo_pin() set search_path = pg_catalog, pg_temp;

-- Permisos de tabla que ninguna parte de la app usa (PostgREST no expone TRUNCATE; RLS sigue igual)
revoke truncate, references, trigger on
    public.clientes, public.configuracion_sistema, public.pedido_detalles, public.pedidos, public.productos
    from anon, authenticated;
revoke truncate, references, trigger on public.reportes_fallidos from authenticated;
