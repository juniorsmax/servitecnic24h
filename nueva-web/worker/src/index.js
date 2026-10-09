// Servidor pequeño (Cloudflare Worker) para la web.
//   POST /api/solicitud -> recibe el formulario, comprueba el anti-spam y avisa por correo o webhook.
//   POST /api/chat      -> responde dudas de averías con Claude, usando solo el contenido de la web.
// Las claves van como "secrets" de Cloudflare, nunca en el código.
import Anthropic from "@anthropic-ai/sdk";
import aparatos from "../../contenido/aparatos.json";
import marcas from "../../contenido/marcas.json";
import codigos from "../../contenido/codigos-error.json";
import faq from "../../contenido/faq.json";
import sitio from "../../config/sitio.json";

const APARATOS = new Set(aparatos.map((a) => a.slug));
const MARCAS = new Set(marcas.map((m) => m.slug));

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origen = request.headers.get("Origin") || "";
    const permitido = (env.ORIGENES_PERMITIDOS || "").split(",").map((s) => s.trim()).filter(Boolean);
    const cors = {
      "Access-Control-Allow-Origin": permitido.includes(origen) ? origen : permitido[0] || "",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      Vary: "Origin"
    };
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return json({ error: "Método no permitido" }, 405, cors);
    if (!permitido.includes(origen)) return json({ error: "Origen no permitido" }, 403, cors);

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

function json(datos, estado, cabeceras) {
  return new Response(JSON.stringify(datos), { status: estado, headers: { ...cabeceras, "Content-Type": "application/json" } });
}

const texto = (v, max) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);

// ---------- Formulario ----------
async function solicitud(d, request, env, cors) {
  const s = {
    aparato: texto(d.aparato, 40),
    marca: texto(d.marca, 20),
    averia: texto(d.averia, 80),
    detalle: texto(d.detalle, 600),
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
    `Avería: ${s.averia}`,
    s.detalle && `Detalle: ${s.detalle}`,
    `Nombre: ${s.nombre}`,
    `Teléfono: ${s.telefono}`,
    `Código postal: ${s.cp}`,
    `Página: ${s.pagina}`,
    Object.keys(s.origen).length && `Origen: ${JSON.stringify(s.origen)}`
  ]
    .filter(Boolean)
    .join("\n");

  const avisos = [];
  if (env.RESEND_API_KEY && env.AVISO_EMAIL) {
    avisos.push(
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: env.REMITENTE_EMAIL,
          to: [env.AVISO_EMAIL],
          subject: `Solicitud: ${s.aparato} ${s.marca} · CP ${s.cp}`,
          text: resumen
        })
      }).then((r) => { if (!r.ok) throw new Error(`Resend ${r.status}`); })
    );
  }
  if (env.WEBHOOK_URL) {
    avisos.push(
      fetch(env.WEBHOOK_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...s, fecha }) })
        .then((r) => { if (!r.ok) throw new Error(`Webhook ${r.status}`); })
    );
  }
  if (!avisos.length) throw new Error("No hay ningún aviso configurado (RESEND_API_KEY/AVISO_EMAIL o WEBHOOK_URL)");
  const resultados = await Promise.allSettled(avisos);
  if (resultados.every((r) => r.status === "rejected")) throw resultados[0].reason;
  resultados.filter((r) => r.status === "rejected").forEach((r) => console.error(r.reason));

  // Estadística sin datos personales (para el mapa por código postal).
  if (env.ESTADISTICAS) {
    const clave = `s:${fecha}:${crypto.randomUUID().slice(0, 8)}`;
    await env.ESTADISTICAS.put(clave, JSON.stringify({ cp: s.cp, aparato: s.aparato, marca: s.marca, fecha, origen: s.origen }));
  }
  return json({ ok: true }, 200, cors);
}

// ---------- Chat con IA ----------
// La "memoria" del bot es el contenido de la web (carpeta contenido/). Para enseñarle algo nuevo, se edita ahí.
const BASE_CONOCIMIENTO = JSON.stringify({
  negocio: {
    nombre: sitio.nombre,
    zona: `${sitio.ciudad} y área metropolitana`,
    horario: sitio.horario,
    experiencia: sitio.experiencia,
    garantiaMeses: sitio.garantiaMeses,
    telefono: sitio.telefonoVisible
  },
  marcas,
  aparatos,
  codigos,
  faq
});

const INSTRUCCIONES = `Eres el asistente de averías de la web de ${sitio.nombre}, un servicio técnico independiente que repara electrodomésticos Bosch, Siemens y Balay (lavadoras, lavavajillas, termos eléctricos, hornos y placas de inducción o vitrocerámica) en ${sitio.ciudad} y alrededores.

Cómo responder:
- En español, con frases cortas y tono cercano. Máximo 4 frases.
- Usa solo la información de la base de conocimiento. Si no está ahí, dilo y recomienda que lo revise un técnico.
- Da pasos seguros que el cliente pueda hacer (limpiar un filtro, comprobar un grifo). Nunca indiques abrir el aparato, manipular la electricidad ni el gas.
- Si hay riesgo (olor a quemado, chispas, salta la luz, fuga de agua), di que desenchufe el aparato y pida un técnico.
- No des precios cerrados. El técnico da el presupuesto tras el diagnóstico.
- Nunca digas que sois el servicio técnico oficial de ninguna marca. Si preguntan, aclara que sois independientes, con más de 20 años de experiencia, repuestos originales y técnicos formados.
- No pidas datos personales en el chat. Para pedir cita, el cliente usa el formulario, el teléfono o WhatsApp.
- Si preguntan algo que no tiene que ver con electrodomésticos o con el servicio, responde amablemente que solo puedes ayudar con averías y reparaciones.

Base de conocimiento (JSON):
${BASE_CONOCIMIENTO}`;

async function chat(d, env, cors) {
  if (!env.ANTHROPIC_API_KEY) throw new Error("Falta ANTHROPIC_API_KEY");
  const lista = Array.isArray(d.mensajes) ? d.mensajes.slice(-12) : [];
  const mensajes = [];
  for (const m of lista) {
    const role = m && m.role === "assistant" ? "assistant" : "user";
    const content = texto(m && m.content, 600);
    if (!content) continue;
    // La API exige alternar usuario/asistente: se juntan mensajes seguidos del mismo rol.
    const ultimo = mensajes[mensajes.length - 1];
    if (ultimo && ultimo.role === role) ultimo.content += `\n${content}`;
    else mensajes.push({ role, content });
  }
  while (mensajes.length && mensajes[0].role !== "user") mensajes.shift();
  if (!mensajes.length || mensajes[mensajes.length - 1].role !== "user") {
    return json({ error: "Falta la pregunta" }, 400, cors);
  }

  const modelo = env.MODELO || "claude-opus-5-5";
  // Los modelos Opus, Sonnet y Fable admiten reintento automático en otro modelo si el primero rechaza la petición.
  const conReintento = /^claude-(opus|sonnet|fable)/.test(modelo);
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const respuesta = await client.beta.messages.create({
    model: modelo,
    max_tokens: 2048,
    output_config: { effort: "low" },
    system: [{ type: "text", text: INSTRUCCIONES, cache_control: { type: "ephemeral" } }],
    messages: mensajes,
    ...(conReintento && { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" })
  });

  if (respuesta.stop_reason === "refusal") {
    return json({ respuesta: "Sobre eso no puedo ayudarte. Si tu electrodoméstico tiene una avería, pide que te llamemos.", mostrarContacto: true }, 200, cors);
  }
  const textoRespuesta = respuesta.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  return json({ respuesta: textoRespuesta || "Ahora mismo no puedo responder. Pide que te llamemos.", mostrarContacto: true }, 200, cors);
}
