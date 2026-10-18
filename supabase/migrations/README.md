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

`20261017220000_reporte_parcial_final.sql`: el botón del admin hace un **corte parcial**; el cron de las 00:00 (Bogotá) envía el **reporte final** del día aunque ya esté todo cerrado. Ambos incluyen "Unidades despachadas".
`20261017215000_telegram_cola.sql`: cola de envíos a Telegram con reintentos (tabla `private.telegram_outbox`, `telegram_enviar`, `telegram_reintentar` y su cron cada minuto).

## 18/10/2026
- `20261018100000_respaldos.sql`: `exportar_respaldo(token)` (protegida por token) y `private.restaurar_respaldo(json)`. Ver `RESPALDOS.md`.
- `20261018100100_pin_por_ip.sql`: el bloqueo del PIN es por IP (8 fallos en 15 min) con tope global de 100.
- `20261018100200_reportes_fallidos.sql`: los reportes de Telegram no entregados se guardan en `reportes_fallidos` (se ven en el dashboard).

