// Genera la web estática en dist/ a partir de config/ y contenido/.
// Uso: node src/build.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (f) => JSON.parse(fs.readFileSync(path.join(raiz, f), "utf8"));

const cfg = leer("config/sitio.json");
const marcas = leer("contenido/marcas.json");
const aparatos = leer("contenido/aparatos.json");
const codigos = leer("contenido/codigos-error.json");
const zonas = leer("contenido/zonas.json");
const faq = leer("contenido/faq.json").map((f) => ({ ...f, r: f.r.replace("{garantia}", cfg.garantiaMeses) }));

const DIST = path.join(raiz, "dist");
const BASE = cfg.dominio.replace(/\/$/, "");
const hoy = new Date().toISOString().slice(0, 10);
const paginasSitemap = [];

// ---------- utilidades ----------
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const minus = (s) => s.charAt(0).toLowerCase() + s.slice(1);

function escribir(ruta, html, { indexar = true, prioridad = "0.7" } = {}) {
  const destino = path.join(DIST, ruta, ruta.endsWith(".html") ? "" : "index.html");
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, html);
  if (indexar) paginasSitemap.push({ loc: `${BASE}${ruta}`, prioridad });
}

function copiarDir(origen, destino) {
  fs.mkdirSync(destino, { recursive: true });
  for (const e of fs.readdirSync(origen, { withFileTypes: true })) {
    const o = path.join(origen, e.name);
    const d = path.join(destino, e.name);
    e.isDirectory() ? copiarDir(o, d) : fs.copyFileSync(o, d);
  }
}

const telHref = cfg.telefono ? `tel:${cfg.telefono.replace(/\s/g, "")}` : "#contacto";
const waHref = (texto) =>
  cfg.whatsapp ? `https://wa.me/${cfg.whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(texto)}` : "#contacto";

// ---------- iconos ----------
const ICONOS = {
  lavadora: '<rect x="5" y="3" width="22" height="26" rx="3"/><circle cx="16" cy="17" r="7"/><circle cx="16" cy="17" r="3.5"/><path d="M9 7h4M21 7h2"/>',
  lavavajillas: '<rect x="5" y="3" width="22" height="26" rx="3"/><path d="M5 9h22M9 6h3M10 15v9M14 15v9M18 15v9M22 15v9"/>',
  termo: '<rect x="9" y="3" width="14" height="24" rx="7"/><path d="M13 27v3M19 27v3M16 9v8"/><circle cx="16" cy="19" r="2.5"/>',
  horno: '<rect x="4" y="4" width="24" height="24" rx="3"/><rect x="8" y="12" width="16" height="12" rx="1.5"/><path d="M9 8h2M14 8h2M19 8h4"/>',
  frigorifico: '<rect x="7" y="3" width="18" height="26" rx="3"/><path d="M7 12h18M11 7v2M11 16v4"/>',
  campana: '<path d="M13 3h6v8h-6z"/><path d="M13 11L4 22h24L19 11"/><path d="M4 22v3h24v-3M10 25v2M22 25v2"/>',
  placa: '<rect x="3" y="7" width="26" height="18" rx="3"/><circle cx="11" cy="16" r="4.5"/><circle cx="22" cy="13" r="3"/><circle cx="22" cy="21" r="2"/>',
  tel: '<path d="M6 4h5l2 6-3 2a16 16 0 0 0 10 10l2-3 6 2v5a2 2 0 0 1-2 2A24 24 0 0 1 4 6a2 2 0 0 1 2-2z"/>',
  wa: '<path d="M16 3a13 13 0 0 0-11 19.6L3.5 29l6.6-1.6A13 13 0 1 0 16 3z"/><path d="M11.5 10.5c.5 3.5 4.5 8 9 9l1.5-2-2.5-1.5-1.5 1c-1.5-.5-3-2-3.5-3.5l1-1.5-1.5-2.5z"/>',
  chat: '<path d="M5 6h22v15H13l-6 5v-5H5z"/><path d="M10 12h12M10 16h8"/>',
  check: '<path d="M6 16l6 6L26 9"/>',
  escudo: '<path d="M16 3l11 4v8c0 7-5 12-11 14C10 27 5 22 5 15V7z"/><path d="M11 16l4 4 6-7"/>',
  pieza: '<circle cx="16" cy="16" r="5"/><path d="M16 3v5M16 24v5M3 16h5M24 16h5M7 7l3.5 3.5M21.5 21.5L25 25M7 25l3.5-3.5M21.5 10.5L25 7"/>',
  reloj: '<circle cx="16" cy="16" r="12"/><path d="M16 9v7l5 3"/>',
  mapa: '<path d="M16 29s-9-8.5-9-15a9 9 0 0 1 18 0c0 6.5-9 15-9 15z"/><circle cx="16" cy="14" r="3.5"/>'
};
// Ilustraciones grandes de cada electrodoméstico. Los colores salen del CSS (tema de cada marca).
const ILUSTRACIONES = {
  lavadora: '<rect class="il-cuerpo" x="22" y="10" width="76" height="100" rx="8"/><rect class="il-panel" x="22" y="10" width="76" height="20" rx="8"/><rect class="il-pantalla" x="34" y="16" width="26" height="8" rx="2"/><circle class="il-acento" cx="84" cy="20" r="5"/><circle class="il-marco" cx="60" cy="68" r="28"/><circle class="il-cristal" cx="60" cy="68" r="21"/><path class="il-brillo" d="M47 60a16 16 0 0 1 14-10"/><rect class="il-pie" x="28" y="108" width="10" height="4" rx="1"/><rect class="il-pie" x="82" y="108" width="10" height="4" rx="1"/>',
  lavavajillas: '<rect class="il-cuerpo" x="22" y="10" width="76" height="100" rx="8"/><rect class="il-panel" x="22" y="10" width="76" height="18" rx="8"/><rect class="il-acento" x="76" y="16" width="14" height="6" rx="3"/><rect class="il-pantalla" x="32" y="16" width="20" height="6" rx="2"/><rect class="il-tirador" x="44" y="36" width="32" height="5" rx="2.5"/><path class="il-linea" d="M30 52h60M30 66h60M30 80h60M30 94h60"/>',
  frigorifico: '<rect class="il-cuerpo" x="30" y="4" width="60" height="112" rx="8"/><path class="il-linea" d="M30 44h60"/><rect class="il-acento" x="36" y="14" width="5" height="22" rx="2.5"/><rect class="il-acento" x="36" y="52" width="5" height="34" rx="2.5"/><rect class="il-pantalla" x="62" y="16" width="20" height="10" rx="2"/>',
  termo: '<rect class="il-cuerpo" x="36" y="6" width="48" height="96" rx="24"/><circle class="il-marco" cx="60" cy="60" r="12"/><path class="il-acento-trazo" d="M60 60l6-6"/><rect class="il-pantalla" x="50" y="26" width="20" height="8" rx="2"/><path class="il-tubo" d="M50 102v12M70 102v12"/>',
  horno: '<rect class="il-cuerpo" x="14" y="14" width="92" height="92" rx="8"/><rect class="il-panel" x="14" y="14" width="92" height="20" rx="8"/><circle class="il-mando" cx="30" cy="24" r="5"/><circle class="il-mando" cx="90" cy="24" r="5"/><rect class="il-pantalla" x="48" y="19" width="24" height="10" rx="2"/><rect class="il-tirador" x="30" y="42" width="60" height="5" rx="2.5"/><rect class="il-cristal" x="26" y="54" width="68" height="42" rx="5"/><path class="il-acento-trazo" d="M38 88q6-8 12 0t12 0 12 0"/>',
  campana: '<rect class="il-cuerpo" x="48" y="4" width="24" height="44" rx="3"/><path class="il-cuerpo" d="M44 48h32l30 34H14z"/><rect class="il-panel" x="12" y="82" width="96" height="12" rx="4"/><rect class="il-acento" x="30" y="86" width="16" height="4" rx="2"/><rect class="il-acento" x="74" y="86" width="16" height="4" rx="2"/><path class="il-linea" d="M30 104c4-6 8 6 12 0M54 108c4-6 8 6 12 0M78 104c4-6 8 6 12 0"/>',
  placa: '<rect class="il-vitro" x="8" y="22" width="104" height="76" rx="10"/><circle class="il-zona" cx="38" cy="48" r="16"/><circle class="il-zona il-zona--activa" cx="82" cy="46" r="12"/><circle class="il-zona" cx="36" cy="80" r="10"/><circle class="il-zona" cx="82" cy="78" r="14"/><rect class="il-pantalla" x="46" y="88" width="28" height="5" rx="2.5"/>'
};
const ilustracion = (n) => `<svg class="ilustracion" viewBox="0 0 120 120" aria-hidden="true">${ILUSTRACIONES[n]}</svg>`;

const icono = (n, clase = "ico") =>
  `<svg class="${clase}" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONOS[n]}</svg>`;

// ---------- piezas comunes ----------
function cabecera(marcaActual) {
  const menuMarcas = marcas.map((m) => `<a href="/${m.slug}/">${m.nombre}</a>`).join("");
  const selector = marcas
    .map((m) => `<a class="selector__marca selector__marca--${m.slug}" href="/${m.slug}/"${marcaActual && marcaActual.slug === m.slug ? ' aria-current="true"' : ""}>${m.nombre}</a>`)
    .join("");
  const menuAparatos = aparatos.map((a) => `<a href="/${a.slug}/">${a.nombre}</a>`).join("");
  return `
<a class="saltar" href="#contenido">Saltar al contenido</a>
<header class="cabecera">
  <div class="contenedor cabecera__fila">
    <a class="logo" href="/" aria-label="${esc(cfg.nombre)}, inicio">
      <span class="logo__marca">${icono("pieza")}</span>
      <span class="logo__texto">${esc(cfg.nombre)}</span>
    </a>
    <nav class="selector" aria-label="Marcas">${selector}</nav>
    <button class="menu-boton" aria-expanded="false" aria-controls="menu">Menú</button>
    <nav id="menu" class="menu" aria-label="Principal">
      <details class="menu__grupo menu__grupo--marcas"><summary>Marcas</summary><div class="menu__lista">${menuMarcas}</div></details>
      <details class="menu__grupo"><summary>Electrodomésticos</summary><div class="menu__lista">${menuAparatos}</div></details>
      <a href="/codigos-error/">Códigos de error</a>
      <a href="/contacto/">Contacto</a>
    </nav>
    <a class="boton boton--llamar cabecera__tel" href="${telHref}" data-evento="llamada">${icono("tel")}<span>${esc(cfg.telefonoVisible)}</span></a>
  </div>
</header>`;
}

function pie() {
  const enlacesMarcas = marcas
    .map((m) => `<li><strong>${m.nombre}</strong>: ${aparatos.map((a) => `<a href="/${m.slug}/${a.slug}/">${minus(a.nombre)}</a>`).join(", ")}</li>`)
    .join("");
  return `
<footer class="pie">
  <div class="contenedor pie__rejilla">
    <div>
      <p class="pie__nombre">${esc(cfg.nombre)}</p>
      <p>Servicio técnico independiente de electrodomésticos Bosch, Siemens y Balay en ${esc(cfg.ciudad)} y área metropolitana. ${esc(cfg.horario)}.</p>
      <p><a href="${telHref}" data-evento="llamada">${esc(cfg.telefonoVisible)}</a> · <a href="mailto:${esc(cfg.email)}">${esc(cfg.email)}</a></p>
    </div>
    <div>
      <p class="pie__titulo">Reparamos</p>
      <ul class="pie__lista">${enlacesMarcas}</ul>
    </div>
    <div>
      <p class="pie__titulo">Información</p>
      <ul class="pie__lista">
        <li><a href="/codigos-error/">Códigos de error</a></li>
        <li><a href="/contacto/">Contacto</a></li>
        <li><a href="/aviso-legal/">Aviso legal</a></li>
        <li><a href="/privacidad/">Política de privacidad</a></li>
        <li><a href="/cookies/">Política de cookies</a></li>
        <li><button type="button" class="enlace" data-abrir-cookies>Configurar cookies</button></li>
      </ul>
    </div>
  </div>
  <p class="contenedor pie__aviso">Bosch, Siemens y Balay son marcas registradas de sus respectivos titulares. ${esc(cfg.nombre)} es un servicio técnico independiente y no es el servicio técnico oficial de ninguna de estas marcas.</p>
</footer>
<div class="barra-movil" role="navigation" aria-label="Contacto rápido">
  <a href="${telHref}" data-evento="llamada">${icono("tel")}Llamar</a>
  <a href="${waHref("Hola, necesito reparar un electrodoméstico")}" data-evento="whatsapp" target="_blank" rel="noopener">${icono("wa")}WhatsApp</a>
  <a href="#solicitud" data-evento="ir-formulario">${icono("check")}Pedir cita</a>
</div>`;
}

// Configuración pública que necesita el JavaScript del navegador (nada secreto).
const configPublica = {
  telefono: cfg.telefono,
  whatsapp: cfg.whatsapp,
  endpoints: cfg.endpoints,
  analitica: cfg.analitica,
  turnstileSiteKey: cfg.turnstileSiteKey
};

const FUENTES = { Inter: "inter", "Source Sans 3": "source-sans-3", Figtree: "figtree" };

function pagina({ ruta, titulo, descripcion, cuerpo, schema = [], indexar = true, prioridad, marca = null }) {
  const fuente = FUENTES[marca ? marca.tema.fuente : "Inter"];
  const url = `${BASE}${ruta}`;
  const ld = schema.map((s) => `<script type="application/ld+json">${JSON.stringify(s)}</script>`).join("\n");
  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(descripcion)}">
<meta name="robots" content="${indexar ? "index, follow" : "noindex, follow"}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(titulo)}">
<meta property="og:description" content="${esc(descripcion)}">
<meta property="og:url" content="${url}">
<meta property="og:locale" content="es_ES">
<meta property="og:site_name" content="${esc(cfg.nombre)}">
<meta name="theme-color" content="${marca ? marca.tema.color : "#0f2a44"}">
<link rel="icon" href="/img/favicon.svg" type="image/svg+xml">
<link rel="preload" href="/fuentes/${fuente}.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/css/estilos.css">
${ld}
<script type="application/json" id="config-sitio">${JSON.stringify(configPublica).replace(/</g, "\\u003c")}</script>
<script src="/js/app.js" defer></script>
</head>
<body data-marca="${marca ? marca.slug : "general"}">
${cabecera(marca)}
<main id="contenido">
${cuerpo}
</main>
${pie()}
</body>
</html>
`;
  escribir(ruta, html, { indexar, prioridad });
}

const negocioSchema = {
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  "@id": `${BASE}/#negocio`,
  name: cfg.nombre,
  url: `${BASE}/`,
  ...(cfg.telefono && { telephone: cfg.telefono }),
  email: cfg.email,
  address: { "@type": "PostalAddress", addressLocality: cfg.ciudad, addressRegion: "Barcelona", addressCountry: "ES" },
  areaServed: ["Barcelona", "L'Hospitalet de Llobregat", "Badalona", "Cornellà de Llobregat", "Sant Cugat del Vallès", "Sabadell", "Terrassa", "Mataró"],
  openingHours: cfg.horarioSchema
};

const migas = (items) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: items.map(([nombre, ruta], i) => ({ "@type": "ListItem", position: i + 1, name: nombre, item: `${BASE}${ruta}` }))
});

const migasHtml = (items) =>
  `<nav class="migas contenedor" aria-label="Migas de pan"><ol>${items
    .map(([n, r], i) => (i === items.length - 1 ? `<li aria-current="page">${esc(n)}</li>` : `<li><a href="${r}">${esc(n)}</a></li>`))
    .join("")}</ol></nav>`;

const faqSchema = (lista) => ({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: lista.map((f) => ({ "@type": "Question", name: f.p, acceptedAnswer: { "@type": "Answer", text: f.r } }))
});

const faqHtml = (lista) =>
  `<div class="faq">${lista.map((f) => `<details><summary>${esc(f.p)}</summary><p>${esc(f.r)}</p></details>`).join("")}</div>`;

const ventajas = () => `
<ul class="ventajas">
  <li>${icono("reloj")}<div><strong>${esc(cfg.experiencia)}</strong><span>reparando Bosch, Siemens y Balay</span></div></li>
  <li>${icono("pieza")}<div><strong>Repuestos originales</strong><span>del fabricante</span></div></li>
  <li>${icono("escudo")}<div><strong>Garantía por escrito</strong><span>${cfg.garantiaMeses} meses</span></div></li>
  <li>${icono("mapa")}<div><strong>A domicilio</strong><span>${esc(cfg.ciudad)} y área metropolitana</span></div></li>
</ul>`;

// Formulario rápido de una sola pantalla. Funciona también sin JavaScript (valida el navegador).
function formulario({ marca = "", aparato = "" } = {}) {
  const opcionesAparato = aparatos
    .map((a) => `<option value="${a.slug}"${a.slug === aparato ? " selected" : ""}>${esc(a.nombre)}</option>`)
    .join("");
  const opcionesMarca = marcas
    .map((m) => `<option value="${m.slug}"${m.slug === marca ? " selected" : ""}>${m.nombre}</option>`)
    .join("");
  return `
<section id="solicitud" class="solicitud">
  <form class="formulario" data-formulario novalidate>
    <div class="formulario__cabecera">
      <h2>Pide tu técnico</h2>
      <p>Rellénalo en un minuto. Te llamamos para confirmar la visita.</p>
    </div>
    <div class="formulario__campos">
      <div class="fila-2">
        <label>Electrodoméstico
          <select name="aparato" required><option value="">Elige</option>${opcionesAparato}</select>
        </label>
        <label>Marca
          <select name="marca" required><option value="">Elige</option>${opcionesMarca}</select>
        </label>
      </div>
      <label>Nombre y apellidos
        <input name="nombre" autocomplete="name" maxlength="80" required>
      </label>
      <label>Teléfono
        <input name="telefono" type="tel" inputmode="tel" autocomplete="tel" pattern="(\\+34)?[6789][0-9]{8}" maxlength="13" required placeholder="600 000 000">
      </label>
      <div class="fila-dir">
        <label>Dirección
          <input name="direccion" autocomplete="street-address" maxlength="120" required placeholder="Calle, número, piso y puerta">
        </label>
        <label>Código postal
          <input name="cp" inputmode="numeric" autocomplete="postal-code" pattern="0[0-9]{4}" maxlength="5" required placeholder="08001">
        </label>
      </div>
      <label><span>¿Qué le pasa? <span class="opcional">(opcional)</span></span>
        <input name="averia" maxlength="200" placeholder="Ej.: no centrifuga, error E18…">
      </label>
      <label class="casilla">
        <input type="checkbox" name="consentimiento" value="si" required>
        <span>Acepto la <a href="/privacidad/" target="_blank">política de privacidad</a> y que me llaméis o escribáis por WhatsApp para la reparación.</span>
      </label>
      <div class="oculto" aria-hidden="true"><label>No rellenar <input name="web" tabindex="-1" autocomplete="off"></label></div>
      <div class="turnstile" data-turnstile></div>
    </div>
    <p class="formulario__error" role="alert" hidden></p>
    <button type="submit" class="boton boton--llamar boton--grande formulario__enviar" data-enviar>Pedir técnico</button>
    <p class="formulario__alternativa">¿Prefieres hablar ya? <a href="${telHref}" data-evento="llamada">Llama al ${esc(cfg.telefonoVisible)}</a></p>
  </form>
</section>`;
}

const tarjetasAparatos = (marca) =>
  `<div class="tarjetas">${aparatos
    .map((a) => {
      const href = marca ? `/${marca.slug}/${a.slug}/` : `/${a.slug}/`;
      return `<a class="tarjeta" href="${href}"><span class="tarjeta__imagen">${ilustracion(a.icono)}</span><span class="tarjeta__titulo">${esc(a.nombre)}${marca ? ` ${marca.nombre}` : ""}</span><span class="tarjeta__mas">Ver averías y pedir técnico →</span></a>`;
    })
    .join("")}</div>`;

// ---------- páginas ----------
function inicio() {
  pagina({
    ruta: "/",
    prioridad: "1.0",
    titulo: `Servicio técnico Bosch, Siemens y Balay en ${cfg.ciudad} | Reparación a domicilio`,
    descripcion: `Reparación de lavadoras, lavavajillas, frigoríficos, termos, hornos, campanas y placas Bosch, Siemens y Balay en ${cfg.ciudad}. ${cfg.experiencia} de experiencia, repuestos originales y garantía por escrito.`,
    schema: [negocioSchema, faqSchema(faq)],
    cuerpo: `
<section class="heroe heroe--general">
  <div class="contenedor heroe__rejilla">
    <div class="heroe__texto">
      <p class="etiqueta">Servicio técnico a domicilio · ${esc(cfg.ciudad)}</p>
      <h1>Reparamos tu electrodoméstico Bosch, Siemens o Balay</h1>
      <p class="heroe__intro">Técnicos formados con ${esc(cfg.experiencia)} de experiencia en estas tres marcas, repuestos originales y garantía por escrito.</p>
      <p class="heroe__pregunta">¿De qué marca es?</p>
      <div class="heroe__marcas">${marcas.map((m) => `<a class="boton-marca boton-marca--${m.slug}" href="/${m.slug}/">${m.nombre}</a>`).join("")}</div>
      <div class="heroe__botones">
        <a class="boton boton--llamar boton--grande" href="${telHref}" data-evento="llamada">${icono("tel")}Llamar ahora</a>
        <a class="boton boton--claro boton--grande" href="${waHref("Hola, necesito reparar un electrodoméstico")}" data-evento="whatsapp" target="_blank" rel="noopener">${icono("wa")}WhatsApp</a>
      </div>
      <p class="heroe__nota">Servicio técnico independiente. No somos el servicio oficial de la marca.</p>
    </div>
    ${formulario()}
  </div>
</section>
<section class="contenedor seccion">
  <div class="seccion__cabeza"><h2>Elige tu electrodoméstico</h2><p>Toca el tuyo para ver sus averías más comunes y pedir técnico.</p></div>
  ${tarjetasAparatos()}
</section>
<section class="contenedor seccion">${ventajas()}</section>
<section class="contenedor seccion">
  <div class="seccion__cabeza"><h2>Tres marcas, un mismo especialista</h2><p>Bosch, Siemens y Balay pertenecen al mismo grupo fabricante (BSH) y comparten muchos repuestos. Por eso nos especializamos en las tres.</p></div>
  <div class="marcas">${marcas
    .map((m) => `<a class="marca marca--${m.slug}" href="/${m.slug}/"><strong>${m.nombre}</strong><span>${aparatos.length} tipos de electrodoméstico</span><span class="marca__ir">Ver servicio técnico ${m.nombre} →</span></a>`)
    .join("")}</div>
</section>
<section class="contenedor seccion seccion--estrecha">
  <h2>Preguntas frecuentes</h2>
  ${faqHtml(faq)}
</section>`
  });
}

function paginaMarca(m) {
  pagina({
    ruta: `/${m.slug}/`,
    prioridad: "0.9",
    titulo: `Servicio técnico ${m.nombre} en ${cfg.ciudad} | Reparación a domicilio`,
    descripcion: `Reparación de electrodomésticos ${m.nombre} en ${cfg.ciudad}: lavadoras, lavavajillas, frigoríficos, termos, hornos, campanas y placas. ${cfg.experiencia} de experiencia y repuestos originales.`,
    marca: m,
    schema: [negocioSchema, migas([["Inicio", "/"], [m.nombre, `/${m.slug}/`]])],
    cuerpo: `
<section class="heroe">
  <div class="contenedor heroe__rejilla">
    <div class="heroe__texto">
      ${migasHtml([["Inicio", "/"], [m.nombre, `/${m.slug}/`]])}
      <p class="etiqueta">Especialistas en ${m.nombre}</p>
      <h1>Servicio técnico de electrodomésticos ${m.nombre} en ${esc(cfg.ciudad)}</h1>
      <p class="heroe__intro">${esc(m.intro)}</p>
      <div class="heroe__botones">
        <a class="boton boton--llamar boton--grande" href="${telHref}" data-evento="llamada">${icono("tel")}Llamar ahora</a>
        <a class="boton boton--claro boton--grande" href="${waHref(`Hola, necesito reparar un electrodoméstico ${m.nombre}`)}" data-evento="whatsapp" target="_blank" rel="noopener">${icono("wa")}WhatsApp</a>
      </div>
      <p class="heroe__nota">Servicio técnico independiente. No somos el servicio oficial de ${m.nombre}.</p>
    </div>
    ${formulario({ marca: m.slug })}
  </div>
</section>
<section class="contenedor seccion">
  <div class="seccion__cabeza"><h2>¿Qué electrodoméstico ${m.nombre} necesitas reparar?</h2><p>${esc(m.nota)}</p></div>
  ${tarjetasAparatos(m)}
</section>
<section class="contenedor seccion">${ventajas()}</section>`
  });
}

function paginaAparato(a) {
  pagina({
    ruta: `/${a.slug}/`,
    prioridad: "0.8",
    titulo: `Reparación de ${minus(a.nombre)} Bosch, Siemens y Balay en ${cfg.ciudad}`,
    descripcion: `Servicio técnico de ${minus(a.nombre)} Bosch, Siemens y Balay a domicilio en ${cfg.ciudad}. Averías frecuentes, repuestos originales y garantía por escrito.`,
    schema: [negocioSchema, migas([["Inicio", "/"], [a.nombre, `/${a.slug}/`]])],
    cuerpo: `
<section class="heroe heroe--general">
  <div class="contenedor heroe__rejilla">
    <div class="heroe__texto">
      ${migasHtml([["Inicio", "/"], [a.nombre, `/${a.slug}/`]])}
      <div class="heroe__ilustracion">${ilustracion(a.icono)}</div>
      <h1>Reparación de ${minus(a.nombre)} Bosch, Siemens y Balay</h1>
      <p class="heroe__intro">${esc(a.intro)}</p>
      <p class="heroe__pregunta">Elige la marca de ${esc(a.articulo)}:</p>
      <div class="heroe__marcas">${marcas.map((m) => `<a class="boton-marca boton-marca--${m.slug}" href="/${m.slug}/${a.slug}/">${m.nombre}</a>`).join("")}</div>
    </div>
    ${formulario({ aparato: a.slug })}
  </div>
</section>
<section class="contenedor seccion">
  <div class="seccion__cabeza"><h2>Averías más comunes</h2></div>
  <div class="averias">${a.averias.map((v) => `<article class="averia"><h3>${esc(v.titulo)}</h3><p>${esc(v.texto)}</p></article>`).join("")}</div>
</section>`
  });
}

function paginaMarcaAparato(m, a) {
  const ruta = `/${m.slug}/${a.slug}/`;
  const titulo = `${a.nombre} ${m.nombre}`;
  const otras = marcas.filter((o) => o.slug !== m.slug);
  const faqLocal = [
    { p: `¿Reparáis ${minus(a.nombre)} ${m.nombre} en ${cfg.ciudad}?`, r: `Sí. Reparamos ${minus(a.nombre)} ${m.nombre} a domicilio en ${cfg.ciudad} y área metropolitana, con ${cfg.experiencia} de experiencia y repuestos originales.` },
    { p: "¿Sois el servicio técnico oficial?", r: `No. Somos un servicio técnico independiente especializado en ${m.nombre}, Siemens y Balay. Trabajamos con repuestos originales y garantía por escrito.` },
    ...faq.filter((f) => /garant|cuesta|venir/i.test(f.p))
  ];
  const listaCodigos = codigos[a.slug];
  pagina({
    ruta,
    prioridad: "0.9",
    marca: m,
    titulo: `Servicio técnico ${minus(a.nombre)} ${m.nombre} ${cfg.ciudad} | Reparación a domicilio`,
    descripcion: `Reparación de ${minus(a.nombre)} ${m.nombre} en ${cfg.ciudad}: ${a.averias.slice(0, 3).map((v) => minus(v.titulo)).join(", ")}. ${cfg.experiencia} de experiencia, repuestos originales y garantía.`,
    schema: [
      negocioSchema,
      {
        "@context": "https://schema.org",
        "@type": "Service",
        name: `Reparación de ${minus(a.nombre)} ${m.nombre}`,
        serviceType: `Reparación de ${minus(a.nombre)}`,
        brand: { "@type": "Brand", name: m.nombre },
        provider: { "@id": `${BASE}/#negocio` },
        areaServed: negocioSchema.areaServed
      },
      faqSchema(faqLocal),
      migas([["Inicio", "/"], [m.nombre, `/${m.slug}/`], [titulo, ruta]])
    ],
    cuerpo: `
<section class="heroe">
  <div class="contenedor heroe__rejilla">
  <div class="heroe__texto">
    ${migasHtml([["Inicio", "/"], [m.nombre, `/${m.slug}/`], [titulo, ruta]])}
    <div class="heroe__ilustracion">${ilustracion(a.icono)}</div>
    <p class="etiqueta">${m.nombre} · ${esc(a.nombre)}</p>
    <h1>Servicio técnico de ${minus(a.nombre)} ${m.nombre} en ${esc(cfg.ciudad)}</h1>
    <p class="heroe__intro">¿Problemas con ${esc(a.articulo)} ${m.nombre}? ${esc(a.intro)}</p>
    <ul class="lista-check">
      <li>${icono("check")}${esc(cfg.experiencia)} reparando ${minus(a.nombre)} ${m.nombre}</li>
      <li>${icono("check")}Repuestos originales</li>
      <li>${icono("check")}Técnicos formados en equipos ${m.nombre}</li>
      <li>${icono("check")}Garantía por escrito de ${cfg.garantiaMeses} meses</li>
    </ul>
    <div class="heroe__botones">
      <a class="boton boton--llamar boton--grande" href="${telHref}" data-evento="llamada">${icono("tel")}Llamar ahora</a>
      <a class="boton boton--claro boton--grande" href="${waHref(`Hola, necesito reparar mi ${a.singular} ${m.nombre}`)}" data-evento="whatsapp" target="_blank" rel="noopener">${icono("wa")}WhatsApp</a>
    </div>
  </div>
  ${formulario({ marca: m.slug, aparato: a.slug })}
  </div>
</section>
<section class="contenedor seccion">
  <h2>Averías más comunes en ${minus(a.nombre)} ${m.nombre}</h2>
  <div class="averias">${a.averias.map((v) => `<article class="averia"><h3>${esc(v.titulo)}</h3><p>${esc(v.texto)}</p></article>`).join("")}</div>
  <p class="nota">¿No sabes qué le pasa? Usa el <button type="button" class="enlace" data-abrir-bot>asistente de averías</button> y te orientamos al momento.</p>
</section>
${listaCodigos ? `<section class="contenedor seccion">
  <h2>Códigos de error frecuentes</h2>
  <p>${esc(codigos.aviso)}</p>
  ${tablaCodigos(listaCodigos.slice(0, 4))}
  <p><a href="/codigos-error/${a.slug}/">Ver todos los códigos de error de ${minus(a.nombre)}</a></p>
</section>` : ""}
<section class="contenedor seccion">
  <div class="aviso-enr">
    <h2>Ten a mano el número E-Nr</h2>
    <p>Es el modelo exacto de ${esc(a.articulo)} ${m.nombre}. Con él, el técnico lleva la pieza correcta y la reparación es más rápida.</p>
    <p><strong>Dónde está:</strong> ${esc(a.etiqueta)}</p>
    <p>Puedes enviarnos una foto de la etiqueta por <a href="${waHref(`Hola, os envío la etiqueta de mi ${a.singular} ${m.nombre}`)}" data-evento="whatsapp" target="_blank" rel="noopener">WhatsApp</a> cuando te contactemos.</p>
  </div>
</section>
<section class="contenedor seccion">
  <h2>Repuestos que cambiamos con más frecuencia</h2>
  <ul class="etiquetas">${a.piezas.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>
  <p class="nota">${esc(m.nota)}</p>
</section>
<section class="contenedor seccion">
  <h2>Consejos para alargar la vida de ${esc(a.articulo)}</h2>
  <ul class="lista-check">${a.consejos.map((c) => `<li>${icono("check")}${esc(c)}</li>`).join("")}</ul>
</section>
<section class="contenedor seccion">
  <h2>Preguntas frecuentes</h2>
  ${faqHtml(faqLocal)}
</section>
<section class="contenedor seccion">
  <h2>También reparamos</h2>
  <div class="marcas">${otras
    .map((o) => `<a class="marca marca--${o.slug}" href="/${o.slug}/${a.slug}/"><strong>${esc(a.nombre)} ${o.nombre}</strong><span>Servicio técnico en ${esc(cfg.ciudad)}</span></a>`)
    .join("")}</div>
</section>`
  });
}

function tablaCodigos(lista) {
  return `<div class="tabla-envoltura"><table class="tabla"><thead><tr><th>Código</th><th>Qué significa</th><th>Qué puedes hacer</th></tr></thead><tbody>${lista
    .map((c) => `<tr><td><strong>${esc(c.codigo)}</strong></td><td>${esc(c.significado)}</td><td>${esc(c.queHacer)}</td></tr>`)
    .join("")}</tbody></table></div>`;
}

function paginasCodigos() {
  const con = aparatos.filter((a) => codigos[a.slug]);
  pagina({
    ruta: "/codigos-error/",
    titulo: "Códigos de error Bosch, Siemens y Balay: qué significan",
    descripcion: "Qué significan los códigos de error más comunes de lavadoras y lavavajillas Bosch, Siemens y Balay, y qué puedes hacer antes de llamar al técnico.",
    schema: [migas([["Inicio", "/"], ["Códigos de error", "/codigos-error/"]])],
    cuerpo: `
${migasHtml([["Inicio", "/"], ["Códigos de error", "/codigos-error/"]])}
<section class="contenedor cabeza">
  <h1>Códigos de error Bosch, Siemens y Balay</h1>
  <p class="cabeza__texto">Las tres marcas pertenecen al mismo grupo fabricante y usan códigos muy parecidos. ${esc(codigos.aviso)}</p>
</section>
<section class="contenedor seccion">${tarjetasCodigos(con)}</section>
<div class="contenedor">${formulario()}</div>`
  });
  for (const a of con) {
    const ruta = `/codigos-error/${a.slug}/`;
    pagina({
      ruta,
      titulo: `Códigos de error de ${minus(a.nombre)} Bosch, Siemens y Balay`,
      descripcion: `Significado de los códigos de error de ${minus(a.nombre)} Bosch, Siemens y Balay (${codigos[a.slug].map((c) => c.codigo.split(" ")[0]).join(", ")}) y qué hacer.`,
      schema: [migas([["Inicio", "/"], ["Códigos de error", "/codigos-error/"], [a.nombre, ruta]])],
      cuerpo: `
${migasHtml([["Inicio", "/"], ["Códigos de error", "/codigos-error/"], [a.nombre, ruta]])}
<section class="contenedor cabeza">
  <h1>Códigos de error de ${minus(a.nombre)} Bosch, Siemens y Balay</h1>
  <p class="cabeza__texto">${esc(codigos.aviso)} Si el error vuelve a aparecer tras probar la solución, pide un técnico.</p>
</section>
<section class="contenedor seccion">${tablaCodigos(codigos[a.slug])}</section>
<section class="contenedor seccion">
  <h2>Reparación de ${minus(a.nombre)} por marca</h2>
  <div class="marcas">${marcas.map((m) => `<a class="marca marca--${m.slug}" href="/${m.slug}/${a.slug}/"><strong>${esc(a.nombre)} ${m.nombre}</strong><span>Pedir técnico</span></a>`).join("")}</div>
</section>
<div class="contenedor">${formulario({ aparato: a.slug })}</div>`
    });
  }
}

const tarjetasCodigos = (lista) =>
  `<div class="tarjetas">${lista
    .map((a) => `<a class="tarjeta" href="/codigos-error/${a.slug}/"><span class="tarjeta__imagen">${ilustracion(a.icono)}</span><span class="tarjeta__titulo">Códigos de ${minus(a.nombre)}</span><span class="tarjeta__mas">Ver significado →</span></a>`)
    .join("")}</div>`;

function contacto() {
  pagina({
    ruta: "/contacto/",
    prioridad: "0.6",
    titulo: `Contacto | ${cfg.nombre}`,
    descripcion: `Pide un técnico para tu electrodoméstico Bosch, Siemens o Balay en ${cfg.ciudad}. Llámanos, escríbenos por WhatsApp o rellena el formulario.`,
    schema: [negocioSchema],
    cuerpo: `
<section class="contenedor cabeza cabeza--con-formulario">
  <div>
    <h1>Contacto</h1>
    <p class="cabeza__texto">Llámanos, escríbenos o déjanos tus datos y te llamamos nosotros.</p>
    <ul class="contacto-lista">
      <li>${icono("tel")}<a href="${telHref}" data-evento="llamada">${esc(cfg.telefonoVisible)}</a></li>
      <li>${icono("wa")}<a href="${waHref("Hola, necesito reparar un electrodoméstico")}" data-evento="whatsapp" target="_blank" rel="noopener">WhatsApp</a></li>
      <li>${icono("chat")}<a href="mailto:${esc(cfg.email)}">${esc(cfg.email)}</a></li>
      <li>${icono("reloj")}${esc(cfg.horario)}</li>
      <li>${icono("mapa")}${esc(cfg.ciudad)} y área metropolitana</li>
    </ul>
  </div>
  ${formulario()}
</section>`
  });
}

// Páginas de agradecimiento propias: una general y una por marca (para medir conversiones por marca).
function gracias() {
  const cuerpo = (m) => `
<section class="contenedor cabeza gracias">
  ${icono("check", "gracias__icono")}
  <h1>¡Solicitud recibida${m ? ` para tu ${m.nombre}` : ""}!</h1>
  <p class="cabeza__texto">Te llamaremos en horario laboral para confirmar el día y la hora de la visita. ${esc(cfg.horario)}.</p>
  <p data-resumen-solicitud></p>
  <p>¿Es urgente? <a href="${telHref}" data-evento="llamada">Llama al ${esc(cfg.telefonoVisible)}</a>.</p>
  <p><a class="boton" href="/">Volver al inicio</a></p>
</section>`;
  pagina({ ruta: "/gracias/", titulo: `Solicitud recibida | ${cfg.nombre}`, descripcion: "Hemos recibido tu solicitud.", cuerpo: cuerpo(null), indexar: false });
  for (const m of marcas) {
    pagina({ ruta: `/gracias/${m.slug}/`, titulo: `Solicitud recibida | ${cfg.nombre}`, descripcion: "Hemos recibido tu solicitud.", cuerpo: cuerpo(m), indexar: false, marca: m });
  }
}

function legales() {
  const t = cfg.titular;
  const envolver = (titulo, html) => `<section class="contenedor legal"><h1>${titulo}</h1><p class="nota">Última actualización: ${hoy}</p>${html}</section>`;
  pagina({
    ruta: "/aviso-legal/",
    prioridad: "0.2",
    titulo: `Aviso legal | ${cfg.nombre}`,
    descripcion: "Aviso legal e información del titular del sitio web.",
    cuerpo: envolver("Aviso legal", `
<h2>1. Titular del sitio web</h2>
<p>En cumplimiento del artículo 10 de la Ley 34/2002 (LSSI-CE):</p>
<ul>
  <li>Titular: ${esc(t.nombre)}</li>
  <li>NIF: ${esc(t.nif)}</li>
  <li>Domicilio: ${esc(t.direccion)}</li>
  <li>Correo electrónico: ${esc(cfg.email)}</li>
  ${cfg.telefono ? `<li>Teléfono: ${esc(cfg.telefonoVisible)}</li>` : ""}
  ${t.registro ? `<li>Datos registrales: ${esc(t.registro)}</li>` : ""}
</ul>
<h2>2. Objeto</h2>
<p>Este sitio web informa sobre los servicios de reparación de electrodomésticos del titular y permite solicitar una visita técnica.</p>
<h2>3. Marcas de terceros</h2>
<p>Bosch, Siemens y Balay son marcas registradas de sus respectivos titulares. Se mencionan solo para indicar los electrodomésticos que reparamos. ${esc(cfg.nombre)} es un servicio técnico independiente, sin vinculación con los fabricantes, y no es su servicio técnico oficial.</p>
<h2>4. Propiedad intelectual</h2>
<p>Los textos, diseño y código de este sitio pertenecen al titular. No se permite su reproducción sin autorización.</p>
<h2>5. Responsabilidad</h2>
<p>La información sobre averías y códigos de error es orientativa. El diagnóstico y el presupuesto definitivos los da el técnico tras revisar el aparato.</p>
<h2>6. Legislación aplicable</h2>
<p>Este aviso legal se rige por la legislación española.</p>`)
  });
  pagina({
    ruta: "/privacidad/",
    prioridad: "0.2",
    titulo: `Política de privacidad | ${cfg.nombre}`,
    descripcion: "Cómo tratamos tus datos personales.",
    cuerpo: envolver("Política de privacidad", `
<h2>1. Responsable</h2>
<p>${esc(t.nombre)} (NIF ${esc(t.nif)}), ${esc(t.direccion)}. Contacto: ${esc(cfg.email)}.</p>
<h2>2. Qué datos tratamos</h2>
<p>Los que nos das en el formulario, el chat o WhatsApp: nombre, teléfono, código postal, electrodoméstico, marca y descripción de la avería. Si concertamos la visita, también la dirección.</p>
<h2>3. Para qué</h2>
<ul><li>Gestionar tu solicitud, llamarte y concertar la visita.</li><li>Prestar el servicio y gestionar la garantía.</li><li>Responder a tus dudas en el chat.</li></ul>
<h2>4. Base legal</h2>
<p>Tu consentimiento y la aplicación de medidas precontractuales a petición tuya (art. 6.1.a y 6.1.b del RGPD). Las facturas se conservan por obligación legal (art. 6.1.c).</p>
<h2>5. Conservación</h2>
<p>Las solicitudes que no terminen en reparación se borran en un plazo máximo de 12 meses. Los datos de clientes se conservan durante la garantía y los plazos legales.</p>
<h2>6. Destinatarios</h2>
<p>No cedemos tus datos. Usamos proveedores que actúan como encargados del tratamiento: alojamiento web, envío de correo, WhatsApp (Meta) y, para el chat, un proveedor de inteligencia artificial. No escribas en el chat datos sensibles.</p>
<h2>7. Tus derechos</h2>
<p>Puedes ejercer los derechos de acceso, rectificación, supresión, oposición, limitación y portabilidad escribiendo a ${esc(cfg.email)}. También puedes reclamar ante la Agencia Española de Protección de Datos (aepd.es).</p>`)
  });
  pagina({
    ruta: "/cookies/",
    prioridad: "0.2",
    titulo: `Política de cookies | ${cfg.nombre}`,
    descripcion: "Qué cookies usamos y cómo configurarlas.",
    cuerpo: envolver("Política de cookies", `
<p>Solo instalamos cookies de análisis o publicidad si las aceptas. Puedes cambiar tu elección en cualquier momento: <button type="button" class="enlace" data-abrir-cookies>configurar cookies</button>.</p>
<h2>Cookies técnicas (siempre activas)</h2>
<div class="tabla-envoltura"><table class="tabla"><thead><tr><th>Nombre</th><th>Finalidad</th><th>Duración</th></tr></thead><tbody>
<tr><td>preferencias_cookies (almacenamiento local)</td><td>Guarda tu elección sobre cookies.</td><td>12 meses</td></tr>
<tr><td>Cloudflare Turnstile</td><td>Protege el formulario contra spam.</td><td>Sesión</td></tr>
</tbody></table></div>
<h2>Cookies de análisis (solo si las aceptas)</h2>
<div class="tabla-envoltura"><table class="tabla"><thead><tr><th>Nombre</th><th>Proveedor</th><th>Finalidad</th><th>Duración</th></tr></thead><tbody>
<tr><td>_ga, _ga_*</td><td>Google Analytics</td><td>Estadísticas de visitas.</td><td>2 años</td></tr>
<tr><td>_clck, _clsk, CLID</td><td>Microsoft Clarity</td><td>Cómo se usa la web (mapas de calor).</td><td>Hasta 1 año</td></tr>
</tbody></table></div>
<h2>Cookies de publicidad (solo si las aceptas)</h2>
<div class="tabla-envoltura"><table class="tabla"><thead><tr><th>Nombre</th><th>Proveedor</th><th>Finalidad</th><th>Duración</th></tr></thead><tbody>
<tr><td>_gcl_au, _gcl_aw</td><td>Google Ads</td><td>Medir qué anuncios generan solicitudes.</td><td>90 días</td></tr>
</tbody></table></div>
<p>También puedes borrar o bloquear cookies desde tu navegador.</p>`)
  });
}

function noEncontrada() {
  pagina({
    ruta: "/404.html",
    titulo: `Página no encontrada | ${cfg.nombre}`,
    descripcion: "La página que buscas no existe.",
    indexar: false,
    cuerpo: `<section class="contenedor cabeza"><h1>Página no encontrada</h1><p class="cabeza__texto">La página que buscas no existe o ha cambiado de dirección.</p>${tarjetasAparatos()}<p><a class="boton" href="/">Ir al inicio</a></p></section>`
  });
}

// Panel privado (no indexado): mapa por código postal y zona de anuncios.
function panelMapa() {
  const base = cfg.endpoints.solicitud ? new URL(cfg.endpoints.solicitud).origin : "";
  const configPanel = { estadisticas: base ? `${base}/api/estadisticas` : "", zonas: { municipios: zonas.municipios, cpExtra: zonas.cpExtra, nombresCorregidos: zonas.nombresCorregidos } };
  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Mapa por código postal | Panel</title>
<link rel="icon" href="/img/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/panel/leaflet/leaflet.css">
<link rel="stylesheet" href="/panel/panel.css">
<script type="application/json" id="config-panel">${JSON.stringify(configPanel).replace(/</g, "\\u003c")}</script>
<script src="/panel/leaflet/leaflet.js" defer></script>
<script src="/panel/mapa.js" defer></script>
</head>
<body>
<div class="panel">
  <aside class="panel__lateral">
    <h1>Mapa por código postal</h1>
    <p>Dónde llegan las solicitudes y dónde se ven tus anuncios.</p>
    <p id="estado" class="estado" role="status">Cargando mapa…</p>

    <label>Qué mostrar en colores
      <select id="metrica">
        <option value="solicitudes">Solicitudes de la web</option>
        <option value="impresiones">Impresiones (Google Ads)</option>
        <option value="clics">Clics (Google Ads)</option>
        <option value="coste">Coste (Google Ads)</option>
        <option value="conversiones">Conversiones (Google Ads)</option>
      </select>
    </label>
    <div id="leyenda" class="leyenda"></div>

    <h2>1. Solicitudes de la web</h2>
    <p>Solo código postal, aparato y marca. Sin datos personales.</p>
    <label>Clave del panel <input id="token" type="password" autocomplete="off"></label>
    <label>Periodo
      <select id="dias"><option value="30">Últimos 30 días</option><option value="90" selected>Últimos 90 días</option><option value="365">Último año</option></select>
    </label>
    <button type="button" id="cargar-solicitudes">Cargar solicitudes</button>

    <h2>2. Informe de Google Ads</h2>
    <p>En Google Ads: Campañas › Estadísticas › Dónde se mostraron tus anuncios › nivel "Código postal". Descarga en CSV y súbelo aquí. No se envía a ningún sitio.</p>
    <input id="csv-ads" type="file" accept=".csv,.tsv,.txt,text/csv">

    <h2>3. Zona de anuncios</h2>
    <p>Marcada en verde: <strong id="num-seleccion">0</strong> códigos postales. Para añadir o quitar, activa esta opción y haz clic en el mapa.</p>
    <label class="casilla"><input type="checkbox" id="modo-seleccion"> Editar zona con clic</label>
    <div class="fila">
      <button type="button" id="copiar">Copiar para Google Ads</button>
      <button type="button" class="secundario" id="exportar">Descargar lista</button>
      <button type="button" class="secundario" id="restablecer">Restablecer</button>
    </div>

    <h2>Códigos postales con más datos</h2>
    <table id="tabla"><thead><tr><th>CP</th><th>Municipio</th><th>Sol.</th><th>Impr.</th><th>Clics</th><th>Coste</th><th>Conv.</th></tr></thead><tbody></tbody></table>
    <p id="tabla-vacia">Aún no hay datos.</p>
  </aside>
  <div id="mapa" aria-label="Mapa de códigos postales"></div>
</div>
</body>
</html>
`;
  escribir("/panel/mapa/", html, { indexar: false });
}

// Datos para el asistente de averías del navegador.
function datosBot() {
  const datos = {
    aparatos: aparatos.map((a) => ({ slug: a.slug, nombre: a.nombre, singular: a.singular, averias: a.averias, etiqueta: a.etiqueta })),
    marcas: marcas.map((m) => ({ slug: m.slug, nombre: m.nombre })),
    codigos,
    faq
  };
  fs.mkdirSync(path.join(DIST, "datos"), { recursive: true });
  fs.writeFileSync(path.join(DIST, "datos", "bot.json"), JSON.stringify(datos));
}

function archivosRaiz() {
  fs.writeFileSync(
    path.join(DIST, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paginasSitemap
      .map((p) => `  <url><loc>${p.loc}</loc><lastmod>${hoy}</lastmod><priority>${p.prioridad}</priority></url>`)
      .join("\n")}\n</urlset>\n`
  );
  // Cabeceras de seguridad (Cloudflare Pages y Netlify leen este archivo).
  const origenes = Object.values(cfg.endpoints).filter(Boolean).map((u) => new URL(u).origin);
  const csp = [
    "default-src 'self'",
    "script-src 'self' https://www.googletagmanager.com https://www.clarity.ms https://*.clarity.ms https://challenges.cloudflare.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://tile.openstreetmap.org https://www.googletagmanager.com https://*.google-analytics.com https://*.google.com https://*.google.es https://googleads.g.doubleclick.net https://*.clarity.ms https://c.bing.com",
    `connect-src 'self' ${origenes.join(" ")} https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com https://*.google.com https://googleads.g.doubleclick.net https://*.clarity.ms`.replace(/\s+/g, " "),
    "frame-src https://challenges.cloudflare.com https://www.googletagmanager.com https://td.doubleclick.net",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'"
  ].join("; ");
  fs.writeFileSync(
    path.join(DIST, "_headers"),
    `/*\n  Content-Security-Policy: ${csp}\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n  Strict-Transport-Security: max-age=31536000; includeSubDomains\n  X-Frame-Options: DENY\n\n/gracias/*\n  X-Robots-Tag: noindex\n\n/panel/*\n  X-Robots-Tag: noindex, nofollow\n`
  );
  fs.writeFileSync(path.join(DIST, "robots.txt"), `User-agent: *\nAllow: /\nDisallow: /gracias/\nDisallow: /panel/\n\nSitemap: ${BASE}/sitemap.xml\n`);
}

// ---------- ejecución ----------
fs.rmSync(DIST, { recursive: true, force: true });
copiarDir(path.join(raiz, "src", "static"), DIST);
inicio();
marcas.forEach(paginaMarca);
aparatos.forEach(paginaAparato);
for (const m of marcas) for (const a of aparatos) paginaMarcaAparato(m, a);
paginasCodigos();
contacto();
gracias();
legales();
noEncontrada();
panelMapa();
datosBot();
archivosRaiz();

const pendientes = JSON.stringify(cfg).match(/PENDIENTE/g)?.length ?? 0;
console.log(`Web generada en dist/: ${paginasSitemap.length} páginas indexables.`);
if (pendientes) console.log(`Aviso: quedan ${pendientes} datos PENDIENTE en config/sitio.json.`);
if (!cfg.telefono) console.log("Aviso: falta el teléfono en config/sitio.json.");
