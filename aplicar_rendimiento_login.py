#!/usr/bin/env python3
"""Aplica 3 cambios sin depender del resto del archivo. Ejecutar en la raíz del proyecto:
   python3 aplicar_rendimiento_login.py
Es seguro repetirlo: si un cambio ya está, lo salta. Revisa con `git diff` y haz commit."""
import re, sys

def editar(ruta, cambios):
    s = open(ruta, encoding='utf-8').read()
    for nombre, viejo, nuevo, marca in cambios:
        if marca in s:
            print(f'= {ruta}: {nombre} (ya estaba)'); continue
        if viejo not in s:
            print(f'! {ruta}: NO encontré el texto de "{nombre}". No se cambió nada en este archivo.'); return False
        s = s.replace(viejo, nuevo, 1); print(f'+ {ruta}: {nombre}')
    open(ruta, 'w', encoding='utf-8').write(s); return True

ok = True
ok &= editar('js/app.js', [
 ('variable de firma', "let sincronizando = false;", "let sincronizando = false;\nlet ultimaFirmaNube = '';", "let ultimaFirmaNube"),
 ('no repintar si no hay cambios',
  "        const hoyStr = obtenerFechaHoyStr();\n        const nuevosPedidos = [];",
  """        const hoyStr = obtenerFechaHoyStr();
        // Sin cambios en la nube ni en local: no reconstruir ni repintar toda la pantalla (causaba el trabado)
        const firma = [hoyStr, usuarioActual.rol, pedidos.length, apartados.length, idsEnCola.size].join(',') + '#' +
            remotos.map((r) => [r.id, r.estado, r.total, r.medio_pago, r.notas, r.entrega_programada_at, r.clientes?.nombre, (r.pedido_detalles || []).length].join('|')).join(';');
        if (firma === ultimaFirmaNube) return;
        ultimaFirmaNube = firma;
        const nuevosPedidos = [];""", "if (firma === ultimaFirmaNube)"),
 ('no sincronizar en segundo plano',
  "if (navigator.onLine) sincronizarDesdeNubeMultiDispositivo();\n    }, 15000);",
  "if (navigator.onLine && !document.hidden) sincronizarDesdeNubeMultiDispositivo();\n    }, 15000);", "navigator.onLine && !document.hidden"),
 ('agrupar avisos de la nube',
  """    api.suscribirCambiosRealtime(async (tabla) => {
        if (tabla === 'productos') await cargarCatalogoProductos();
        if (tabla === 'pedidos') await sincronizarDesdeNubeMultiDispositivo();
    });""",
  """    let temporizadorRealtime = null;
    api.suscribirCambiosRealtime((tabla) => {
        clearTimeout(temporizadorRealtime);
        temporizadorRealtime = setTimeout(() => {
            if (tabla === 'productos') cargarCatalogoProductos();
            if (tabla === 'pedidos') sincronizarDesdeNubeMultiDispositivo();
        }, 800);
    });""", "temporizadorRealtime"),
])

ok &= editar('index.html', [
 ('pestañas: Cliente primero',
  '''        <button type="button" class="role-tab active" id="tabRoleAdmin">🔐 Administrador</button>
        <button type="button" class="role-tab" id="tabRoleCliente">👤 Soy Cliente</button>''',
  '''        <button type="button" class="role-tab active" id="tabRoleCliente">👤 Soy Cliente</button>
        <button type="button" class="role-tab" id="tabRoleAdmin">🔐 Administrador</button>''',
  '''class="role-tab active" id="tabRoleCliente"'''),
 ('formulario admin oculto', '<form id="formLoginAdminGate" style="display: block;', '<form id="formLoginAdminGate" style="display: none;', '<form id="formLoginAdminGate" style="display: none;'),
 ('formulario cliente visible', '<form id="formLoginCliente" style="display: none;', '<form id="formLoginCliente" style="display: block;', '<form id="formLoginCliente" style="display: block;'),
])

try:
    s = open('sw.js', encoding='utf-8').read()
    s2 = re.sub(r"frizzy-pos-v(\d+)", lambda m: f"frizzy-pos-v{int(m.group(1)) + 1}", s, 1)
    open('sw.js', 'w', encoding='utf-8').write(s2); print('+ sw.js: versión de caché subida')
except Exception as e:
    ok = False; print('! sw.js:', e)

sys.exit(0 if ok else 1)
