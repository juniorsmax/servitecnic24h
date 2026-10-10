# Resumen del proyecto: web de servicio técnico Bosch, Siemens y Balay

Documento para retomar el trabajo en una conversación nueva. Última actualización: 10 de octubre de 2026.

## Reglas de trabajo (importante)

- Responder **siempre en español y con frases cortas**.
- **No hacer nada sin autorización:** se puede sugerir, pero no modificar, subir, publicar ni actualizar sin un "sí" explícito.
- Proyecto **independiente de Zervitecnics** (aire acondicionado): dominio, correo, teléfono, analítica y diseño propios.
- No usar datos personales del titular en la web hasta que él los dé para ese fin.

## Decisiones tomadas

| Tema | Decisión |
|---|---|
| Nombre | Técnico Electrodomésticos BCN |
| Dominio | **tecnicoelectrobcn.es** (comprado en Hostinger, caduca 4/10/2027, renovación automática) |
| Correo | info@tecnicoelectrobcn.es, **redirigido gratis** a Gmail con Cloudflare Email Routing (no se compra buzón) |
| Teléfono | **93 694 08 73** (Zadarma, plan Estándar gratis, número pagado hasta 10/10/2027, saldo 0 €) |
| Centralita | Zadarma PBX, extensión 100, app de Zadarma en iPhone. Opción de saludo + extensión. Grabación de llamadas: se recomendó desactivarla (la privacidad dice "no grabamos") |
| Hosting | Cloudflare Pages (gratis) + Cloudflare Worker (formulario, chat, WhatsApp). DNS pasarán a Cloudflare (opción A) |
| Web provisional | https://juniorsmax.github.io/tecnico-electrodomesticos-bcn/ (repo `tecnico-electrodomesticos-bcn`, rama `main`, sin indexar) |
| WhatsApp | **Sin Dualhook.** API de WhatsApp Cloud de Meta directa. Sin coexistencia: el bot atiende y avisa por correo |
| IA del chat y del bot | Claude Haiku 5.5 (barato). Solo responde con el contenido de la web |
| Diseño | Tema por marca con tonos propios (Bosch rojo, Siemens petróleo, Balay azul) y fuentes libres (Inter, Source Sans 3, Figtree). Nunca "servicio oficial" |
| Categorías | 7 aparatos × 3 marcas: lavadoras, lavavajillas, frigoríficos, termos eléctricos, hornos, campanas, placas de inducción/vitrocerámica |
| Formulario | Una pantalla: aparato, marca, nombre y apellidos, teléfono, dirección, CP, avería opcional. El **E-Nr se pide por WhatsApp**, no en el formulario |
| 900 / 902 | Descartados. Se usa el fijo 93 |

## Qué está hecho (todo en `servitecnic24h/nueva-web/`, rama `claude/audit-tech-service-repos-jigts5`)

- **44 páginas indexables:** inicio, 3 marcas, 7 aparatos, 21 marca × aparato, 8 de códigos de error, contacto y legales. Páginas de gracias propias por marca.
- **Códigos de error** de los 7 aparatos (`contenido/codigos-error.json`), contrastados con varias fuentes.
- **Formulario** con validación, anti-spam (Turnstile) y redirección a `/gracias/<marca>/`.
- **Cookies** con consentimiento previo y Google Consent Mode v2.
- **Asistente de averías** en la web (sin IA y con IA opcional).
- **Botón flotante "Llama ahora"** al desplazarse y barra fija en el móvil.
- **Mapa por código postal** en `/panel/mapa/` (solicitudes + CSV de Google Ads + zona de anuncios).
- **Bot de WhatsApp** (`worker/src/whatsapp.js`), probado con conversación simulada.
- **Aviso legal y privacidad** completos, con los datos del titular aún como PENDIENTE.
- Accesibilidad revisada (sin fallos) y sin enlaces rotos.

Comandos: `npm run build` (web), `npm run github` (copia para GitHub Pages), `npm run vista` (vista previa). Detalles en `README.md`.

## Pendiente del titular

1. Cloudflare: crear cuenta, añadir el dominio y cambiar los DNS en Hostinger. Desactivar DNSSEC antes si estuviera activo.
2. Activar Email Routing (info@) y "Enviar como" en Gmail, más el registro SPF.
3. Esperar el correo de activación del 93 en Zadarma. Después:
   - asignar el número a la centralita;
   - poner el 93 como Caller ID en la app;
   - hacer una llamada de prueba.
4. Datos legales (titular, NIF, dirección), cuando quiera ponerlos.
5. Cuentas nuevas de analítica: GA4, Google Tag Manager, Google Ads y Clarity.
6. Perfil de Empresa de Google (Maps) con el 93, como negocio a domicilio.
7. Fotos reales (técnico trabajando, furgoneta).
8. Lista de palabras clave para aplicarlas a la web.
9. Para WhatsApp: app en Meta for Developers, número, token y webhook (ver `README.md`).

## Propuestas pendientes de autorizar

- **C:** archivo de palabras negativas para Google Ads.
- **D:** estructura de campañas de Google Ads por marca y aparato.
- **F:** guía para publicar la web en Cloudflare Pages con el dominio (cuando Cloudflare esté activo).
- **H:** conectar la analítica (cuando haya códigos).
- Aplicar las palabras clave del titular.
- Revisar la versión actual de la API de Meta (`GRAPH_VERSION`) antes de activar WhatsApp.

## Enlaces útiles

- Vista previa en Claude: https://claude.ai/artifact/DvSaLDqcKd5RgJzBBVvxmv
- Web provisional: https://juniorsmax.github.io/tecnico-electrodomesticos-bcn/
