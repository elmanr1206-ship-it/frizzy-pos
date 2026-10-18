#!/usr/bin/env python3
"""Arregla el scroll trabado. Ejecutar en la raíz del proyecto: python3 aplicar_fluidez.py
Solo agrega un bloque al final de css/styles.css y sube la versión de caché de sw.js.
Seguro repetirlo. Después: git add css/styles.css sw.js && git commit && git push (NO subas este script)."""
import re

MARCA = '/* === FLUIDEZ (scroll) === */'
BLOQUE = MARCA + '''
/* 1) Fondo fijo en su propia capa de GPU: se pinta una vez, no en cada fotograma del scroll */
html { background: #16052E; }
body { background: none !important; }
body::before {
  content: "";
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  transform: translateZ(0);
  background:
    radial-gradient(900px 560px at 12% 5%, rgba(132, 68, 212, 0.52) 0%, transparent 62%),
    radial-gradient(850px 520px at 90% 12%, rgba(245, 166, 35, 0.24) 0%, transparent 58%),
    radial-gradient(980px 640px at 50% 96%, rgba(102, 42, 178, 0.48) 0%, transparent 65%),
    linear-gradient(180deg, #16052E 0%, #240B47 52%, #120326 100%);
}

/* 2) Sin desenfoque en elementos repetidos (tarjetas, chips, pedidos, paneles...) */
*, *::before, *::after {
  -webkit-backdrop-filter: none !important;
  backdrop-filter: none !important;
}
/* Solo lo que flota sobre el contenido conserva un desenfoque ligero */
.modal-backdrop, .auth-gate-backdrop, .total-bar, #alarmBanner, #toast, .green-order-card, .apple-status-pill {
  -webkit-backdrop-filter: blur(10px) !important;
  backdrop-filter: blur(10px) !important;
}
'''

css = open('css/styles.css', encoding='utf-8').read()
if MARCA in css:
    print('= css/styles.css: ya estaba')
else:
    open('css/styles.css', 'w', encoding='utf-8').write(css.rstrip('\n') + '\n\n' + BLOQUE)
    print('+ css/styles.css: bloque de fluidez agregado')
    sw = open('sw.js', encoding='utf-8').read()
    sw = re.sub(r"frizzy-pos-v(\d+)", lambda m: f"frizzy-pos-v{int(m.group(1)) + 1}", sw, count=1)
    open('sw.js', 'w', encoding='utf-8').write(sw)
    print('+ sw.js: versión de caché subida')
