// Bot de WhatsApp con la API de WhatsApp Cloud de Meta (sin intermediarios).
//   GET  /api/whatsapp -> verificación del webhook (Meta la hace una vez al configurarlo).
//   POST /api/whatsapp -> mensajes entrantes. Se comprueba la firma de Meta antes de procesarlos.
//
// Flujo: aparato -> marca -> avería (con orientación de la IA) -> nombre, dirección y CP -> foto del E-Nr -> aviso al dueño.
// El estado de cada conversación se guarda en KV (CONVERSACIONES) y caduca a los 7 días.
import { aparatos, marcas, sitio, texto, igualSeguro, avisar, preguntarIA } from "./comun.js";

const SIETE_DIAS = 7 * 24 * 3600;
const TITULOS_CORTOS = {
  lavadoras: "Lavadora",
  lavavajillas: "Lavavajillas",
  frigorificos: "Frigorífico",
  "termos-electricos": "Termo eléctrico",
  hornos: "Horno",
  campanas: "Campana",
  "placas-induccion-vitroceramica": "Placa / vitrocerámica"
};
const PALABRAS_APARATO = {
  lavadoras: ["lavadora"],
  lavavajillas: ["lavavajilla", "friegaplatos"],
  frigorificos: ["frigo", "nevera", "congelador"],
  "termos-electricos": ["termo", "calentador"],
  hornos: ["horno"],
  campanas: ["campana", "extractor"],
  "placas-induccion-vitroceramica": ["placa", "vitro", "induccion", "inducción", "fuego"]
};

export async function whatsapp(request, env, ctx) {
  const url = new URL(request.url);

  if (request.method === "GET") {
    const modo = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token") || "";
    const reto = url.searchParams.get("hub.challenge") || "";
    if (modo === "subscribe" && env.WA_VERIFY_TOKEN && (await igualSeguro(token, env.WA_VERIFY_TOKEN))) {
      return new Response(reto, { status: 200 });
    }
    return new Response("Prohibido", { status: 403 });
  }
  if (request.method !== "POST") return new Response("Método no permitido", { status: 405 });

  const crudo = await request.text();
  if (!(await firmaValida(crudo, request.headers.get("X-Hub-Signature-256") || "", env.WA_APP_SECRET))) {
    return new Response("Firma no válida", { status: 401 });
  }
  let cuerpo;
  try {
    cuerpo = JSON.parse(crudo);
  } catch {
    return new Response("JSON no válido", { status: 400 });
  }
  // Meta espera un 200 rápido; el trabajo sigue en segundo plano.
  ctx.waitUntil(procesar(cuerpo, env).catch((e) => console.error("WhatsApp:", e)));
  return new Response("OK", { status: 200 });
}

async function firmaValida(crudo, cabecera, secreto) {
  if (!secreto || !cabecera.startsWith("sha256=")) return false;
  const clave = await crypto.subtle.importKey("raw", new TextEncoder().encode(secreto), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const firma = await crypto.subtle.sign("HMAC", clave, new TextEncoder().encode(crudo));
  const hex = [...new Uint8Array(firma)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return igualSeguro(cabecera.slice(7), hex);
}

async function procesar(cuerpo, env) {
  for (const entrada of cuerpo.entry || []) {
    for (const cambio of entrada.changes || []) {
      const v = cambio.value || {};
      const nombrePerfil = v.contacts?.[0]?.profile?.name || "";
      for (const m of v.messages || []) {
        // Meta puede reenviar el mismo mensaje: se ignora si ya se procesó.
        if (env.CONVERSACIONES) {
          const visto = await env.CONVERSACIONES.get(`m:${m.id}`);
          if (visto) continue;
          await env.CONVERSACIONES.put(`m:${m.id}`, "1", { expirationTtl: 24 * 3600 });
        }
        await marcarLeido(env, m.id);
        await atender(env, m, nombrePerfil);
      }
    }
  }
}

// ---------- Conversación ----------
async function atender(env, m, nombrePerfil) {
  const wa = m.from;
  const clave = `c:${wa}`;
  const estado = (env.CONVERSACIONES && JSON.parse((await env.CONVERSACIONES.get(clave)) || "null")) || { paso: "inicio", historial: [] };
  const guardar = () => env.CONVERSACIONES && env.CONVERSACIONES.put(clave, JSON.stringify(estado), { expirationTtl: SIETE_DIAS });

  const respuestaId = m.interactive?.button_reply?.id || m.interactive?.list_reply?.id || "";
  const escrito = m.type === "text" ? texto(m.text?.body, 600) : "";
  const minus = escrito.toLowerCase();
  anotar(estado, "user", escrito || m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || `[${m.type}]`);

  if (["audio", "video", "sticker", "location", "contacts"].includes(m.type)) {
    await enviarTexto(env, wa, "De momento no puedo escuchar audios ni ver ese tipo de mensaje. Escríbeme, por favor.");
    return guardar();
  }

  if (/^(menu|menú|empezar|reiniciar|inicio|hola)$/i.test(minus) && estado.paso !== "inicio") {
    estado.paso = "inicio";
  }

  // Elección del aparato (botón de lista o palabra clave)
  const aparatoElegido = respuestaId.startsWith("ap:") ? respuestaId.slice(3) : detectarAparato(minus);
  const marcaElegida = respuestaId.startsWith("ma:") ? respuestaId.slice(3) : marcas.find((x) => minus.includes(x.slug))?.slug;

  switch (estado.paso) {
    case "inicio": {
      if (aparatoElegido) {
        estado.aparato = aparatoElegido;
        if (marcaElegida) {
          estado.marca = marcaElegida;
          estado.paso = "averia";
          await pedirAveria(env, wa, estado);
        } else {
          estado.paso = "marca";
          await pedirMarca(env, wa);
        }
        break;
      }
      if (escrito && !/^(hola|buenas|buenos días|buenas tardes|menu|menú|empezar|reiniciar|inicio)\b/i.test(minus)) {
        await responderConIA(env, wa, estado);
      }
      await enviarTexto(env, wa, `¡Hola${nombrePerfil ? ` ${nombrePerfil.split(" ")[0]}` : ""}! Soy el asistente de ${sitio.nombre}. Reparamos Bosch, Siemens y Balay a domicilio en ${sitio.ciudad}.`);
      await pedirAparato(env, wa);
      estado.paso = "aparato";
      break;
    }
    case "aparato": {
      if (!aparatoElegido) {
        if (escrito) await responderConIA(env, wa, estado);
        await pedirAparato(env, wa);
        break;
      }
      estado.aparato = aparatoElegido;
      estado.paso = "marca";
      await pedirMarca(env, wa);
      break;
    }
    case "marca": {
      if (!marcaElegida) {
        await enviarTexto(env, wa, "Solo reparamos Bosch, Siemens y Balay. ¿De cuál de estas marcas es?");
        await pedirMarca(env, wa);
        break;
      }
      estado.marca = marcaElegida;
      estado.paso = "averia";
      await pedirAveria(env, wa, estado);
      break;
    }
    case "averia": {
      if (!escrito) {
        await enviarTexto(env, wa, "Cuéntame con un mensaje de texto qué le pasa (y el código de error, si lo ves).");
        break;
      }
      estado.averia = escrito.slice(0, 300);
      await responderConIA(env, wa, estado, `El cliente tiene ${describir(estado)} y describe la avería. Dale una orientación breve (máximo 3 frases) y no pidas datos: el sistema los pedirá después.`);
      estado.paso = "datos";
      await enviarTexto(env, wa, "Para mandarte un técnico, escríbeme en un solo mensaje:\n👤 Nombre y apellidos\n📍 Dirección completa (calle, número, piso y puerta)\n📮 Código postal");
      break;
    }
    case "datos": {
      const cp = (escrito.match(/\b0[1-9]\d{3}\b/) || [])[0];
      if (!escrito || escrito.length < 15 || !cp) {
        await enviarTexto(env, wa, `Me falta ${!cp ? "el código postal (5 cifras, por ejemplo 08013)" : "algún dato"}. Escríbeme nombre, dirección completa y código postal en un solo mensaje, por favor.`);
        break;
      }
      estado.datos = escrito.slice(0, 300);
      estado.cp = cp;
      estado.paso = "enr";
      const ap = aparatos.find((a) => a.slug === estado.aparato);
      await enviarBotones(env, wa, `¡Gracias! Último paso: envíame una foto de la etiqueta con el número E-Nr. Así el técnico lleva la pieza correcta.\n\nDónde está: ${ap ? ap.etiqueta : "en la etiqueta del aparato."}`, [{ id: "enr:no", title: "Ahora no" }]);
      break;
    }
    case "enr": {
      if (m.type === "image") estado.fotoEnr = m.image?.id;
      else if (respuestaId === "enr:no") estado.enr = "No enviado";
      else if (escrito) estado.enr = escrito.slice(0, 100);
      else {
        await enviarTexto(env, wa, "Envíame una foto de la etiqueta o pulsa «Ahora no».");
        break;
      }
      estado.paso = "hecho";
      await registrarSolicitud(env, wa, estado, nombrePerfil);
      await enviarTexto(env, wa, `Perfecto ✅ Hemos recibido tu solicitud. Te llamaremos en horario laboral (${sitio.horario}) para fijar la visita.${sitio.telefonoVisible ? ` Si es urgente, llama al ${sitio.telefonoVisible}.` : ""}`);
      break;
    }
    default: {
      // Solicitud ya registrada: se responde la duda y se reenvía el mensaje al dueño.
      if (escrito) await responderConIA(env, wa, estado);
      await enviarTexto(env, wa, "Tu solicitud ya está registrada y te llamaremos pronto. Si quieres pedir otra reparación, escribe «menú».");
      await avisar(env, {
        asunto: `WhatsApp: mensaje nuevo de +${wa}`,
        cuerpo: `Mensaje nuevo de +${wa} (${nombrePerfil}) después de su solicitud:\n\n${escrito || `[${m.type}]`}`,
        datos: { tipo: "whatsapp_mensaje", wa, mensaje: escrito, fecha: new Date().toISOString() }
      }).catch((e) => console.error(e));
    }
  }
  await guardar();
}

function detectarAparato(minus) {
  if (!minus) return null;
  for (const [slug, palabras] of Object.entries(PALABRAS_APARATO)) {
    if (palabras.some((p) => minus.includes(p))) return slug;
  }
  return null;
}

function describir(estado) {
  const ap = aparatos.find((a) => a.slug === estado.aparato);
  const ma = marcas.find((x) => x.slug === estado.marca);
  return [ap ? ap.singular : "un electrodoméstico", ma ? ma.nombre : ""].filter(Boolean).join(" ");
}

function anotar(estado, role, content) {
  if (!content) return;
  estado.historial = [...(estado.historial || []), { role, content: content.slice(0, 600) }].slice(-10);
}

async function responderConIA(env, wa, estado, contexto = "") {
  if (!env.ANTHROPIC_API_KEY) return;
  try {
    const canal = `Estás respondiendo por WhatsApp: usa texto sencillo, sin formato Markdown. ${contexto}`;
    const r = await preguntarIA(env, estado.historial || [], canal);
    if (r) {
      await enviarTexto(env, wa, r);
      anotar(estado, "assistant", r);
    }
  } catch (e) {
    console.error("IA:", e);
  }
}

async function pedirAparato(env, wa) {
  await enviar(env, {
    to: wa,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: "¿Qué electrodoméstico necesitas reparar?" },
      action: {
        button: "Elegir aparato",
        sections: [{ title: "Electrodomésticos", rows: aparatos.map((a) => ({ id: `ap:${a.slug}`, title: TITULOS_CORTOS[a.slug] || a.nombre.slice(0, 24) })) }]
      }
    }
  });
}

async function pedirMarca(env, wa) {
  await enviarBotones(env, wa, "¿De qué marca es?", marcas.map((x) => ({ id: `ma:${x.slug}`, title: x.nombre })));
}

async function pedirAveria(env, wa, estado) {
  await enviarTexto(env, wa, `¿Qué le pasa a tu ${describir(estado)}? Cuéntamelo en un mensaje. Si ves un código de error en la pantalla, escríbelo.`);
}

// ---------- Aviso al dueño ----------
async function registrarSolicitud(env, wa, estado, nombrePerfil) {
  const adjuntos = [];
  if (estado.fotoEnr) {
    const foto = await descargarMedia(env, estado.fotoEnr).catch((e) => (console.error(e), null));
    if (foto) adjuntos.push({ filename: `etiqueta-${wa}.jpg`, content: foto });
  }
  const fecha = new Date().toISOString();
  const cuerpo = [
    `Nueva solicitud por WhatsApp (${fecha})`,
    `WhatsApp: +${wa}${nombrePerfil ? ` (${nombrePerfil})` : ""}`,
    `Aparato: ${describir(estado)}`,
    `Avería: ${estado.averia || "-"}`,
    `Datos: ${estado.datos || "-"}`,
    `E-Nr: ${estado.fotoEnr ? (adjuntos.length ? "foto adjunta" : "foto enviada (no se pudo descargar)") : estado.enr || "-"}`
  ].join("\n");
  await avisar(env, {
    asunto: `WhatsApp: ${describir(estado)} · CP ${estado.cp}`,
    cuerpo,
    adjuntos,
    datos: { tipo: "whatsapp_solicitud", wa, aparato: estado.aparato, marca: estado.marca, averia: estado.averia, datos: estado.datos, cp: estado.cp, enr: estado.enr || (estado.fotoEnr ? "foto" : ""), fecha }
  }).catch((e) => console.error(e));

  // Estadística sin datos personales (para el mapa por código postal).
  if (env.ESTADISTICAS) {
    await env.ESTADISTICAS.put(`s:${fecha}:${crypto.randomUUID().slice(0, 8)}`, "", {
      metadata: { cp: estado.cp, aparato: estado.aparato, marca: estado.marca, campana: "whatsapp" }
    });
  }
}

// ---------- API de Meta ----------
const graph = (env) => `${env.GRAPH_BASE || "https://graph.facebook.com"}/${env.GRAPH_VERSION || "v23.0"}`;

async function enviar(env, mensaje) {
  if (!env.WA_TOKEN || !env.WA_PHONE_NUMBER_ID) throw new Error("Faltan WA_TOKEN o WA_PHONE_NUMBER_ID");
  const r = await fetch(`${graph(env)}/${env.WA_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.WA_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", ...(mensaje.to && { recipient_type: "individual" }), ...mensaje })
  });
  if (!r.ok) throw new Error(`WhatsApp ${r.status}: ${await r.text()}`);
}

const enviarTexto = (env, to, body) => enviar(env, { to, type: "text", text: { body: body.slice(0, 4000) } });

const enviarBotones = (env, to, body, botones) =>
  enviar(env, {
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: body.slice(0, 1024) },
      action: { buttons: botones.slice(0, 3).map((b) => ({ type: "reply", reply: { id: b.id, title: b.title.slice(0, 20) } })) }
    }
  });

async function marcarLeido(env, id) {
  await enviar(env, { status: "read", message_id: id }).catch(() => {});
}

// Descarga una imagen enviada por el cliente y la devuelve en base64 (para adjuntarla al correo).
async function descargarMedia(env, id) {
  const info = await fetch(`${graph(env)}/${id}`, { headers: { Authorization: `Bearer ${env.WA_TOKEN}` } }).then((r) => r.json());
  if (!info.url) throw new Error("Media sin URL");
  const r = await fetch(info.url, { headers: { Authorization: `Bearer ${env.WA_TOKEN}` } });
  if (!r.ok) throw new Error(`Media ${r.status}`);
  const bytes = new Uint8Array(await r.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
