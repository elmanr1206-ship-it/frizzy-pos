# Migraciones de Supabase (proyecto frizzi)

Orden de aplicación: los archivos `2026101700*` son la exportación base del esquema
(ya incluye los cambios de `fix_seguridad_rpc_y_permisos` y `telegram_token_en_vault`, que ya
estaban aplicados en la base). `20261017200000_endurecer_admin_pin_nombre.sql` es la migración
`endurecer_admin_pin_nombre` aplicada el 17/10/2026:

- `es_admin()` ahora exige `app_metadata.rol = 'admin'` (antes bastaba con estar autenticado).
- PIN de clientes validado en el servidor con bloqueo tras 15 intentos fallidos en 15 minutos.
- Nombre y apellido obligatorios para pedidos de clientes.
- `cerrar_jornada_y_notificar` solo para admin (el cron sigue funcionando).

Para dar permisos de admin a un usuario nuevo:
`update auth.users set raw_app_meta_data = raw_app_meta_data || '{"rol":"admin"}' where email = '...';`
