// Prepara una copia de la web con enlaces relativos para verla sin dominio (vista previa).
// Uso: node src/build.mjs && node src/vista-previa.mjs  ->  carpeta vista-previa/
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(raiz, "dist");
const SALIDA = path.join(raiz, "vista-previa");
const WEB = path.join(SALIDA, "web");
const EXCLUIR = new Set(["panel", "_headers", "robots.txt", "sitemap.xml"]);

fs.rmSync(SALIDA, { recursive: true, force: true });
fs.mkdirSync(WEB, { recursive: true });
for (const e of fs.readdirSync(DIST)) {
  if (!EXCLUIR.has(e)) fs.cpSync(path.join(DIST, e), path.join(WEB, e), { recursive: true });
}

// Convierte "/bosch/lavadoras/#solicitud" en "../../bosch/lavadoras/index.html#solicitud" según la página.
function relativa(destino, archivo) {
  const [ruta, ancla] = destino.split("#");
  let objetivo = ruta === "" ? "" : ruta.replace(/^\//, "");
  if (objetivo === "" || objetivo.endsWith("/")) objetivo += "index.html";
  const desde = path.dirname(path.relative(WEB, archivo));
  let rel = path.relative(desde, objetivo) || "index.html";
  return rel + (ancla !== undefined ? `#${ancla}` : "");
}

function recorrer(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) recorrer(f);
    else if (f.endsWith(".html")) {
      const prefijo = path.relative(path.dirname(f), WEB).replace(/\\/g, "/");
      const raizRel = prefijo ? `${prefijo}/` : "./";
      let html = fs.readFileSync(f, "utf8");
      html = html.replace(/(href|src)="(\/[^"]*)"/g, (_, attr, valor) => (valor.startsWith("//") ? `${attr}="${valor}"` : `${attr}="${relativa(valor, f)}"`));
      html = html.replace(/(<script type="application\/json" id="config-sitio">)\{/, `$1{"raiz":"${raizRel}",`);
      // En la vista previa no se carga la fuente con preload (se carga desde el CSS).
      html = html.replace(/<link rel="preload"[^>]*>\n?/, "");
      fs.writeFileSync(f, html);
    }
  }
}
recorrer(WEB);

// El CSS usa rutas absolutas para las fuentes.
const css = path.join(WEB, "css", "estilos.css");
fs.writeFileSync(css, fs.readFileSync(css, "utf8").replace(/url\("\/fuentes\//g, 'url("../fuentes/'));

fs.copyFileSync(path.join(raiz, "src", "vista-previa.html"), path.join(SALIDA, "indice.html"));

const archivos = [];
(function listar(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    e.isDirectory() ? listar(f) : archivos.push(path.relative(SALIDA, f));
  }
})(WEB);
console.log(`Vista previa en vista-previa/: ${archivos.length} archivos.`);
