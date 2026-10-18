-- El PIN actual cumple el formato (6 a 12 dígitos): se valida la restricción que estaba NOT VALID
alter table public.configuracion_sistema validate constraint cliente_pin_formato;

-- Defensa en profundidad: tablas internas con RLS activo y sin políticas (solo las usan funciones SECURITY DEFINER y el cron)
alter table private.pin_intentos enable row level security;
alter table private.respaldo_acceso enable row level security;
