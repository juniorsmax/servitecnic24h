// Funciones compartidas por la web y por WhatsApp: avisos al dueño y respuestas con IA.
import Anthropic from "@anthropic-ai/sdk";
import aparatos from "../../contenido/aparatos.json";
import marcas from "../../contenido/marcas.json";
import codigos from "../../contenido/codigos-error.json";
import faq from "../../contenido/faq.json";
import sitio from "../../config/sitio.json";

export { aparatos, marcas, sitio };

export function json(datos, estado, cabeceras = {}) {
  return new Response(JSON.stringify(datos), { status: estado, headers: { ...cabeceras, "Content-Type": "application/json" } });
}

export const texto = (v, max) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);

// Comparación en tiempo constante para no filtrar claves por tiempos de respuesta.
export async function igualSeguro(a, b) {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([crypto.subtle.digest("SHA-256", enc.encode(a)), crypto.subtle.digest("SHA-256", enc.encode(b))]);
  const x = new Uint8Array(ha), y = new Uint8Array(hb);
  let r = 0;
  for (let i = 0; i < x.length; i++) r |= x[i] ^ y[i];
  return r === 0;
}

// Avisa al dueño por correo (Resend) y/o webhook. Lanza error solo si fallan todos los avisos.
export async function avisar(env, { asunto, cuerpo, datos, adjuntos = [] }) {
  const avisos = [];
  if (env.RESEND_API_KEY && env.AVISO_EMAIL) {
    avisos.push(
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: env.REMITENTE_EMAIL,
          to: [env.AVISO_EMAIL],
          subject: asunto,
          text: cuerpo,
          ...(adjuntos.length && { attachments: adjuntos })
        })
      }).then((r) => { if (!r.ok) throw new Error(`Resend ${r.status}`); })
    );
  }
  if (env.WEBHOOK_URL) {
    avisos.push(
      fetch(env.WEBHOOK_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(datos) })
        .then((r) => { if (!r.ok) throw new Error(`Webhook ${r.status}`); })
    );
  }
  if (!avisos.length) throw new Error("No hay ningún aviso configurado (RESEND_API_KEY/AVISO_EMAIL o WEBHOOK_URL)");
  const resultados = await Promise.allSettled(avisos);
  if (resultados.every((r) => r.status === "rejected")) throw resultados[0].reason;
  resultados.filter((r) => r.status === "rejected").forEach((r) => console.error(r.reason));
}

// ---------- IA ----------
// La "memoria" del asistente es el contenido de la web (carpeta contenido/). Para enseñarle algo nuevo, se edita ahí.
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

const INSTRUCCIONES = `Eres el asistente de averías de ${sitio.nombre}, un servicio técnico independiente que repara electrodomésticos Bosch, Siemens y Balay (${aparatos.map((x) => x.nombre.toLowerCase()).join(", ")}) en ${sitio.ciudad} y alrededores.

Cómo responder:
- En español, con frases cortas y tono cercano. Máximo 4 frases.
- Usa solo la información de la base de conocimiento. Si no está ahí, dilo y recomienda que lo revise un técnico.
- Da pasos seguros que el cliente pueda hacer (limpiar un filtro, comprobar un grifo). Nunca indiques abrir el aparato, manipular la electricidad ni el gas.
- Si hay riesgo (olor a quemado, chispas, salta la luz, fuga de agua), di que desenchufe el aparato y pida un técnico.
- No des precios cerrados. El técnico da el presupuesto tras el diagnóstico.
- Nunca digas que sois el servicio técnico oficial de ninguna marca. Si preguntan, aclara que sois independientes, con más de 20 años de experiencia, repuestos originales y técnicos formados.
- Para que el técnico lleve la pieza correcta, recomienda tener a mano el número E-Nr (modelo) de la etiqueta del aparato; en la base de conocimiento está dónde se encuentra.
- No pidas datos personales: el formulario o el propio asistente los piden cuando hace falta.
- Si preguntan algo que no tiene que ver con electrodomésticos o con el servicio, responde amablemente que solo puedes ayudar con averías y reparaciones.

Base de conocimiento (JSON):
${BASE_CONOCIMIENTO}`;

// mensajes: [{role: "user"|"assistant", content}]. canal: texto extra para el contexto (web o WhatsApp).
export async function preguntarIA(env, mensajesEntrada, canal = "") {
  if (!env.ANTHROPIC_API_KEY) throw new Error("Falta ANTHROPIC_API_KEY");
  const mensajes = [];
  for (const m of mensajesEntrada.slice(-12)) {
    const role = m && m.role === "assistant" ? "assistant" : "user";
    const content = texto(m && m.content, 600);
    if (!content) continue;
    // La API exige alternar usuario/asistente: se juntan mensajes seguidos del mismo rol.
    const ultimo = mensajes[mensajes.length - 1];
    if (ultimo && ultimo.role === role) ultimo.content += `\n${content}`;
    else mensajes.push({ role, content });
  }
  while (mensajes.length && mensajes[0].role !== "user") mensajes.shift();
  if (!mensajes.length || mensajes[mensajes.length - 1].role !== "user") return null;

  const modelo = env.MODELO || "claude-haiku-5-5";
  // Los modelos Opus, Sonnet y Fable admiten reintento automático en otro modelo si el primero rechaza la petición.
  const conReintento = /^claude-(opus|sonnet|fable)/.test(modelo);
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const respuesta = await client.beta.messages.create({
    model: modelo,
    max_tokens: 2048,
    output_config: { effort: "low" },
    system: [
      { type: "text", text: INSTRUCCIONES, cache_control: { type: "ephemeral" } },
      ...(canal ? [{ type: "text", text: canal }] : [])
    ],
    messages: mensajes,
    ...(conReintento && { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" })
  });

  if (respuesta.stop_reason === "refusal") return "Sobre eso no puedo ayudarte. Si tu electrodoméstico tiene una avería, cuéntame qué le pasa.";
  return respuesta.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim() || null;
}
