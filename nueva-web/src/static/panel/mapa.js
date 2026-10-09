// Panel privado: mapa por código postal con solicitudes de la web y datos de Google Ads.
(function () {
  "use strict";
  var CFG = JSON.parse(document.getElementById("config-panel").textContent);
  var zona = CFG.zonas;
  var CLAVE_SELECCION = "panel_cps_seleccion";
  var NOMBRES_METRICA = { solicitudes: "Solicitudes", impresiones: "Impresiones", clics: "Clics", coste: "Coste (€)", conversiones: "Conversiones" };
  var COLORES = ["#dbeafe", "#93c5fd", "#3b82f6", "#1d4ed8", "#1e3a8a"];
  var datos = { solicitudes: {}, impresiones: {}, clics: {}, coste: {}, conversiones: {} };
  var capa = null, seleccion = null, metrica = "solicitudes";

  function $(s) { return document.querySelector(s); }
  function aviso(texto, error) {
    var p = $("#estado");
    p.textContent = texto;
    p.className = "estado" + (error ? " estado--error" : "");
  }
  function guardarSeleccion() {
    try { localStorage.setItem(CLAVE_SELECCION, JSON.stringify(Array.from(seleccion))); } catch (e) {}
  }
  function fmt(n) { return Math.round(n * 100) / 100 + ""; }

  var mapa = L.map("mapa", { scrollWheelZoom: true }).setView([41.42, 2.12], 11);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · CP: CNIG'
  }).addTo(mapa);

  function enZona(f) {
    return zona.municipios.indexOf(f.properties.municipio) !== -1 || zona.cpExtra.indexOf(f.properties.cp) !== -1;
  }

  // Cortes por cuantiles para repartir colores aunque los valores sean muy distintos.
  function cortes() {
    var v = Object.keys(datos[metrica]).map(function (k) { return datos[metrica][k]; }).filter(function (x) { return x > 0; }).sort(function (a, b) { return a - b; });
    if (!v.length) return [];
    return [0.2, 0.4, 0.6, 0.8]
      .map(function (q) { return v[Math.min(v.length - 1, Math.floor(q * v.length))]; })
      .filter(function (x, i, arr) { return arr.indexOf(x) === i; });
  }

  function color(valor, c) {
    if (!valor) return null;
    var i = 0;
    while (i < c.length && valor > c[i]) i++;
    return COLORES[i];
  }

  function pintar() {
    var c = cortes();
    capa.setStyle(function (f) {
      var v = datos[metrica][f.properties.cp] || 0;
      var relleno = color(v, c);
      var sel = seleccion.has(f.properties.cp);
      return {
        color: sel ? "#0b8a5f" : "#64748b",
        weight: sel ? 2 : 0.6,
        fillColor: relleno || (sel ? "#e6f4ee" : "#e2e8f0"),
        fillOpacity: relleno ? 0.75 : sel ? 0.35 : 0.15
      };
    });
    leyenda(c);
    tabla();
    $("#num-seleccion").textContent = seleccion.size;
  }

  function leyenda(c) {
    var caja = $("#leyenda");
    caja.innerHTML = "";
    var titulo = document.createElement("strong");
    titulo.textContent = NOMBRES_METRICA[metrica];
    caja.appendChild(titulo);
    if (!c.length) {
      var p = document.createElement("p");
      p.textContent = "Sin datos todavía.";
      caja.appendChild(p);
      return;
    }
    var limites = [0].concat(c);
    COLORES.slice(0, c.length + 1).forEach(function (col, i) {
      var fila = document.createElement("div");
      fila.className = "leyenda__fila";
      var cuadro = document.createElement("span");
      cuadro.style.background = col;
      fila.appendChild(cuadro);
      fila.appendChild(document.createTextNode(i < c.length ? "hasta " + fmt(c[i]) : "más de " + fmt(limites[i])));
      caja.appendChild(fila);
    });
  }

  function tabla() {
    var cuerpo = $("#tabla tbody");
    cuerpo.innerHTML = "";
    var nombres = {};
    capa.eachLayer(function (l) { nombres[l.feature.properties.cp] = l.feature.properties.municipio; });
    var filas = Object.keys(nombres)
      .map(function (cp) { return { cp: cp, m: nombres[cp], s: datos.solicitudes[cp] || 0, i: datos.impresiones[cp] || 0, k: datos.clics[cp] || 0, c: datos.coste[cp] || 0, v: datos.conversiones[cp] || 0, x: datos[metrica][cp] || 0 }; })
      .filter(function (f) { return f.x > 0; })
      .sort(function (a, b) { return b.x - a.x; })
      .slice(0, 20);
    filas.forEach(function (f) {
      var tr = document.createElement("tr");
      [f.cp, f.m, f.s, f.i, f.k, fmt(f.c), f.v].forEach(function (v) {
        var td = document.createElement("td");
        td.textContent = v;
        tr.appendChild(td);
      });
      tr.addEventListener("click", function () {
        capa.eachLayer(function (l) { if (l.feature.properties.cp === f.cp) { mapa.fitBounds(l.getBounds(), { maxZoom: 14 }); l.openPopup(); } });
      });
      cuerpo.appendChild(tr);
    });
    $("#tabla-vacia").hidden = filas.length > 0;
  }

  function popup(f) {
    var cp = f.properties.cp;
    var d = document.createElement("div");
    var t = document.createElement("strong");
    t.textContent = cp + " · " + f.properties.municipio;
    d.appendChild(t);
    Object.keys(NOMBRES_METRICA).forEach(function (m) {
      if (datos[m][cp]) {
        var p = document.createElement("div");
        p.textContent = NOMBRES_METRICA[m] + ": " + fmt(datos[m][cp]);
        d.appendChild(p);
      }
    });
    var estado = document.createElement("div");
    estado.className = "popup__sel";
    estado.textContent = seleccion.has(cp) ? "✔ En tu zona de anuncios (clic para quitar)" : "Fuera de tu zona de anuncios (clic para añadir)";
    d.appendChild(estado);
    return d;
  }

  fetch("/panel/cp-barcelona.geojson")
    .then(function (r) { return r.json(); })
    .then(function (geo) {
      geo.features.forEach(function (f) {
        var corregido = zona.nombresCorregidos[f.properties.cp];
        if (corregido) f.properties.municipio = corregido;
      });
      var guardada = null;
      try { guardada = JSON.parse(localStorage.getItem(CLAVE_SELECCION)); } catch (e) {}
      seleccion = new Set(guardada || geo.features.filter(enZona).map(function (f) { return f.properties.cp; }));

      capa = L.geoJSON(geo, {
        onEachFeature: function (f, l) {
          l.bindTooltip(f.properties.cp + " · " + f.properties.municipio, { sticky: true });
          l.bindPopup(function () { return popup(f); });
          l.on("click", function (e) {
            if (e.originalEvent.shiftKey || $("#modo-seleccion").checked) {
              if (seleccion.has(f.properties.cp)) seleccion.delete(f.properties.cp);
              else seleccion.add(f.properties.cp);
              guardarSeleccion();
              pintar();
            }
          });
        }
      }).addTo(mapa);
      mapa.fitBounds(L.geoJSON(geo.features.filter(enZona)).getBounds());
      pintar();
      aviso("Mapa listo. Carga tus solicitudes o un informe de Google Ads.");
    })
    .catch(function () { aviso("No se ha podido cargar el mapa.", true); });

  $("#metrica").addEventListener("change", function (e) { metrica = e.target.value; pintar(); });

  // ---------- Solicitudes de la web (desde el servidor, sin datos personales) ----------
  var token = "";
  try { token = sessionStorage.getItem("panel_token") || ""; } catch (e) {}
  $("#token").value = token;
  $("#cargar-solicitudes").addEventListener("click", function () {
    if (!CFG.estadisticas) return aviso("Falta configurar el servidor (endpoints.solicitud en config/sitio.json).", true);
    token = $("#token").value.trim();
    try { sessionStorage.setItem("panel_token", token); } catch (e) {}
    aviso("Cargando solicitudes…");
    fetch(CFG.estadisticas + "?dias=" + encodeURIComponent($("#dias").value), { headers: { Authorization: "Bearer " + token } })
      .then(function (r) { if (r.status === 401) throw new Error("Clave incorrecta"); if (!r.ok) throw new Error("Error " + r.status); return r.json(); })
      .then(function (res) {
        datos.solicitudes = {};
        Object.keys(res.porCp).forEach(function (cp) { datos.solicitudes[cp] = res.porCp[cp].total; });
        metrica = "solicitudes";
        $("#metrica").value = metrica;
        pintar();
        aviso(res.total + " solicitudes cargadas (últimos " + res.dias + " días).");
      })
      .catch(function (e) { aviso("No se han podido cargar: " + e.message, true); });
  });

  // ---------- Informe de Google Ads (CSV) ----------
  $("#csv-ads").addEventListener("change", function (e) {
    var archivo = e.target.files[0];
    if (!archivo) return;
    archivo.arrayBuffer().then(function (buf) {
      var b = new Uint8Array(buf);
      var cod = b[0] === 0xff && b[1] === 0xfe ? "utf-16le" : b[0] === 0xfe && b[1] === 0xff ? "utf-16be" : "utf-8";
      var texto = new TextDecoder(cod).decode(buf).replace(/^﻿/, "");
      try {
        var n = leerCsvAds(texto);
        metrica = "impresiones";
        $("#metrica").value = metrica;
        pintar();
        aviso("Informe cargado: " + n + " códigos postales con datos.");
      } catch (err) {
        aviso(err.message, true);
      }
    });
  });

  function separarFilas(texto) {
    var primera = texto.split(/\r?\n/).slice(0, 5).join("\n");
    var sep = (primera.match(/\t/g) || []).length > (primera.match(/;/g) || []).length
      ? "\t" : (primera.match(/;/g) || []).length > (primera.match(/,/g) || []).length ? ";" : ",";
    var filas = [], fila = [], campo = "", comillas = false;
    for (var i = 0; i < texto.length; i++) {
      var ch = texto[i];
      if (comillas) {
        if (ch === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
        else if (ch === '"') comillas = false;
        else campo += ch;
      } else if (ch === '"') comillas = true;
      else if (ch === sep) { fila.push(campo); campo = ""; }
      else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && texto[i + 1] === "\n") i++;
        fila.push(campo); filas.push(fila); fila = []; campo = "";
      } else campo += ch;
    }
    if (campo || fila.length) { fila.push(campo); filas.push(fila); }
    return filas;
  }

  function numero(v) {
    var s = String(v || "").replace(/[^\d.,-]/g, "");
    if (!s || s === "-") return 0;
    var coma = s.lastIndexOf(","), punto = s.lastIndexOf(".");
    if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ""); // 1.250 = mil doscientos cincuenta
    else if (/^-?\d{1,3}(,\d{3})+$/.test(s)) s = s.replace(/,/g, ""); // 1,250 (formato inglés)
    else if (coma > punto) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
    return parseFloat(s) || 0;
  }

  function leerCsvAds(texto) {
    var filas = separarFilas(texto);
    // La cabecera es la fila que tiene a la vez una columna de ubicación y una de métricas.
    var iCab = filas.findIndex(function (f) {
      return f.some(function (c) { return /^(c[oó]digo postal|postal code|zip|ubicaci[oó]n|location)/i.test(c.trim()); }) &&
        f.some(function (c) { return /^(impr|clics|clicks|coste|costo|cost)/i.test(c.trim()); });
    });
    if (iCab === -1) throw new Error("No encuentro la columna de código postal o ubicación en el CSV.");
    var cab = filas[iCab];
    function col(re) { return cab.findIndex(function (c) { return re.test(c.trim()); }); }
    var cUbic = col(/c[oó]digo postal|postal code|zip/i);
    if (cUbic === -1) cUbic = col(/ubicaci[oó]n|location/i);
    var cols = {
      impresiones: col(/^impr/i),
      clics: col(/^(clics|clicks)$/i),
      coste: col(/^(coste|costo|cost)$/i),
      conversiones: col(/^(conversiones|conversions)$/i)
    };
    ["impresiones", "clics", "coste", "conversiones"].forEach(function (m) { datos[m] = {}; });
    var conDatos = {};
    filas.slice(iCab + 1).forEach(function (f) {
      var m = String(f[cUbic] || "").match(/\b0[1-9]\d{3}\b/);
      if (!m) return;
      var cp = m[0];
      Object.keys(cols).forEach(function (k) {
        if (cols[k] !== -1) datos[k][cp] = (datos[k][cp] || 0) + numero(f[cols[k]]);
      });
      conDatos[cp] = true;
    });
    var n = Object.keys(conDatos).length;
    if (!n) throw new Error("El CSV no tiene filas con códigos postales. Exporta el informe de Ubicaciones por código postal.");
    return n;
  }

  // ---------- Zona de anuncios: exportar códigos postales ----------
  $("#exportar").addEventListener("click", function () {
    var lista = Array.from(seleccion).sort();
    var blob = new Blob([lista.join("\n") + "\n"], { type: "text/plain;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "codigos-postales-anuncios.txt";
    a.click();
    URL.revokeObjectURL(a.href);
  });
  $("#copiar").addEventListener("click", function () {
    var lista = Array.from(seleccion).sort().map(function (cp) { return cp + ", España"; }).join("\n");
    navigator.clipboard.writeText(lista).then(function () { aviso(seleccion.size + " códigos postales copiados. Pégalos en Google Ads › Ubicaciones › Búsqueda avanzada › Añadir ubicaciones en bloque."); });
  });
  $("#restablecer").addEventListener("click", function () {
    try { localStorage.removeItem(CLAVE_SELECCION); } catch (e) {}
    seleccion = new Set();
    capa.eachLayer(function (l) { if (enZona(l.feature)) seleccion.add(l.feature.properties.cp); });
    pintar();
  });
})();
