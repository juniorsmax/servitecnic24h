// Servidor pequeño (Cloudflare Worker) para la web.
//   POST /api/solicitud    -> recibe el formulario, comprueba el anti-spam y avisa por correo o webhook.
//   POST /api/chat         -> responde dudas de averías con Claude, usando solo el contenido de la web.
//   GET  /api/estadisticas -> datos sin datos personales para el mapa (con la clave del panel).
//   GET/POST /api/whatsapp -> bot de WhatsApp (API de WhatsApp Cloud de Meta). Ver whatsapp.js.
// Las claves van como "secrets" de Cloudflare, nunca en el código.
import { aparatos, marcas, json, texto, igualSeguro, avisar, preguntarIA } from "./comun.js";
import { whatsapp } from "./whatsapp.js";

const APARATOS = new Set(aparatos.map((a) => a.slug));
const MARCAS = new Set(marcas.map((m) => m.slug));

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    // Meta llama directamente al servidor (sin cabecera Origin): se valida con su firma, no con CORS.
    if (url.pathname === "/api/whatsapp") return whatsapp(request, env, ctx);
    const origen = request.headers.get("Origin") || "";
    const permitido = (env.ORIGENES_PERMITIDOS || "").split(",").map((s) => s.trim()).filter(Boolean);
    const cors = {
      "Access-Control-Allow-Origin": permitido.includes(origen) ? origen : permitido[0] || "",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      Vary: "Origin"
    };
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (!permitido.includes(origen)) return json({ error: "Origen no permitido" }, 403, cors);
    if (request.method === "GET" && url.pathname === "/api/estadisticas") {
      try {
        return await estadisticas(request, url, env, cors);
      } catch (e) {
        console.error(e);
        return json({ error: "Error interno" }, 500, cors);
      }
    }
    if (request.method !== "POST") return json({ error: "Método no permitido" }, 405, cors);

    let cuerpo;
    try {
      cuerpo = await request.json();
    } catch {
      return json({ error: "JSON no válido" }, 400, cors);
    }

    try {
      if (url.pathname === "/api/solicitud") return await solicitud(cuerpo, request, env, cors);
      if (url.pathname === "/api/chat") return await chat(cuerpo, env, cors);
      return json({ error: "No encontrado" }, 404, cors);
    } catch (e) {
      console.error(e);
      return json({ error: "Error interno" }, 500, cors);
    }
  }
};

// ---------- Formulario ----------
async function solicitud(d, request, env, cors) {
  const s = {
    aparato: texto(d.aparato, 40),
    marca: texto(d.marca, 20),
    averia: texto(d.averia, 200),
    direccion: texto(d.direccion, 120),
    cp: texto(d.cp, 5),
    nombre: texto(d.nombre, 80),
    telefono: texto(d.telefono, 13).replace(/[\s.-]/g, ""),
    pagina: texto(d.pagina, 120),
    origen: Object.fromEntries(
      Object.entries(d.origen && typeof d.origen === "object" ? d.origen : {})
        .filter(([k]) => /^(utm_(source|medium|campaign|term|content)|gclid)$/.test(k))
        .map(([k, v]) => [k, texto(v, 120)])
    )
  };
  const errores = [];
  if (!APARATOS.has(s.aparato)) errores.push("aparato");
  if (!MARCAS.has(s.marca)) errores.push("marca");
  if (!/^0\d{4}$/.test(s.cp)) errores.push("cp");
  if (s.nombre.length < 2) errores.push("nombre");
  if (s.direccion.length < 5) errores.push("direccion");
  if (!/^(\+34)?[6789]\d{8}$/.test(s.telefono)) errores.push("telefono");
  if (d.consentimiento !== true) errores.push("consentimiento");
  if (errores.length) return json({ error: "Datos no válidos", campos: errores }, 422, cors);

  if (env.TURNSTILE_SECRET) {
    const form = new FormData();
    form.append("secret", env.TURNSTILE_SECRET);
    form.append("response", texto(d.turnstile, 2048));
    const ip = request.headers.get("CF-Connecting-IP");
    if (ip) form.append("remoteip", ip);
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
    const v = await r.json();
    if (!v.success) return json({ error: "Verificación anti-spam fallida" }, 403, cors);
  }

  const fecha = new Date().toISOString();
  const resumen = [
    `Nueva solicitud (${fecha})`,
    `Aparato: ${s.aparato} · Marca: ${s.marca}`,
    `Nombre: ${s.nombre}`,
    `Teléfono: ${s.telefono}`,
    `Dirección: ${s.direccion} (CP ${s.cp})`,
    s.averia && `Avería: ${s.averia}`,
    "Pendiente: pedir el E-Nr (foto de la etiqueta) por WhatsApp.",
    `Página: ${s.pagina}`,
    Object.keys(s.origen).length && `Origen: ${JSON.stringify(s.origen)}`
  ]
    .filter(Boolean)
    .join("\n");

  await avisar(env, { asunto: `Solicitud: ${s.aparato} ${s.marca} · CP ${s.cp}`, cuerpo: resumen, datos: { ...s, fecha } });

  // Estadística sin datos personales (para el mapa por código postal).
  // Los datos van en los metadatos para poder listarlos sin leer clave por clave.
  if (env.ESTADISTICAS) {
    const clave = `s:${fecha}:${crypto.randomUUID().slice(0, 8)}`;
    const metadata = { cp: s.cp, aparato: s.aparato, marca: s.marca, campana: texto(s.origen.utm_campaign, 60) };
    await env.ESTADISTICAS.put(clave, "", { metadata });
  }
  return json({ ok: true }, 200, cors);
}

// ---------- Estadísticas para el mapa (solo con la clave del panel) ----------
async function estadisticas(request, url, env, cors) {
  const auth = request.headers.get("Authorization") || "";
  if (!env.PANEL_TOKEN || !(await igualSeguro(auth, `Bearer ${env.PANEL_TOKEN}`))) return json({ error: "No autorizado" }, 401, cors);
  if (!env.ESTADISTICAS) return json({ error: "Estadísticas no activadas" }, 501, cors);
  const dias = Math.min(Math.max(parseInt(url.searchParams.get("dias"), 10) || 90, 1), 730);
  const desde = new Date(Date.now() - dias * 86400000).toISOString();
  const porCp = {};
  let total = 0;
  let cursor;
  do {
    const pagina = await env.ESTADISTICAS.list({ prefix: "s:", cursor });
    for (const k of pagina.keys) {
      if (k.name.slice(2) < desde || !k.metadata) continue;
      const { cp, aparato, marca } = k.metadata;
      const fila = (porCp[cp] ||= { total: 0, aparatos: {}, marcas: {} });
      fila.total++;
      fila.aparatos[aparato] = (fila.aparatos[aparato] || 0) + 1;
      fila.marcas[marca] = (fila.marcas[marca] || 0) + 1;
      total++;
    }
    cursor = pagina.list_complete ? undefined : pagina.cursor;
  } while (cursor);
  return json({ dias, total, porCp }, 200, { ...cors, "Cache-Control": "no-store" });
}

// ---------- Chat con IA (web) ----------
async function chat(d, env, cors) {
  const lista = Array.isArray(d.mensajes) ? d.mensajes : [];
  const respuesta = await preguntarIA(env, lista);
  if (respuesta === null) return json({ error: "Falta la pregunta" }, 400, cors);
  return json({ respuesta, mostrarContacto: true }, 200, cors);
}
