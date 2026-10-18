# Respaldos automáticos de Frizzy

Cada día a la 1:00 a. m. (hora de Bogotá, después del cierre de las 12:00 a. m.) un flujo de GitHub
Actions descarga todos los datos de Supabase, los comprime, **los cifra** y los guarda como un archivo
nuevo en la rama `respaldos` de este repo. No cuesta nada y no depende de ningún plan de pago.
Además, esa llamada diaria mantiene activo el proyecto (los proyectos Free se pausan tras 7 días sin uso).

Se respaldan: productos, configuración, clientes, pedidos, detalles y reportes de Telegram no entregados.

## Activarlo (una sola vez)

1. En Supabase → **SQL Editor**, ejecuta: `select private.nuevo_token_respaldo();` y copia el resultado.
   (Solo se guarda su huella; si lo pierdes, ejecuta lo mismo de nuevo y actualiza el secreto en GitHub.)
2. En GitHub → repo → **Settings → Secrets and variables → Actions → New repository secret**:
   - `BACKUP_TOKEN`: el token del paso 1.
   - `BACKUP_PASSPHRASE`: una frase larga que tú inventes. **Guárdala también en otro lugar seguro
     (gestor de contraseñas): sin ella los respaldos no se pueden abrir.**
3. GitHub → pestaña **Actions → Respaldo diario → Run workflow** para probar. Debe aparecer la rama
   `respaldos` con un archivo `respaldos/respaldo-AAAA-MM-DD.json.gz.enc`.

Si algún día falla, GitHub te avisa por correo. Si el repo pasa 60 días sin ninguna actividad, GitHub
pausa los flujos programados: reactívalo en la pestaña Actions.

## Abrir un respaldo

```
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass pass:'TU_FRASE' \
  -in respaldo-AAAA-MM-DD.json.gz.enc | gunzip > respaldo.json
```

## Restaurar

Solo agrega lo que falta (no pisa ni duplica filas que ya existen). En el SQL Editor de Supabase:

`select private.restaurar_respaldo('PEGA_AQUI_EL_JSON'::jsonb);`

O desde la terminal con `psql` (cadena de conexión en Supabase → Connect):

```
echo "select private.restaurar_respaldo(:'j'::jsonb);" | psql "$DATABASE_URL" -v j="$(cat respaldo.json)"
```
