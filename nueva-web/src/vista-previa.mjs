// Prepara una copia de la web con enlaces relativos para verla sin dominio.
// Uso: node src/vista-previa.mjs           -> vista-previa/ (vista previa en Claude)
//      node src/vista-previa.mjs --github  -> publicar-github/ (URL provisional en GitHub Pages, sin indexar)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(raiz, "dist");
const GITHUB = process.argv.includes("--github");
const SALIDA = path.join(raiz, GITHUB ? "publicar-github" : "vista-previa");
const WEB = GITHUB ? SALIDA : path.join(SALIDA, "web");
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
      // La URL provisional no debe salir en Google.
      if (GITHUB) html = html.replace(/<meta name="robots" content="[^"]*">/, '<meta name="robots" content="noindex, nofollow">');
      fs.writeFileSync(f, html);
    }
  }
}
recorrer(WEB);

// El CSS usa rutas absolutas para las fuentes.
const css = path.join(WEB, "css", "estilos.css");
fs.writeFileSync(css, fs.readFileSync(css, "utf8").replace(/url\("\/fuentes\//g, 'url("../fuentes/'));

if (GITHUB) {
  // La página 404 se sirve en cualquier ruta: <base> hace que sus enlaces relativos apunten a la raíz del sitio.
  const p404 = path.join(SALIDA, "404.html");
  fs.writeFileSync(p404, fs.readFileSync(p404, "utf8").replace("<head>", '<head>\n<base href="/tecnico-electrodomesticos-bcn/">'));
  fs.writeFileSync(path.join(SALIDA, "robots.txt"), "User-agent: *\nDisallow: /\n");
  fs.writeFileSync(path.join(SALIDA, ".nojekyll"), "");
} else {
  fs.copyFileSync(path.join(raiz, "src", "vista-previa.html"), path.join(SALIDA, "indice.html"));
}

const archivos = [];
(function listar(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    e.isDirectory() ? listar(f) : archivos.push(path.relative(SALIDA, f));
  }
})(WEB);
console.log(`Copia con enlaces relativos en ${path.basename(SALIDA)}/: ${archivos.length} archivos.`);
