# Días · calendario personal (PWA para iPhone)

Calendario con los meses seguidos en vertical (como la app Calendario del iPhone), una cruz roja en los
días pasados, marcas propias (nombre, color, forma y estilo), anotaciones por día, modo edición para dibujar
a mano sobre cada mes y una foto de fondo para cada mes. Todo se guarda en el propio iPhone (IndexedDB)
y funciona sin conexión. Sin dependencias ni paso de compilación.

## Uso
- **Tocar un día**: elegir marca y escribir una anotación (se guarda sola).
- **Marcar** (abajo a la derecha): eliges una marca y cada día que toques la recibe (otro toque la quita).
- **Lápiz** (arriba): modo edición para dibujar con el dedo sobre el mes (rotuladores, goma, grosor, deshacer). Se guarda solo.
- Dos vistas (botón de arriba a la izquierda del lápiz): **continua**, con las semanas seguidas sin huecos entre meses y el mes marcado sobre el día 1; y **mes a mes**, que se cambia deslizando a los lados. «Hoy» vuelve al mes actual.
- **Ajustes** (rueda): crear/editar tipos de marca, foto de fondo de cada mes (desde el carrete), oscurecer la foto, tachar o no los días pasados, exportar/importar copia (JSON con fotos incluidas).

## Probar en el ordenador
    npm run dev      # http://localhost:3000  (el service worker solo se activa con ?sw=1)
    npm test         # tests de la lógica (node --test)

## Instalar en el iPhone
Safari solo instala apps web servidas por **HTTPS**. Hay que subir esta carpeta tal cual a un hosting estático
(sin repositorio, p. ej. arrastrándola a Netlify Drop), abrir la URL en Safari → Compartir → «Añadir a pantalla de inicio».
Una vez instalada funciona sin conexión y los datos quedan solo en el móvil.

## Estructura
    index.html · manifest.webmanifest · sw.js
    css/tokens.css   colores (tema claro y oscuro), radios, sombras, tipografías y fondos por defecto de cada mes
    css/app.css      estilos (solo var(--...))
    js/app.js        interfaz
    js/cal.js        lógica pura (rejilla, validación, copia)  ← tests en tests/
    js/shapes.js     SVG de las formas
    js/store.js      IndexedDB
    js/i18n.js       textos
    fonts/           Fraunces y Figtree (OFL)
    scripts/         icono (SVG → PNG con Playwright)

Si cambias archivos, sube `VERSION` en `sw.js` para que el iPhone descargue la versión nueva.
