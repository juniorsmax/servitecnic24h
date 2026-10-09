# Web nueva: servicio técnico Bosch, Siemens y Balay

Web independiente (no es Zervitecnics). Páginas por marca y electrodoméstico, formulario propio, cookies con consentimiento y asistente de averías.

## Qué hay

- `config/sitio.json`: **todos los datos del negocio en un solo sitio** (nombre, dominio, teléfono, WhatsApp, correo, titular, analítica).
- `contenido/`: textos de marcas, electrodomésticos, averías, códigos de error y preguntas frecuentes. También es la "memoria" del bot.
- `src/build.mjs`: genera la web en `dist/`.
- `src/static/`: diseño (CSS), JavaScript e imágenes.
- `worker/`: servidor pequeño (Cloudflare Workers) para recibir el formulario y para el chat con IA.

## Páginas que se generan (31 indexables)

- Inicio, 3 páginas de marca y 5 de electrodoméstico.
- 15 páginas marca × electrodoméstico. Ejemplo: `/bosch/lavadoras/`, `/balay/lavadoras/`, `/siemens/lavadoras/`.
- Códigos de error: general, lavadoras y lavavajillas.
- Contacto, aviso legal, privacidad y cookies.
- Páginas de gracias propias (no indexadas): `/gracias/`, `/gracias/bosch/`, `/gracias/siemens/`, `/gracias/balay/`.
- `sitemap.xml`, `robots.txt`, `404.html` y `_headers` (cabeceras de seguridad).

## Ver la web en local

```
npm run build
npx serve dist
```

## Datos pendientes (rellenar en `config/sitio.json` y `worker/wrangler.toml`)

- [ ] Nombre comercial definitivo (ahora: "Técnico Electrodomésticos BCN").
- [ ] Dominio.
- [ ] Teléfono fijo 93 (`telefono` y `telefonoVisible`).
- [ ] WhatsApp del 93 (`whatsapp`, solo números con prefijo: 3493…).
- [ ] Correo nuevo.
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
3. Poner las URLs del Worker en `config/sitio.json` → `endpoints.solicitud` (`…/api/solicitud`) y `endpoints.chat` (`…/api/chat`).

## Cómo funciona

- **Formulario**: 3 pasos. Valida en el navegador y en el servidor, tiene trampa anti-robots y Turnstile. Avisa por correo (Resend) y/o webhook. Redirige a la página de gracias de cada marca, donde se mide la conversión de Google Ads.
- **Cookies**: nada de analítica ni publicidad se carga sin aceptar. Google Consent Mode v2. Botón "Configurar cookies" en el pie.
- **Bot de averías**: sin IA funciona con botones, códigos de error y preguntas frecuentes (coste 0). Si se configura `endpoints.chat`, las preguntas libres las responde Claude usando solo la carpeta `contenido/`.
  - Para enseñarle algo nuevo, edita `contenido/` y vuelve a publicar.
  - Modelo: `MODELO` en `worker/wrangler.toml`. Cambiarlo cambia el coste por conversación.
- **Mapa por código postal**: el Worker puede guardar estadísticas sin datos personales (CP, aparato, marca, origen del anuncio) en Cloudflare KV. El mapa se hará en la siguiente fase.

## Textos

- Nunca decir "servicio oficial". Se dice: independiente, más de 20 años, repuestos originales, técnicos formados.
- Los códigos de error son orientativos.
