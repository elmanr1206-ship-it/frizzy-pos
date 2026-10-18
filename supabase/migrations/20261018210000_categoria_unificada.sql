-- La app y el dashboard usan 'acompanante' (sin tilde); los productos iniciales quedaron como 'acompañante'.
update public.productos
set categoria = 'acompanante'
where lower(categoria) like 'acompa%' and categoria <> 'acompanante';
