# Web nueva: servicio técnico Bosch, Siemens y Balay

Web independiente (no es Zervitecnics). Páginas por marca y electrodoméstico, formulario propio, cookies con consentimiento y asistente de averías.

## Qué hay

- `config/sitio.json`: **todos los datos del negocio en un solo sitio** (nombre, dominio, teléfono, WhatsApp, correo, titular, analítica).
- `contenido/`: textos de marcas, electrodomésticos, averías, códigos de error y preguntas frecuentes. También es la "memoria" del bot.
- `src/build.mjs`: genera la web en `dist/`.
- `src/static/`: diseño (CSS), JavaScript e imágenes.
- `worker/`: servidor pequeño (Cloudflare Workers) para recibir el formulario y para el chat con IA.

## Páginas que se generan (39 indexables)

- Inicio, 3 páginas de marca y 7 de electrodoméstico: lavadoras, lavavajillas, frigoríficos, termos eléctricos, hornos, campanas y placas.
- 21 páginas marca × electrodoméstico. Ejemplo: `/bosch/lavadoras/`, `/balay/lavadoras/`, `/siemens/lavadoras/`.
- Códigos de error: general, lavadoras y lavavajillas.
- Contacto, aviso legal, privacidad y cookies.
- Páginas de gracias propias (no indexadas): `/gracias/`, `/gracias/bosch/`, `/gracias/siemens/`, `/gracias/balay/`.
- Panel privado del mapa (no indexado): `/panel/mapa/`.
- `sitemap.xml`, `robots.txt`, `404.html` y `_headers` (cabeceras de seguridad).

## Ver la web en local

```
npm run build
npx serve dist
```

## Datos pendientes (rellenar en `config/sitio.json` y `worker/wrangler.toml`)

- [x] Nombre comercial: "Técnico Electro BCN".
- [x] Dominio: tecnicoelectrobcn.es.
- [ ] Teléfono fijo 93 (`telefono` y `telefonoVisible`).
- [ ] WhatsApp del 93 (`whatsapp`, solo números con prefijo: 3493…).
- [x] Correo: info@tecnicoelectrobcn.es (crear el buzón).
- [ ] Titular: nombre o razón social, NIF y dirección (obligatorio por la LSSI).
- [ ] Analítica nueva: GTM, GA4, Google Ads (ID y etiqueta de conversión), Clarity.
- [ ] Turnstile (anti-spam de Cloudflare): clave pública en `sitio.json`, secreta en el Worker.
- [ ] Revisar garantía (ahora 3 meses) y horario.

## Publicar (recomendado: Cloudflare, plan gratuito)

1. **Web**: Cloudflare Pages conectado a este repositorio. Carpeta raíz `nueva-web`, comando `npm run build`, salida `dist`.
2. **Servidor**: en `worker/` ejecutar `npm install`, poner los secretos y `npm run deploy`:
   - `npx wrangler secret put ANTHROPIC_API_KEY`
   - `npx wrangler secret put TURNSTILE_SECRET`
   - `npx wrangler secret put RESEND_API_KEY`
   - `npx wrangler secret put PANEL_TOKEN` (clave que inventas para el mapa)
   - Activar estadísticas: `npx wrangler kv namespace create ESTADISTICAS` y pegar el id en `wrangler.toml`.
3. Poner las URLs del Worker en `config/sitio.json` → `endpoints.solicitud` (`…/api/solicitud`) y `endpoints.chat` (`…/api/chat`).

## Cómo funciona

- **Formulario rápido (una pantalla)**: electrodoméstico y marca (ya elegidos en cada página), nombre y apellidos, teléfono, dirección, código postal y avería opcional. Valida en el navegador y en el servidor, tiene trampa anti-robots y Turnstile.
- **E-Nr**: no se pide en el formulario. Cada página explica dónde está la etiqueta y se pide por WhatsApp (foto) al contactar. Avisa por correo (Resend) y/o webhook. Redirige a la página de gracias de cada marca, donde se mide la conversión de Google Ads.
- **Cookies**: nada de analítica ni publicidad se carga sin aceptar. Google Consent Mode v2. Botón "Configurar cookies" en el pie.
- **Bot de averías**: sin IA funciona con botones, códigos de error y preguntas frecuentes (coste 0). Si se configura `endpoints.chat`, las preguntas libres las responde Claude usando solo la carpeta `contenido/`.
  - Para enseñarle algo nuevo, edita `contenido/` y vuelve a publicar.
  - Modelo: `MODELO` en `worker/wrangler.toml`. Por defecto Claude Haiku 5.5, el más barato.
- **Mapa por código postal** (`/panel/mapa/`):
  - Polígonos oficiales de los códigos postales de la provincia de Barcelona (CNIG, licencia CC BY 4.0, simplificados).
  - Solicitudes de la web por código postal (con la clave `PANEL_TOKEN`). Solo CP, aparato y marca: sin datos personales.
  - Informe de Google Ads por código postal: se sube el CSV y se pinta en el mapa (impresiones, clics, coste, conversiones). El archivo no sale del navegador.
  - Zona de anuncios: viene marcada con los municipios de `contenido/zonas.json`. Se puede editar con clic y copiar la lista para Google Ads.

## Textos

- Nunca decir "servicio oficial". Se dice: independiente, más de 20 años, repuestos originales, técnicos formados.
- Los códigos de error son orientativos.
