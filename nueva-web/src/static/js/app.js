// JavaScript de la web: menú, cookies, analítica con consentimiento, formulario por pasos y asistente de averías.
(function () {
  "use strict";
  document.documentElement.classList.add("js");

  var SITIO = {};
  try { SITIO = JSON.parse(document.getElementById("config-sitio").textContent); } catch (e) {}
  var A = SITIO.analitica || {};
  var EP = SITIO.endpoints || {};

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function guardar(clave, valor, sesion) {
    try { (sesion ? sessionStorage : localStorage).setItem(clave, JSON.stringify(valor)); } catch (e) {}
  }
  function cargar(clave, sesion) {
    try { return JSON.parse((sesion ? sessionStorage : localStorage).getItem(clave)); } catch (e) { return null; }
  }
  function el(tag, attrs, texto) {
    var n = document.createElement(tag);
    for (var k in attrs || {}) n.setAttribute(k, attrs[k]);
    if (texto != null) n.textContent = texto;
    return n;
  }

  // ---------- Menú móvil ----------
  var botonMenu = $(".menu-boton");
  if (botonMenu) {
    botonMenu.addEventListener("click", function () {
      var abierto = $("#menu").classList.toggle("abierto");
      botonMenu.setAttribute("aria-expanded", abierto);
    });
  }

  // ---------- Origen de la visita (UTM y gclid) para saber qué anuncio trae cada solicitud ----------
  (function () {
    var p = new URLSearchParams(location.search);
    var origen = {};
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid"].forEach(function (k) {
      if (p.get(k)) origen[k] = p.get(k).slice(0, 120);
    });
    if (Object.keys(origen).length) guardar("origen_visita", origen, true);
  })();

  // ---------- Consentimiento de cookies y analítica ----------
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;
  // Google Consent Mode v2: todo denegado hasta que el usuario acepte.
  gtag("consent", "default", {
    ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied",
    analytics_storage: "denied", functionality_storage: "granted", security_storage: "granted"
  });

  var CLAVE_COOKIES = "preferencias_cookies";
  var DOCE_MESES = 365 * 24 * 3600 * 1000;
  var cargados = {};

  function cargarScript(src) {
    if (cargados[src]) return;
    cargados[src] = true;
    var s = document.createElement("script");
    s.async = true;
    s.src = src;
    document.head.appendChild(s);
  }

  function aplicarConsentimiento(pref) {
    gtag("consent", "update", {
      analytics_storage: pref.analitica ? "granted" : "denied",
      ad_storage: pref.publicidad ? "granted" : "denied",
      ad_user_data: pref.publicidad ? "granted" : "denied",
      ad_personalization: pref.publicidad ? "granted" : "denied"
    });
    // Modo básico: no se carga ninguna etiqueta hasta que haya consentimiento.
    if (!pref.analitica && !pref.publicidad) return;
    if (A.gtm) {
      window.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });
      cargarScript("https://www.googletagmanager.com/gtm.js?id=" + encodeURIComponent(A.gtm));
    } else if (A.ga4 || A.googleAds) {
      cargarScript("https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(A.ga4 || A.googleAds));
      gtag("js", new Date());
      if (A.ga4 && pref.analitica) gtag("config", A.ga4);
      if (A.googleAds && pref.publicidad) gtag("config", A.googleAds);
    }
    if (A.clarity && pref.analitica && !window.clarity) {
      window.clarity = function () { (window.clarity.q = window.clarity.q || []).push(arguments); };
      cargarScript("https://www.clarity.ms/tag/" + encodeURIComponent(A.clarity));
    }
    document.dispatchEvent(new CustomEvent("consentimiento-listo", { detail: pref }));
  }

  function preferencias() {
    var p = cargar(CLAVE_COOKIES);
    if (!p || !p.fecha || Date.now() - p.fecha > DOCE_MESES) return null;
    return p;
  }

  function guardarPreferencias(analitica, publicidad) {
    var pref = { analitica: !!analitica, publicidad: !!publicidad, fecha: Date.now() };
    guardar(CLAVE_COOKIES, pref);
    var banner = $(".cookies");
    if (banner) banner.remove();
    aplicarConsentimiento(pref);
  }

  function mostrarBanner() {
    if ($(".cookies")) return;
    var actual = preferencias() || {};
    var b = el("section", { class: "cookies", role: "dialog", "aria-labelledby": "cookies-titulo", "aria-modal": "false" });
    b.innerHTML =
      '<h2 id="cookies-titulo">Cookies</h2>' +
      "<p>Usamos cookies propias necesarias y, solo si lo aceptas, cookies de análisis y publicidad para medir visitas y anuncios. " +
      '<a href="/cookies/">Más información</a>.</p>' +
      '<div class="cookies__opciones" hidden>' +
      '<label><input type="checkbox" checked disabled> <span><strong>Necesarias</strong>: el sitio no funciona sin ellas.</span></label>' +
      '<label><input type="checkbox" data-c="analitica"' + (actual.analitica ? " checked" : "") + '> <span><strong>Análisis</strong>: estadísticas de visitas (Google Analytics, Clarity).</span></label>' +
      '<label><input type="checkbox" data-c="publicidad"' + (actual.publicidad ? " checked" : "") + '> <span><strong>Publicidad</strong>: medir qué anuncios funcionan (Google Ads).</span></label>' +
      "</div>" +
      '<div class="cookies__botones">' +
      '<button type="button" class="boton boton--secundario" data-c-rechazar>Rechazar</button>' +
      '<button type="button" class="boton boton--secundario" data-c-configurar>Configurar</button>' +
      '<button type="button" class="boton" data-c-aceptar>Aceptar todas</button>' +
      "</div>";
    document.body.appendChild(b);
    $("[data-c-aceptar]", b).addEventListener("click", function () { guardarPreferencias(true, true); });
    $("[data-c-rechazar]", b).addEventListener("click", function () { guardarPreferencias(false, false); });
    $("[data-c-configurar]", b).addEventListener("click", function (e) {
      var opciones = $(".cookies__opciones", b);
      if (opciones.hidden) {
        opciones.hidden = false;
        e.target.textContent = "Guardar selección";
      } else {
        guardarPreferencias($('[data-c="analitica"]', b).checked, $('[data-c="publicidad"]', b).checked);
      }
    });
  }

  var pref = preferencias();
  if (pref) aplicarConsentimiento(pref);
  else mostrarBanner();
  document.addEventListener("click", function (e) {
    if (e.target.closest("[data-abrir-cookies]")) mostrarBanner();
  });

  // Eventos de contacto (llamadas, WhatsApp) para la analítica.
  document.addEventListener("click", function (e) {
    var a = e.target.closest("[data-evento]");
    if (a) window.dataLayer.push({ event: "contacto_" + a.getAttribute("data-evento"), pagina: location.pathname });
  });

  // ---------- Datos compartidos (averías, códigos, FAQ) ----------
  var promesaDatos = null;
  function datos() {
    if (!promesaDatos) promesaDatos = fetch("/datos/bot.json").then(function (r) { return r.json(); });
    return promesaDatos;
  }

  // ---------- Formulario por pasos ----------
  $$("[data-formulario]").forEach(iniciarFormulario);

  function iniciarFormulario(form) {
    var pasos = $$(".paso", form);
    var actual = 0;
    var bAnterior = $("[data-anterior]", form);
    var bSiguiente = $("[data-siguiente]", form);
    var bEnviar = $("[data-enviar]", form);
    var error = $(".formulario__error", form);
    var barra = $(".progreso__barra", form);
    var textoProgreso = $(".progreso__texto", form);
    var selAparato = form.elements.aparato;
    var selAveria = form.elements.averia;
    var widgetTurnstile = null;

    function mostrar(i) {
      actual = i;
      pasos.forEach(function (p, n) { p.classList.toggle("activo", n === i); });
      bAnterior.hidden = i === 0;
      bSiguiente.hidden = i === pasos.length - 1;
      bEnviar.hidden = i !== pasos.length - 1;
      barra.style.width = Math.round(((i + 1) / pasos.length) * 100) + "%";
      textoProgreso.textContent = "Paso " + (i + 1) + " de " + pasos.length;
      error.hidden = true;
      if (i === pasos.length - 1) prepararTurnstile();
    }

    function validarPaso(i) {
      var campos = $$("input, select, textarea", pasos[i]);
      for (var k = 0; k < campos.length; k++) {
        var c = campos[k];
        if (c.name === "web") continue;
        if (c.name === "telefono") c.value = c.value.replace(/[\s.-]/g, "");
        var valido = c.checkValidity();
        c.setAttribute("aria-invalid", valido ? "false" : "true");
        if (!valido) {
          error.textContent = mensajeError(c);
          error.hidden = false;
          c.focus();
          return false;
        }
      }
      return true;
    }

    function mensajeError(c) {
      if (c.name === "cp") return "Escribe un código postal válido (5 cifras, por ejemplo 08001).";
      if (c.name === "telefono") return "Escribe un teléfono válido de 9 cifras.";
      if (c.name === "consentimiento") return "Necesitamos tu permiso para llamarte.";
      return "Revisa este campo: " + (c.closest("label") ? c.closest("label").firstChild.textContent.trim() : c.name) + ".";
    }

    // Las averías cambian según el electrodoméstico elegido.
    selAparato.addEventListener("change", function () {
      datos().then(function (d) {
        var ap = d.aparatos.filter(function (a) { return a.slug === selAparato.value; })[0];
        selAveria.innerHTML = "";
        selAveria.appendChild(el("option", { value: "" }, "Elige la avería"));
        (ap ? ap.averias : []).forEach(function (v) { selAveria.appendChild(el("option", {}, v.titulo)); });
        selAveria.appendChild(el("option", {}, "Otra avería"));
      });
    });

    function prepararTurnstile() {
      if (!SITIO.turnstileSiteKey || widgetTurnstile !== null) return;
      widgetTurnstile = "cargando";
      window.alCargarTurnstile = function () {
        $$("[data-turnstile]").forEach(function (caja) {
          if (caja.closest("form") === form) {
            widgetTurnstile = window.turnstile.render(caja, { sitekey: SITIO.turnstileSiteKey, language: "es" });
          }
        });
      };
      if (window.turnstile) window.alCargarTurnstile();
      else cargarScript("https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=alCargarTurnstile");
    }

    bSiguiente.addEventListener("click", function () { if (validarPaso(actual)) mostrar(actual + 1); });
    bAnterior.addEventListener("click", function () { mostrar(actual - 1); });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      for (var i = 0; i < pasos.length; i++) {
        if (!validarPaso(i)) { mostrar(i); validarPaso(i); return; }
      }
      if (form.elements.web.value) return; // trampa para robots
      var f = form.elements;
      var envio = {
        aparato: f.aparato.value,
        marca: f.marca.value,
        averia: f.averia.value,
        detalle: f.detalle.value.trim(),
        cp: f.cp.value.trim(),
        nombre: f.nombre.value.trim(),
        telefono: f.telefono.value.trim(),
        consentimiento: f.consentimiento.checked,
        pagina: location.pathname,
        origen: cargar("origen_visita", true) || {},
        turnstile: window.turnstile && typeof widgetTurnstile === "string" && widgetTurnstile !== "cargando"
          ? window.turnstile.getResponse(widgetTurnstile) : ""
      };
      bEnviar.disabled = true;
      bEnviar.textContent = "Enviando…";

      var peticion = EP.solicitud
        ? fetch(EP.solicitud, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(envio) })
            .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); })
        : Promise.resolve(console.warn("Formulario en modo prueba: falta endpoints.solicitud en config/sitio.json"));

      peticion.then(function () {
        guardar("ultima_solicitud", { aparato: envio.aparato, marca: envio.marca, averia: envio.averia, prueba: !EP.solicitud }, true);
        window.dataLayer.push({ event: "solicitud_enviada", marca: envio.marca, aparato: envio.aparato });
        location.href = "/gracias/" + (envio.marca ? envio.marca + "/" : "");
      }).catch(function () {
        bEnviar.disabled = false;
        bEnviar.textContent = "Enviar solicitud";
        error.textContent = "No se ha podido enviar. Inténtalo de nuevo o llámanos.";
        error.hidden = false;
        if (window.turnstile && widgetTurnstile && widgetTurnstile !== "cargando") window.turnstile.reset(widgetTurnstile);
      });
    });

    mostrar(0);
  }

  // ---------- Página de gracias: resumen y conversión ----------
  var resumen = $("[data-resumen-solicitud]");
  if (resumen) {
    var s = cargar("ultima_solicitud", true);
    if (s) {
      datos().then(function (d) {
        var ap = d.aparatos.filter(function (a) { return a.slug === s.aparato; })[0];
        var ma = d.marcas.filter(function (m) { return m.slug === s.marca; })[0];
        resumen.textContent = "Tu solicitud: " + [ap && ap.singular, ma && ma.nombre].filter(Boolean).join(" ") + (s.averia ? " · " + s.averia : "") + (s.prueba ? " (modo prueba)" : "");
      });
      // La conversión de Google Ads solo se envía una vez y solo con consentimiento de publicidad.
      if (!cargar("conversion_enviada", true)) {
        var enviarConversion = function (p) {
          if (!p.publicidad || !A.googleAds || !A.googleAdsConversion) return;
          gtag("event", "conversion", { send_to: A.googleAds + "/" + A.googleAdsConversion });
          guardar("conversion_enviada", true, true);
        };
        var pa = preferencias();
        if (pa) enviarConversion(pa);
        else document.addEventListener("consentimiento-listo", function (ev) { enviarConversion(ev.detail); }, { once: true });
      }
    }
  }

  // ---------- Asistente de averías (bot) ----------
  // Funciona sin IA con las respuestas de la web. Si hay un endpoint de chat configurado, las preguntas libres van a la IA.
  var botonBot = el("button", { type: "button", class: "bot-boton", "aria-controls": "bot", "aria-expanded": "false" });
  botonBot.innerHTML = '<svg class="ico" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M5 6h22v15H13l-6 5v-5H5z"/></svg>';
  botonBot.appendChild(document.createTextNode("¿Qué le pasa?"));
  document.body.appendChild(botonBot);

  var panel = null, cajaMensajes = null, historial = [], estado = {};

  function abrirBot() {
    if (!panel) crearPanel();
    panel.hidden = false;
    botonBot.hidden = true;
    botonBot.setAttribute("aria-expanded", "true");
    $("input", panel).focus();
  }
  function cerrarBot() {
    panel.hidden = true;
    botonBot.hidden = false;
    botonBot.setAttribute("aria-expanded", "false");
    botonBot.focus();
  }
  botonBot.addEventListener("click", abrirBot);
  document.addEventListener("click", function (e) {
    if (e.target.closest("[data-abrir-bot]")) abrirBot();
  });

  function crearPanel() {
    panel = el("section", { id: "bot", class: "bot", role: "dialog", "aria-label": "Asistente de averías" });
    panel.innerHTML =
      '<div class="bot__cabecera"><div><strong>Asistente de averías</strong><span>Bosch · Siemens · Balay</span></div>' +
      '<button type="button" class="bot__cerrar" aria-label="Cerrar">×</button></div>' +
      '<div class="bot__mensajes" aria-live="polite"></div>' +
      '<form class="bot__entrada"><input type="text" maxlength="400" placeholder="Escribe tu duda o un código de error" aria-label="Tu mensaje"><button type="submit">Enviar</button></form>' +
      '<p class="bot__aviso">Orientación automática. El diagnóstico definitivo lo da el técnico. No escribas datos personales.</p>';
    document.body.appendChild(panel);
    cajaMensajes = $(".bot__mensajes", panel);
    $(".bot__cerrar", panel).addEventListener("click", cerrarBot);
    panel.addEventListener("keydown", function (e) { if (e.key === "Escape") cerrarBot(); });
    $(".bot__entrada", panel).addEventListener("submit", function (e) {
      e.preventDefault();
      var input = $("input", panel);
      var texto = input.value.trim();
      if (!texto) return;
      input.value = "";
      decir(texto, true);
      responderTexto(texto);
    });
    inicioBot();
  }

  function decir(texto, mio) {
    var m = el("div", { class: "msg " + (mio ? "msg--yo" : "msg--bot") }, texto);
    cajaMensajes.appendChild(m);
    cajaMensajes.scrollTop = cajaMensajes.scrollHeight;
    historial.push({ role: mio ? "user" : "assistant", content: texto });
    if (historial.length > 20) historial = historial.slice(-20);
    return m;
  }

  function opciones(lista) {
    var caja = el("div", { class: "opciones" });
    lista.forEach(function (o) {
      var b;
      if (o.href) {
        b = el("a", { href: o.href }, o.texto);
        if (o.evento) b.setAttribute("data-evento", o.evento);
        if (/^https?:/.test(o.href)) { b.target = "_blank"; b.rel = "noopener"; }
      } else {
        b = el("button", { type: "button" }, o.texto);
        b.addEventListener("click", function () { caja.remove(); decir(o.texto, true); o.accion(); });
      }
      caja.appendChild(b);
    });
    cajaMensajes.appendChild(caja);
    cajaMensajes.scrollTop = cajaMensajes.scrollHeight;
  }

  function inicioBot() {
    decir("¡Hola! Te ayudo a entender qué le pasa a tu electrodoméstico. ¿Cuál es?");
    datos().then(function (d) {
      var lista = d.aparatos.map(function (a) {
        return { texto: a.nombre, accion: function () { elegirAparato(a, d); } };
      });
      lista.push({ texto: "Tengo un código de error", accion: function () { pedirCodigo(); } });
      opciones(lista);
    });
  }

  function elegirAparato(a, d) {
    estado.aparato = a;
    decir("¿Qué le pasa a tu " + a.singular + "?");
    opciones(a.averias.map(function (v) {
      return { texto: v.titulo, accion: function () { explicarAveria(v, d); } };
    }).concat([{ texto: "Otra cosa", accion: function () { decir("Cuéntamelo con tus palabras en el cuadro de abajo."); } }]));
  }

  function explicarAveria(v, d) {
    decir(v.texto);
    decir("¿De qué marca es?");
    opciones(d.marcas.map(function (m) {
      return { texto: m.nombre, accion: function () { estado.marca = m; cierre(); } };
    }));
  }

  function cierre() {
    var a = estado.aparato, m = estado.marca;
    decir("Lo más seguro es que lo revise un técnico. Te llamamos para fijar la visita.");
    var destino = a && m ? "/" + m.slug + "/" + a.slug + "/#solicitud" : "#solicitud";
    var acciones = [{ texto: "Pedir técnico", href: destino, evento: "bot-formulario" }];
    if (SITIO.telefono) acciones.push({ texto: "Llamar", href: "tel:" + SITIO.telefono.replace(/\s/g, ""), evento: "llamada" });
    if (SITIO.whatsapp) {
      var msg = "Hola, mi " + (a ? a.singular : "electrodoméstico") + (m ? " " + m.nombre : "") + " tiene una avería";
      acciones.push({ texto: "WhatsApp", href: "https://wa.me/" + SITIO.whatsapp.replace(/\D/g, "") + "?text=" + encodeURIComponent(msg), evento: "whatsapp" });
    }
    opciones(acciones);
  }

  function pedirCodigo() {
    estado.esperandoCodigo = true;
    decir("Escribe el código tal como aparece en la pantalla (por ejemplo E15 o F18).");
  }

  function normalizar(t) {
    return t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  }

  function buscarCodigo(texto, d) {
    var m = texto.toUpperCase().match(/\b([EF])\s*:?\s*(\d{2,3})\b/);
    if (!m) return null;
    var cod = m[2];
    var hallados = [];
    ["lavadoras", "lavavajillas"].forEach(function (ap) {
      (d.codigos[ap] || []).forEach(function (c) {
        if (c.codigo.replace(/\s/g, "").split("/").some(function (x) { return x.replace(/\D/g, "") === cod; })) {
          hallados.push({ ap: ap, c: c });
        }
      });
    });
    return hallados;
  }

  function responderTexto(texto) {
    datos().then(function (d) {
      var codigos = buscarCodigo(texto, d);
      if (codigos && codigos.length) {
        estado.esperandoCodigo = false;
        codigos.forEach(function (h) {
          var ap = d.aparatos.filter(function (a) { return a.slug === h.ap; })[0];
          estado.aparato = ap;
          decir((ap ? ap.nombre : h.ap) + " · " + h.c.codigo + ": " + h.c.significado + "\nQué hacer: " + h.c.queHacer);
        });
        decir("Los códigos son orientativos y cambian según el modelo. Si el error sigue, pide un técnico.");
        cierre();
        return;
      }
      if (EP.chat) return preguntarIA();

      var t = normalizar(texto);
      var mejor = null, puntos = 0;
      d.faq.forEach(function (f) {
        var p = (f.claves || []).filter(function (c) { return t.indexOf(normalizar(c)) !== -1; }).length;
        if (p > puntos) { puntos = p; mejor = f.r; }
      });
      d.aparatos.forEach(function (a) {
        a.averias.forEach(function (v) {
          var palabras = normalizar(v.titulo).split(/\s+/).filter(function (w) { return w.length > 3; });
          var p = palabras.filter(function (w) { return t.indexOf(w) !== -1; }).length;
          if (t.indexOf(normalizar(a.singular)) !== -1) p += 1;
          if (p > puntos) { puntos = p; mejor = a.nombre + " · " + v.titulo + ": " + v.texto; estado.aparato = a; }
        });
      });
      if (mejor && puntos >= 1) {
        decir(mejor);
        cierre();
      } else if (estado.esperandoCodigo) {
        decir("No tengo ese código en mi lista. Un técnico te lo puede confirmar.");
        cierre();
      } else {
        decir("No estoy seguro de haberte entendido. Elige tu electrodoméstico o pide que te llamemos.");
        opciones(d.aparatos.map(function (a) {
          return { texto: a.nombre, accion: function () { elegirAparato(a, d); } };
        }));
      }
    });
  }

  function preguntarIA() {
    var escribiendo = decir("Escribiendo…");
    historial.pop(); // no enviar el "Escribiendo…"
    fetch(EP.chat, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mensajes: historial.slice(-12), pagina: location.pathname })
    })
      .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
      .then(function (res) {
        escribiendo.remove();
        decir(res.respuesta || "Ahora mismo no puedo responder. Pide que te llamemos.");
        if (res.mostrarContacto) cierre();
      })
      .catch(function () {
        escribiendo.remove();
        decir("Ahora mismo no puedo responder. Pide que te llamemos y te ayudamos.");
        cierre();
      });
  }
})();
