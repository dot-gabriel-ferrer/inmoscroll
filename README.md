# InmoScroll 3D

Recorridos inmobiliarios inmersivos guiados por el scroll. La posición de la barra de
desplazamiento determina, de forma determinista, el avance de una cámara por el
interior de la vivienda.

Next.js (App Router) · React Three Fiber · GSAP ScrollTrigger · Lenis · Zustand.

## Puesta en marcha

```bash
npm install
npm run dev          # http://localhost:3000
```

| Script | Qué hace |
| --- | --- |
| `npm run dev` / `build` / `start` | Servidor de desarrollo, build de producción y servidor de producción. |
| `npm test` | Tests unitarios (Vitest): decodificadores de splats, ordenación, raíl de cámara. |
| `npm run lint` / `npm run typecheck` | ESLint y TypeScript. |
| `npm run assets:demo` | Regenera el ático de demostración (GLB + SPZ) y el manifiesto de hashes. |
| `npm run assets:optimize -- in.glb out.glb [--ktx2]` | Optimiza un GLB para la plataforma. |

Los decodificadores WASM (Draco y Basis/KTX2) se copian de `three` a
`public/decoders` antes de `dev` y `build`; no se depende de ningún CDN externo.

## Recorridos incluidos

- `/tour/atico-mirador`: malla GLB comprimida con Meshopt, con sombras, postprocesado y
  modo día/noche.
- `/tour/atico-mirador-splat`: la misma vivienda como Gaussian Splatting en `.spz`.

Ambos se generan por código (`scripts/generate-demo-assets.mjs`): son una maqueta de
volúmenes para ejercitar las dos tuberías de ingestión, no una captura real.

## Arquitectura

```
src/
  app/                       Portada y ruta /tour/[id]
  data/tours/                Árbol JSON de cada recorrido (capítulos -> anotaciones)
  store/tourStore.ts         Estado global (Zustand) y valores por fotograma
  components/scroll/         Lenis + reloj de GSAP
  components/three/          Canvas, raíl de cámara, luz, efectos, GLB, splats, anotaciones
  components/ui/             Barra superior, ficha de capítulo, raíl de progreso, menú, contacto
  lib/cameraPath.ts          Spline Catmull-Rom, look-ahead y encuadre
  lib/splat/                 Decodificadores, empaquetado, ordenación, worker y malla
scripts/                     Generación y optimización de activos
```

### Núcleo de render

- **Canvas** (`TourCanvas.tsx`): `frameloop="demand"`, redimensionado con debounce y
  contenedor fijo a `100vh`. En reposo no se dibuja ningún fotograma. La resolución
  depende del nivel de calidad (ver *Calidad adaptativa*).
- **Reloj único** (`SmoothScrollProvider.tsx`): Lenis sin rAF propio, avanzado desde
  `gsap.ticker`; `ScrollTrigger.update` en el callback de Lenis; `lagSmoothing(0)`.
- **Cámara** (`CameraRig.tsx`, `cameraPath.ts`): `CatmullRomCurve3` por los waypoints
  del recorrido, `ScrollTrigger` con `scrub`, y `lookAt` hacia un punto adelantado del
  mismo spline, aplicado en `useFrame`. Cada capítulo puede inclinar la mirada hacia un
  punto de interés.
- **Memoria** (`GltfModel.tsx`, `dispose.ts`): al desmontar se liberan geometrías,
  materiales y texturas y se llama a `useGLTF.clear()`.
- **Pérdida de contexto** (`TourCanvas.tsx`): si el navegador retira el contexto WebGL
  (falta de VRAM, pestaña en segundo plano), el canvas se reconstruye solo sobre un
  contexto nuevo conservando la posición del recorrido. Si ocurre con la página
  visible, vuelve con un nivel de calidad menos y `dpr = 1`. El aviso de error sólo
  aparece tras tres pérdidas seguidas o si WebGL no puede iniciarse.

### Calidad adaptativa

`detectDeviceProfile` (`lib/quality.ts`) elige el nivel inicial según núcleos, memoria
y tipo de puntero, y `PerformanceGovernor` baja un nivel cada vez que el render supera
el presupuesto de 60 fps durante más de un segundo de scroll continuo.

| Nivel | Malla GLB | Splats | `dpr` máximo |
| --- | --- | --- | --- |
| 3 | Oclusión, bloom, profundidad de campo, SMAA | Resolución completa | 2 |
| 2 | Oclusión (menos muestras), bloom, FXAA | Resolución reducida | 1,5 |
| 1 | Sin postprocesado: render directo al canvas | Resolución reducida | 1,5 (malla) · 1,25 (splats) |

En el nivel 1 el código de postprocesado ni siquiera se descarga (se carga con
`lazy`), el canvas usa MSAA si el dispositivo arranca en ese nivel, y los paneles de la
interfaz sustituyen el desenfoque de fondo por un color casi opaco
(`[data-quality="1"]` en `globals.css`).

### Luz y postprocesado

- Una única luz direccional proyecta sombras; su frustum ortográfico se ajusta a la
  caja de la geometría y el mapa se renderiza una vez (`autoUpdate = false`),
  repintándose sólo al cambiar entre día y noche. No hay luces puntuales con sombra.
- `Effects.tsx` monta a mano un `EffectComposer` de `postprocessing` con buffers
  `HalfFloatType`: oclusión ambiental (N8AO a media resolución y sin los renders
  adicionales de transparencias), Bloom con umbral, profundidad de campo ligada al
  punto de interés del capítulo y tone mapping ACES Filmic. El antialiasing va en una
  pasada final, sobre la imagen ya tonemapeada.

### Anotaciones

`Annotations.tsx` pinta los marcadores con `<Html>` de drei a partir del árbol JSON del
store. En cada fotograma renderizado se lanza un rayo (acelerado con BVH) de la cámara a
cada marcador; los que quedan detrás de geometría opaca o fuera del campo de visión se
ocultan con una transición CSS de opacidad.

### Gaussian Splatting

`lib/splat` es una implementación propia, sin dependencias:

- Decodificadores para `.spz` (versiones 1 a 3), `.ksplat` (niveles de compresión 0 a 2)
  y `.splat`.
- Un Web Worker dedicado descarga, decodifica y ordena. La ordenación es un counting
  sort sobre la profundidad cuantizada a 16 bits, y sólo se repite cuando gira la
  cámara (el orden no depende de la traslación).
- `GaussianSplatMesh` dibuja quads instanciados leyendo posición, covarianza y color de
  una textura `RGBA32UI`. Tras subirla a la GPU se libera la copia en memoria, y el
  canvas de splats se crea sin buffer de profundidad (el orden lo da la ordenación).

Sólo se usa el término DC del color: los armónicos esféricos de orden superior se
descartan al decodificar.

### Entrega de activos

`next.config.ts` sirve `/assets` y `/decoders` con
`Cache-Control: public, max-age=31536000, immutable`. Las URLs llevan el hash de
contenido (`?v=…`, de `src/data/asset-manifest.json`), así que un activo reexportado
cambia de URL. `NEXT_PUBLIC_ASSET_BASE_URL` permite servirlos desde un bucket o CDN.

## Despliegue en GitHub Pages

`.github/workflows/deploy-pages.yml` publica el sitio en cada push a `main` (o a mano
desde la pestaña Actions). Requiere activarlo una vez en el repositorio:
**Settings → Pages → Build and deployment → Source: GitHub Actions**.

El workflow hace una exportación estática (`STATIC_EXPORT=1`) con la ruta base que
indica Pages (`NEXT_PUBLIC_BASE_PATH`, `/inmoscroll` para un sitio de proyecto). Para
reproducirlo en local:

```bash
STATIC_EXPORT=1 NEXT_PUBLIC_BASE_PATH=/inmoscroll npm run build   # genera out/
```

En este modo no hay servidor, así que no se aplican las cabeceras `immutable` de
`next.config.ts`: Pages sirve todo con su propia caché corta. Las URLs con hash siguen
garantizando que un activo reexportado no se sirva obsoleto.

## Añadir un recorrido

1. Optimiza el modelo (`npm run assets:optimize`) o exporta la captura a `.spz` /
   `.ksplat`, y déjalo en `public/assets`.
2. Ejecuta `npm run assets:demo` para actualizar el manifiesto de hashes.
3. Crea `src/data/tours/<id>.json` siguiendo `src/types/tour.ts` y regístralo en
   `src/data/tours/index.ts`.

## Limitaciones conocidas

- **Sombras**: el informe prescribe `PCFSoftShadowMap`, pero three.js 0.187 lo ha
  eliminado; se usa `PCFShadowMap`, que en esta versión ya filtra con suavizado.
- **N8AO a media resolución**: n8ao 2.0 no es compatible tal cual con three 0.187 en
  ese modo; `Effects.tsx` corrige el accesor de su render target y acota el muestreo
  del reescalado. Revisar al actualizar cualquiera de las dos librerías.
- **Reloj en reposo**: GSAP y ScrollTrigger mantienen sus `requestAnimationFrame`
  activos aunque no se dibuje nada.
- **KTX2**: el cargador está conectado, pero el modelo de demostración no tiene
  texturas, así que esa ruta (y `--ktx2` en el script de optimización) no se ha
  ejercitado.
- **Contacto**: no hay backend; el formulario abre el cliente de correo del visitante.
- **Fuera de alcance por ahora**: editor visual, almacenamiento en Supabase y purga de
  CDN por webhooks, y render de splats con WebGPU.
