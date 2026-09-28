(function () {
  "use strict";

  var T = window.Trompo;
  var API = "../api/admin.php";
  var CLAVE_TEMA = "trompo_tema_admin";
  var ESTADOS = {
    recibido: { texto: "Recibido", chip: "info" },
    preparando: { texto: "En la plancha", chip: "alerta" },
    listo: { texto: "Listo", chip: "ok" },
    entregado: { texto: "Entregado", chip: "" },
    cancelado: { texto: "Cancelado", chip: "error" }
  };
  var SIGUIENTE = { recibido: ["preparando", "A la plancha"], preparando: ["listo", "Marcar listo"], listo: ["entregado", "Entregado"] };

  var estado = {
    token: "",
    vista: "resumen",
    config: null,
    platos: [],
    categorias: {},
    fotos: [],
    ingredientes: [],
    eventos: [],
    filtroEvento: "",
    ultimaSerie: null,
    temporizador: 0,
    contadores: 0
  };

  function $(id) {
    return document.getElementById(id);
  }

  function crear(tag, clase, texto) {
    var el = document.createElement(tag);
    if (clase) el.className = clase;
    if (texto !== undefined && texto !== null) el.textContent = texto;
    return el;
  }

  function boton(texto, clase, accion) {
    var b = crear("button", "boton-a boton-a--chico" + (clase ? " " + clase : ""), texto);
    b.type = "button";
    if (accion) b.addEventListener("click", accion);
    return b;
  }

  function chip(texto, tipo) {
    return crear("span", "chip" + (tipo ? " chip--" + tipo : ""), texto);
  }

  var avisoTimer = 0;
  function aviso(texto) {
    var el = $("aviso");
    el.textContent = texto;
    el.classList.add("aviso--visible");
    clearTimeout(avisoTimer);
    avisoTimer = setTimeout(function () { el.classList.remove("aviso--visible"); }, 3500);
  }

  function confirmar(titulo, texto, accion) {
    var d = $("dlgConfirmar");
    $("confirmarTitulo").textContent = titulo;
    $("confirmarTexto").textContent = texto;
    $("confirmarSi").textContent = accion || "Sí, continuar";
    d.returnValue = "";
    d.showModal();
    return new Promise(function (resolver) {
      d.addEventListener("close", function fin() {
        d.removeEventListener("close", fin);
        resolver(d.returnValue === "si");
      });
    });
  }

  function pedirToken() {
    return fetch("../api/token.php", { credentials: "same-origin" })
      .then(function (r) { return r.json(); })
      .then(function (d) { estado.token = d.token || ""; return estado.token; });
  }

  function api(accion, datos, reintento) {
    var formulario = datos instanceof FormData;
    var cuerpo;
    if (formulario) {
      datos.append("accion", accion);
      cuerpo = datos;
    } else {
      cuerpo = JSON.stringify(Object.assign({ accion: accion }, datos || {}));
    }
    var listo = estado.token ? Promise.resolve(estado.token) : pedirToken();
    return listo.then(function (token) {
      var cab = { "X-CSRF-Token": token };
      if (!formulario) cab["Content-Type"] = "application/json";
      return fetch(API, { method: "POST", credentials: "same-origin", headers: cab, body: cuerpo });
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (r.status === 403 && !reintento && !formulario) {
          estado.token = "";
          return api(accion, datos, true);
        }
        if (r.status === 401 && d.sesion === false) {
          mostrarAcceso();
        }
        if (!r.ok || d.ok === false) {
          var e = new Error(d.mensaje || "No se pudo completar. Revisa tu conexión.");
          e.estado = r.status;
          e.errores = d.errores || {};
          throw e;
        }
        return d;
      });
    });
  }

  function error(e) {
    if (e && e.estado !== 401) aviso(e.message);
  }

  function fechaHora(iso) {
    var d = new Date(iso);
    return T.fechaCorta(T.fechaISO(d)) + " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }

  function fechaBonita(iso) {
    var p = iso.split("-");
    var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    return T.DIAS[d.getDay()] + " " + T.fechaCorta(iso);
  }

  function iniciarTema() {
    var b = $("cambiarTema");
    function pintar() {
      var oscuro = document.documentElement.classList.contains("tema-oscuro");
      $("cambiarTemaTexto").textContent = oscuro ? "Modo claro" : "Modo oscuro";
      b.setAttribute("aria-pressed", String(oscuro));
      b.setAttribute("aria-label", oscuro ? "Activar modo claro" : "Activar modo oscuro");
    }
    b.addEventListener("click", function () {
      var oscuro = document.documentElement.classList.toggle("tema-oscuro");
      try { localStorage.setItem(CLAVE_TEMA, oscuro ? "oscuro" : "claro"); } catch (e) {}
      pintar();
      if (estado.ultimaSerie) dibujarGrafico(estado.ultimaSerie);
    });
    pintar();
  }

  function mostrarAcceso() {
    clearInterval(estado.temporizador);
    clearInterval(estado.contadores);
    $("panel").hidden = true;
    $("pantallaAcceso").hidden = false;
  }

  function iniciarAcceso() {
    var form = $("formAcceso");
    var modo = "login";
    api("estado").then(function (r) {
      if (r.sesion) return entrar();
      if (!r.configurado) {
        modo = "setup";
        $("accesoTitulo").textContent = "Crea la cuenta del equipo";
        $("accesoTexto").textContent = r.local ? "Es la primera vez que entras. Elige un usuario y una contraseña de al menos 10 caracteres." : "La cuenta solo se puede crear desde el mismo equipo donde corre el servidor.";
        $("campoClave2").hidden = false;
        $("botonAcceso").textContent = "Crear cuenta";
        form.clave.autocomplete = "new-password";
      }
      mostrarAcceso();
      form.usuario.focus();
    }).catch(function () {
      mostrarAcceso();
      var e = $("errorAcceso");
      e.textContent = "No hay conexión con el servidor PHP. Enciéndelo con: php -S localhost:8000";
      e.hidden = false;
    });

    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var err = $("errorAcceso");
      err.hidden = true;
      if (modo === "setup" && form.clave.value !== form.clave2.value) {
        err.textContent = "Las contraseñas no coinciden.";
        err.hidden = false;
        return;
      }
      var b = $("botonAcceso");
      b.disabled = true;
      api(modo, { usuario: form.usuario.value.trim(), clave: form.clave.value }).then(function () {
        form.reset();
        entrar();
      }).catch(function (e) {
        err.textContent = e.message;
        err.hidden = false;
      }).then(function () {
        b.disabled = false;
      });
    });

    $("salir").addEventListener("click", function () {
      api("logout").then(function () {
        estado.token = "";
        location.reload();
      });
    });
  }

  function entrar() {
    $("pantallaAcceso").hidden = true;
    $("panel").hidden = false;
    $("fechaHoy").textContent = new Date().toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    var inicial = (location.hash || "").slice(1);
    irA(document.querySelector('[data-vista="' + inicial + '"]') ? inicial : "resumen");
    actualizarContadores();
    clearInterval(estado.contadores);
    estado.contadores = setInterval(actualizarContadores, 30000);
  }

  function actualizarContadores() {
    api("resumen").then(function (r) {
      var fila = r.hoy.en_fila;
      $("cFila").textContent = fila;
      $("cFila").hidden = !fila;
      var inv = r.alertas.filter(function (a) { return a.vista === "inventario"; }).length;
      $("cInventario").textContent = inv;
      $("cInventario").hidden = !inv;
      var ev = r.alertas.filter(function (a) { return a.vista === "eventos"; });
      var n = ev.length ? parseInt(ev[0].texto, 10) || 1 : 0;
      $("cEventos").textContent = n;
      $("cEventos").hidden = !n;
    }).catch(function () {});
  }

  var CARGAS = {
    resumen: cargarResumen,
    fila: cargarFila,
    pedidos: cargarPedidos,
    menu: cargarPlatos,
    inventario: cargarInventario,
    ruta: cargarRuta,
    eventos: cargarEventos,
    automatizaciones: cargarConfig
  };

  function irA(vista) {
    estado.vista = vista;
    document.querySelectorAll(".vista").forEach(function (v) { v.hidden = v.id !== "vista-" + vista; });
    document.querySelectorAll("#navPanel button").forEach(function (b) {
      if (b.dataset.vista === vista) b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
    });
    if (history.replaceState) history.replaceState(null, "", "#" + vista);
    clearInterval(estado.temporizador);
    if (vista === "fila") estado.temporizador = setInterval(cargarFila, 10000);
    CARGAS[vista]();
    window.scrollTo(0, 0);
  }

  function iniciarNavegacion() {
    $("navPanel").addEventListener("click", function (ev) {
      var b = ev.target.closest("[data-vista]");
      if (b) irA(b.dataset.vista);
    });
    document.addEventListener("click", function (ev) {
      var b = ev.target.closest("[data-ir]");
      if (b) irA(b.dataset.ir);
    });
  }

  function pintarEstadoHoy(caja, h) {
    caja.textContent = "";
    var p = h.parada;
    var etiquetas = {
      abierto: ["Sirviendo ahora", "ok"],
      pronto: ["Abre a las " + p.inicio, "alerta"],
      termino: ["Terminó la jornada", ""],
      evento: ["Evento privado", "info"],
      cerrado: ["Sin servicio hoy", "error"],
      descanso: ["Día de descanso", ""]
    };
    var e = etiquetas[h.estado] || ["—", ""];
    caja.appendChild(chip(e[0], e[1]));
    caja.appendChild(crear("strong", "", p.activo ? p.lugar + " · " + p.inicio + "–" + p.fin : p.nota || "Hoy no hay ruta"));
    if (h.estado === "abierto" || h.estado === "pronto") {
      caja.appendChild(crear("span", "", "Espera estimada ~" + h.espera_min + " min"));
      caja.appendChild(crear("span", "", T.plural(h.en_fila, "pedido", "pedidos") + " en fila"));
      var libres = h.franjas.filter(function (f) { return !f.lleno; }).length;
      caja.appendChild(crear("span", "", T.plural(libres, "franja libre", "franjas libres")));
    } else if (h.proxima) {
      caja.appendChild(crear("span", "", "Siguiente: " + h.proxima.nombre_dia + " en " + h.proxima.lugar));
    }
    if (h.promo) caja.appendChild(chip("Promo: " + h.promo.titulo, "info"));
    if (h.aviso) caja.appendChild(chip("Aviso publicado", "alerta"));
  }

  function cargarResumen() {
    api("resumen").then(function (r) {
      pintarEstadoHoy($("resumenHoy"), r.hoy);
      var k = r.kpi;
      var kpis = $("kpis");
      kpis.textContent = "";
      [
        ["Ventas en línea hoy", T.dinero(k.ventas), "sin contar ventanilla"],
        ["Pedidos hoy", k.pedidos, "sin cancelados"],
        ["Ticket promedio", T.dinero(k.ticket), "por pedido"],
        ["Tacos vendidos", k.tacos, "piezas en línea"]
      ].forEach(function (x) {
        var d = crear("div", "kpi");
        d.appendChild(crear("dt", "", x[0]));
        var dd = crear("dd", "", x[1]);
        dd.appendChild(crear("small", "", x[2]));
        d.appendChild(dd);
        kpis.appendChild(d);
      });

      estado.ultimaSerie = r.serie;
      dibujarGrafico(r.serie);
      var suma = r.serie.reduce(function (a, s) { return a + s.ventas; }, 0);
      var pedidos = r.serie.reduce(function (a, s) { return a + s.pedidos; }, 0);
      $("serieTotal").textContent = T.dinero(suma) + " en " + T.plural(pedidos, "pedido", "pedidos");

      var alertas = $("alertas");
      alertas.textContent = "";
      if (!r.alertas.length) {
        var ok = crear("p", "alerta alerta--ok", "Todo en orden. No hay nada pendiente.");
        alertas.appendChild(ok);
      }
      r.alertas.forEach(function (a) {
        var b = crear("button", "alerta alerta--" + a.nivel, a.texto);
        b.type = "button";
        b.dataset.ir = a.vista;
        alertas.appendChild(b);
      });

      var top = $("topAdmin");
      top.textContent = "";
      var max = r.top.length ? r.top[0].cantidad : 1;
      r.top.forEach(function (t) {
        var li = crear("li");
        li.appendChild(crear("span", "", t.nombre));
        var barra = crear("span", "barra-top");
        var relleno = crear("span");
        relleno.style.width = Math.round((t.cantidad / max) * 100) + "%";
        barra.appendChild(relleno);
        li.appendChild(barra);
        li.appendChild(crear("strong", "", t.cantidad));
        top.appendChild(li);
      });
      if (!r.top.length) top.appendChild(crear("li", "vacio-a", "Aún no hay ventas esta semana."));

      var prox = $("proximosEventos");
      prox.textContent = "";
      r.proximos.forEach(function (e) {
        var li = crear("li");
        var info = crear("div");
        info.appendChild(crear("strong", "", e.tipo + " · " + e.invitados + " invitados"));
        info.appendChild(crear("p", "caja__ayuda", fechaBonita(e.fecha) + " " + e.hora + " · " + e.lugar));
        li.appendChild(info);
        li.appendChild(crear("strong", "", T.dinero(e.cotizacion.total)));
        prox.appendChild(li);
      });
      if (!r.proximos.length) prox.appendChild(crear("li", "vacio-a", "No hay eventos confirmados."));
    }).catch(error);
  }

  function dibujarGrafico(serie) {
    var canvas = $("grafico");
    var ctx = canvas.getContext("2d");
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var ancho = canvas.clientWidth || 720;
    var alto = canvas.clientHeight || 240;
    canvas.width = ancho * dpr;
    canvas.height = alto * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, ancho, alto);

    var estilos = getComputedStyle(document.body);
    var acento = estilos.getPropertyValue("--a-acento").trim() || "#E2472B";
    var texto = estilos.getPropertyValue("--a-suave").trim() || "#667";
    var reja = estilos.getPropertyValue("--a-linea").trim() || "#ddd";
    var tinta = estilos.getPropertyValue("--a-texto").trim() || "#13352A";

    var izq = 48, der = 8, arriba = 14, abajo = 28;
    var max = Math.max(1, Math.max.apply(null, serie.map(function (s) { return s.ventas; })));
    var paso = Math.pow(10, Math.floor(Math.log10(max)));
    var tope = Math.ceil(max / paso) * paso;
    var alturaUtil = alto - arriba - abajo;

    ctx.font = "12px 'Geist', sans-serif";
    ctx.textBaseline = "middle";
    for (var i = 0; i <= 4; i++) {
      var y = arriba + alturaUtil - (alturaUtil * i) / 4;
      ctx.strokeStyle = reja;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(izq, y);
      ctx.lineTo(ancho - der, y);
      ctx.stroke();
      ctx.fillStyle = texto;
      ctx.textAlign = "right";
      var v = (tope * i) / 4;
      ctx.fillText(v >= 1000 ? "$" + Math.round(v / 100) / 10 + "k" : "$" + Math.round(v), izq - 8, y);
    }

    var hueco = (ancho - izq - der) / serie.length;
    var barra = Math.min(34, hueco * 0.62);
    serie.forEach(function (s, k) {
      var h = (s.ventas / tope) * alturaUtil;
      var x = izq + hueco * k + (hueco - barra) / 2;
      var y = arriba + alturaUtil - h;
      ctx.fillStyle = k === serie.length - 1 ? acento : tinta;
      ctx.globalAlpha = k === serie.length - 1 ? 1 : 0.82;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, y, barra, Math.max(h, 1), [6, 6, 0, 0]);
      else ctx.rect(x, y, barra, Math.max(h, 1));
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = texto;
      ctx.textAlign = "center";
      if (hueco > 34 || k % 2 === 0) ctx.fillText(s.etiqueta, x + barra / 2, alto - abajo / 2);
    });
  }

  function cargarFila() {
    api("fila").then(function (r) {
      pintarEstadoHoy($("filaHoy"), r.hoy);
      $("recibirPedidos").checked = !!r.pedidos_activos;
      var cols = { recibido: $("colRecibido"), preparando: $("colPreparando"), listo: $("colListo") };
      var cuentas = { recibido: 0, preparando: 0, listo: 0 };
      Object.keys(cols).forEach(function (k) { cols[k].textContent = ""; });
      var entregados = 0, cancelados = 0;
      r.pedidos.forEach(function (p) {
        if (p.estado === "entregado") { entregados++; return; }
        if (p.estado === "cancelado") { cancelados++; return; }
        cuentas[p.estado]++;
        cols[p.estado].appendChild(comanda(p));
      });
      $("nRecibido").textContent = cuentas.recibido;
      $("nPreparando").textContent = cuentas.preparando;
      $("nListo").textContent = cuentas.listo;
      Object.keys(cols).forEach(function (k) {
        if (!cuentas[k]) cols[k].appendChild(crear("p", "vacio-a", "Nada por aquí."));
      });
      $("filaEntregados").textContent = T.plural(entregados, "pedido entregado", "pedidos entregados") + " hoy" + (cancelados ? " · " + T.plural(cancelados, "cancelado", "cancelados") : "") + ".";
      $("cFila").textContent = cuentas.recibido + cuentas.preparando;
      $("cFila").hidden = !(cuentas.recibido + cuentas.preparando);
    }).catch(error);
  }

  function comanda(p) {
    var art = crear("article", "comanda" + (p.atrasado ? " comanda--tarde" : ""));
    var cab = crear("div", "comanda__cab");
    cab.appendChild(crear("span", "comanda__num", "#" + String(p.numero).padStart(3, "0")));
    cab.appendChild(crear("span", "comanda__hora", p.recoger));
    art.appendChild(cab);
    art.appendChild(crear("p", "comanda__cliente", p.cliente.nombre + " · " + T.dinero(p.total) + (p.atrasado ? " · atrasado" : "")));
    var ul = crear("ul", "comanda__items");
    p.items.forEach(function (it) {
      var li = crear("li");
      li.appendChild(crear("strong", "", it.cantidad + "×"));
      li.appendChild(document.createTextNode(" " + it.nombre));
      ul.appendChild(li);
    });
    art.appendChild(ul);
    if (p.nota) art.appendChild(crear("p", "comanda__nota", p.nota));
    var acc = crear("div", "comanda__acciones");
    var sig = SIGUIENTE[p.estado];
    if (sig) {
      acc.appendChild(boton(sig[1], "boton-a--principal", function (ev) {
        ev.target.disabled = true;
        api("avanzar", { id: p.id, estado: sig[0] }).then(cargarFila).catch(function (e) { error(e); ev.target.disabled = false; });
      }));
    }
    acc.appendChild(boton("Cancelar", "boton-a--peligro", function () {
      confirmar("Cancelar el turno #" + p.numero, "Los ingredientes regresan al inventario. Avísale a " + p.cliente.nombre + " al " + p.cliente.telefono + ".", "Cancelar pedido").then(function (si) {
        if (si) api("avanzar", { id: p.id, estado: "cancelado" }).then(function () { aviso("Pedido cancelado"); cargarFila(); }).catch(error);
      });
    }));
    art.appendChild(acc);
    return art;
  }

  function iniciarFila() {
    $("recibirPedidos").addEventListener("change", function (ev) {
      var activo = ev.target.checked;
      api("guardar_config", { pedidos_activos: activo }).then(function (r) {
        estado.config = r.config;
        aviso(activo ? "Los pedidos en línea están abiertos" : "Pausaste los pedidos en línea");
        cargarFila();
      }).catch(function (e) {
        ev.target.checked = !activo;
        error(e);
      });
    });
  }

  function filtrosPedidos() {
    var f = $("filtroPedidos");
    return { desde: f.desde.value, hasta: f.hasta.value, estado: f.estado.value, buscar: f.buscar.value.trim() };
  }

  function cargarPedidos() {
    var f = $("filtroPedidos");
    if (!f.desde.value) {
      var d = new Date();
      f.hasta.value = T.fechaISO(d);
      d.setDate(d.getDate() - 6);
      f.desde.value = T.fechaISO(d);
    }
    api("pedidos", filtrosPedidos()).then(function (r) {
      $("pedidosTotal").textContent = T.plural(r.total, "pedido", "pedidos") + " · " + T.dinero(r.ventas) + " vendidos" + (r.total > 300 ? " · mostrando los 300 más recientes" : "");
      var tb = $("tablaPedidos");
      tb.textContent = "";
      r.pedidos.forEach(function (p) {
        var tr = crear("tr");
        tr.appendChild(crear("td", "", fechaHora(p.fecha)));
        tr.appendChild(crear("td", "", "#" + String(p.numero).padStart(3, "0") + " · " + p.recoger));
        var c = crear("td");
        c.appendChild(crear("span", "", p.cliente.nombre));
        c.appendChild(crear("small", "caja__ayuda", " " + p.cliente.telefono));
        tr.appendChild(c);
        tr.appendChild(crear("td", "", p.parada));
        tr.appendChild(crear("td", "usos", p.items.map(function (i) { return i.cantidad + "× " + i.nombre; }).join(", ")));
        tr.appendChild(crear("td", "num", T.dinero(p.total)));
        var e = crear("td");
        var info = ESTADOS[p.estado] || { texto: p.estado, chip: "" };
        e.appendChild(chip(info.texto, info.chip));
        if (p.atrasado) e.appendChild(chip("Atrasado", "error"));
        tr.appendChild(e);
        tb.appendChild(tr);
      });
      if (!r.pedidos.length) {
        var tr = crear("tr");
        var td = crear("td", "vacio-a", "No hay pedidos con esos filtros.");
        td.colSpan = 7;
        tr.appendChild(td);
        tb.appendChild(tr);
      }
    }).catch(error);
  }

  function iniciarPedidos() {
    var f = $("filtroPedidos");
    var espera = 0;
    f.addEventListener("input", function () {
      clearTimeout(espera);
      espera = setTimeout(cargarPedidos, 250);
    });
    f.addEventListener("submit", function (ev) { ev.preventDefault(); cargarPedidos(); });
    $("exportar").addEventListener("click", function () {
      var filtros = filtrosPedidos();
      api("exportar", filtros).then(function (r) {
        var blob = new Blob([r.csv], { type: "text/csv;charset=utf-8" });
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = "pedidos-" + (filtros.desde || "todos") + "-a-" + (filtros.hasta || "hoy") + ".csv";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
      }).catch(error);
    });
  }

  function cargarPlatos() {
    return api("platos").then(function (r) {
      estado.platos = r.platos;
      estado.categorias = r.categorias;
      estado.fotos = r.fotos;
      estado.ingredientes = r.ingredientes;
      var sel = $("filtroCategoria");
      if (sel.options.length === 1) {
        Object.keys(r.categorias).forEach(function (k) {
          var o = crear("option", "", r.categorias[k]);
          o.value = k;
          sel.appendChild(o);
        });
      }
      pintarPlatos();
    }).catch(error);
  }

  function pintarPlatos() {
    var cat = $("filtroCategoria").value;
    var q = $("buscarPlato").value.trim().toLowerCase();
    var tb = $("tablaPlatos");
    tb.textContent = "";
    estado.platos.filter(function (p) {
      return (!cat || p.categoria === cat) && (!q || p.nombre.toLowerCase().indexOf(q) !== -1);
    }).forEach(function (p) {
      var tr = crear("tr", p.activo ? "" : "fila-inactiva");
      var td = crear("td");
      var celda = crear("div", "celda-plato");
      var img = crear("img");
      img.src = T.rutaImagen(p.imagen) || "../img/sitio/tacos-letras.webp";
      img.alt = "";
      img.loading = "lazy";
      celda.appendChild(img);
      var nom = crear("div");
      nom.appendChild(crear("strong", "", p.nombre));
      var extras = [];
      if (!p.activo) extras.push("Oculto");
      if (p.favorito) extras.push("Favorito");
      if (p.vegetariano) extras.push("Veggie");
      nom.appendChild(crear("small", "", extras.join(" · ") || p.descripcion.slice(0, 48)));
      celda.appendChild(nom);
      td.appendChild(celda);
      tr.appendChild(td);
      tr.appendChild(crear("td", "", estado.categorias[p.categoria] || p.categoria));
      tr.appendChild(crear("td", "num", T.dinero(p.precio)));
      var por = crear("td", "num");
      if (p.porciones === null) por.appendChild(chip("Sin receta", ""));
      else if (p.porciones === 0) por.appendChild(chip("Agotado", "error"));
      else por.appendChild(chip(String(p.porciones), p.porciones <= 12 ? "alerta" : "ok"));
      tr.appendChild(por);
      var disp = crear("td");
      var sw = crear("label", "interruptor");
      var inp = crear("input");
      inp.type = "checkbox";
      inp.checked = !!p.disponible;
      inp.setAttribute("aria-label", "Disponible: " + p.nombre);
      inp.addEventListener("change", function () {
        api("disponible", { id: p.id, disponible: inp.checked }).then(function () {
          p.disponible = inp.checked;
          aviso(p.nombre + (inp.checked ? " disponible" : " marcado como agotado"));
        }).catch(function (e) { inp.checked = !inp.checked; error(e); });
      });
      sw.appendChild(inp);
      sw.appendChild(crear("span", "interruptor__pista"));
      disp.appendChild(sw);
      tr.appendChild(disp);
      var acc = crear("td");
      var caja = crear("div", "acciones-celda");
      caja.appendChild(boton("Editar", "", function () { abrirEditor(p); }));
      caja.appendChild(boton("Eliminar", "boton-a--peligro", function () {
        confirmar("Eliminar " + p.nombre, "Desaparece del menú y del historial de recetas. Los pedidos anteriores no cambian.", "Eliminar").then(function (si) {
          if (si) api("eliminar_plato", { id: p.id }).then(function () { aviso("Platillo eliminado"); cargarPlatos(); }).catch(error);
        });
      }));
      acc.appendChild(caja);
      tr.appendChild(acc);
      tb.appendChild(tr);
    });
    if (!tb.children.length) {
      var tr = crear("tr");
      var td = crear("td", "vacio-a", "No hay platillos con ese filtro.");
      td.colSpan = 6;
      tr.appendChild(td);
      tb.appendChild(tr);
    }
  }

  function filaReceta(ing, cant) {
    var fila = crear("div", "receta__fila");
    var sel = crear("select");
    sel.setAttribute("aria-label", "Ingrediente");
    estado.ingredientes.forEach(function (i) {
      var o = crear("option", "", i.nombre + " (" + i.unidad + ")");
      o.value = i.id;
      sel.appendChild(o);
    });
    if (ing) sel.value = ing;
    var num = crear("input");
    num.type = "number";
    num.min = "0";
    num.step = "any";
    num.value = cant || "";
    num.placeholder = "Cantidad";
    num.setAttribute("aria-label", "Cantidad por porción");
    var quitar = crear("button", "cerrar");
    quitar.type = "button";
    quitar.setAttribute("aria-label", "Quitar ingrediente");
    quitar.textContent = "×";
    quitar.addEventListener("click", function () { fila.remove(); });
    fila.appendChild(sel);
    fila.appendChild(num);
    fila.appendChild(quitar);
    return fila;
  }

  function abrirEditor(p) {
    var f = $("formPlato");
    f.reset();
    $("errorPlato").hidden = true;
    $("dlgPlatoTitulo").textContent = p ? "Editar " + p.nombre : "Nuevo platillo";
    var cat = $("platoCategoria");
    cat.textContent = "";
    Object.keys(estado.categorias).forEach(function (k) {
      var o = crear("option", "", estado.categorias[k]);
      o.value = k;
      cat.appendChild(o);
    });
    var fotos = $("platoFoto");
    fotos.textContent = "";
    var actual = p && p.imagen && estado.fotos.indexOf(p.imagen) === -1 ? p.imagen : "";
    if (actual) {
      var oa = crear("option", "", "Foto subida");
      oa.value = actual;
      fotos.appendChild(oa);
    }
    estado.fotos.forEach(function (ruta) {
      var o = crear("option", "", ruta.replace("img/menu/", "").replace(/\.\w+$/, "").replace(/-/g, " "));
      o.value = ruta;
      fotos.appendChild(o);
    });
    f.id.value = p ? p.id : "";
    f.nombre.value = p ? p.nombre : "";
    f.categoria.value = p ? p.categoria : "tacos";
    f.precio.value = p ? p.precio : "";
    f.picante.value = p ? p.picante : 0;
    f.descripcion.value = p ? p.descripcion : "";
    f.activo.checked = p ? !!p.activo : true;
    f.favorito.checked = p ? !!p.favorito : false;
    f.vegetariano.checked = p ? !!p.vegetariano : false;
    fotos.value = p && p.imagen ? p.imagen : estado.fotos[0] || "";
    $("platoVista").src = T.rutaImagen(fotos.value) || "../img/sitio/tacos-letras.webp";
    var receta = $("receta");
    receta.textContent = "";
    var r = p && p.receta ? p.receta : {};
    Object.keys(r).forEach(function (k) { receta.appendChild(filaReceta(k, r[k])); });
    if (!Object.keys(r).length) receta.appendChild(filaReceta("", ""));
    $("dlgPlato").showModal();
    f.nombre.focus();
  }

  function iniciarMenu() {
    $("nuevoPlato").addEventListener("click", function () {
      if (!estado.fotos.length) cargarPlatos().then(function () { abrirEditor(null); });
      else abrirEditor(null);
    });
    $("filtroCategoria").addEventListener("change", pintarPlatos);
    $("buscarPlato").addEventListener("input", pintarPlatos);
    $("agregarIngrediente").addEventListener("click", function () { $("receta").appendChild(filaReceta("", "")); });
    $("platoFoto").addEventListener("change", function (ev) {
      $("platoVista").src = T.rutaImagen(ev.target.value) || "../img/sitio/tacos-letras.webp";
    });
    $("formPlato").imagen.addEventListener("change", function (ev) {
      var archivo = ev.target.files[0];
      if (archivo) $("platoVista").src = URL.createObjectURL(archivo);
    });
    var dlg = $("dlgPlato");
    dlg.addEventListener("click", function (ev) {
      if (ev.target === dlg || ev.target.closest("[data-cerrar]")) dlg.close();
    });
    $("formPlato").addEventListener("submit", function (ev) {
      ev.preventDefault();
      var f = ev.target;
      var err = $("errorPlato");
      if (f.nombre.value.trim().length < 3 || !(parseFloat(f.precio.value) >= 5)) {
        err.textContent = "Escribe un nombre de al menos 3 letras y un precio desde $5.";
        err.hidden = false;
        return;
      }
      var receta = {};
      $("receta").querySelectorAll(".receta__fila").forEach(function (fila) {
        var id = fila.querySelector("select").value;
        var cant = parseFloat(fila.querySelector("input").value);
        if (id && cant > 0) receta[id] = cant;
      });
      var datos = new FormData();
      ["id", "nombre", "categoria", "precio", "picante", "descripcion", "foto"].forEach(function (n) { datos.append(n, f[n].value); });
      datos.append("activo", f.activo.checked ? "1" : "0");
      datos.append("favorito", f.favorito.checked ? "1" : "0");
      datos.append("vegetariano", f.vegetariano.checked ? "1" : "0");
      datos.append("receta", JSON.stringify(receta));
      if (f.imagen.files[0]) datos.append("imagen", f.imagen.files[0]);
      var b = $("guardarPlato");
      b.disabled = true;
      api("guardar_plato", datos).then(function () {
        dlg.close();
        aviso("Platillo guardado");
        cargarPlatos();
      }).catch(function (e) {
        err.textContent = e.message;
        err.hidden = false;
      }).then(function () { b.disabled = false; });
    });
  }

  function cargarInventario() {
    var sel = $("prepFecha");
    if (!sel.options.length) {
      for (var i = 0; i < 7; i++) {
        var d = new Date();
        d.setDate(d.getDate() + i);
        var o = crear("option", "", i === 0 ? "Hoy" : i === 1 ? "Mañana, " + T.DIAS[d.getDay()].toLowerCase() : T.DIAS[d.getDay()] + " " + T.fechaCorta(T.fechaISO(d)));
        o.value = T.fechaISO(d);
        sel.appendChild(o);
      }
      sel.selectedIndex = 1;
    }
    api("inventario", { fecha: sel.value }).then(function (r) {
      pintarPrep(r.prep);
      var tb = $("tablaInventario");
      tb.textContent = "";
      var bajos = 0;
      r.ingredientes.sort(function (a, b) {
        var ea = a.stock <= 0 ? 0 : a.stock <= a.minimo ? 1 : 2;
        var eb = b.stock <= 0 ? 0 : b.stock <= b.minimo ? 1 : 2;
        return ea - eb || a.nombre.localeCompare(b.nombre);
      }).forEach(function (ing) {
        if (ing.stock <= ing.minimo) bajos++;
        var tr = crear("tr");
        var nombre = crear("td");
        nombre.appendChild(crear("strong", "", ing.nombre));
        if (ing.stock <= 0) nombre.appendChild(document.createTextNode(" ")), nombre.appendChild(chip("Sin existencia", "error"));
        else if (ing.stock <= ing.minimo) nombre.appendChild(document.createTextNode(" ")), nombre.appendChild(chip("Bajo", "alerta"));
        tr.appendChild(nombre);
        tr.appendChild(celdaNumero(ing, "stock", ing.stock <= 0 ? "cero" : ing.stock <= ing.minimo ? "bajo" : ""));
        tr.appendChild(celdaNumero(ing, "minimo", ""));
        tr.appendChild(crear("td", "usos", ing.usado_en.length ? ing.usado_en.join(", ") : "Ninguna receta"));
        var acc = crear("td");
        var caja = crear("div", "acciones-celda");
        caja.appendChild(boton("Eliminar", "boton-a--peligro", function () {
          confirmar("Eliminar " + ing.nombre, "También se quitará de las recetas que lo usan.", "Eliminar").then(function (si) {
            if (si) api("eliminar_ingrediente", { id: ing.id }).then(function () { aviso("Ingrediente eliminado"); cargarInventario(); }).catch(error);
          });
        }));
        acc.appendChild(caja);
        tr.appendChild(acc);
        tb.appendChild(tr);
      });
      $("cInventario").textContent = bajos;
      $("cInventario").hidden = !bajos;
    }).catch(error);
  }

  function celdaNumero(ing, campo, clase) {
    var td = crear("td", "num");
    var inp = crear("input", "stock-input" + (clase ? " " + clase : ""));
    inp.type = "number";
    inp.min = "0";
    inp.step = "any";
    inp.value = ing[campo];
    inp.setAttribute("aria-label", (campo === "stock" ? "Existencia de " : "Mínimo de ") + ing.nombre + " en " + ing.unidad);
    var original = String(ing[campo]);
    function guardar() {
      if (inp.value === original || inp.value === "") return;
      var datos = { id: ing.id, modo: "fijar", valor: ing.stock };
      if (campo === "stock") datos.valor = parseFloat(inp.value);
      else datos.minimo = parseFloat(inp.value);
      api("stock", datos).then(function () {
        original = inp.value;
        aviso(ing.nombre + " actualizado");
        cargarInventario();
      }).catch(error);
    }
    inp.addEventListener("change", guardar);
    inp.addEventListener("keydown", function (ev) { if (ev.key === "Enter") inp.blur(); });
    td.appendChild(inp);
    td.appendChild(crear("span", "caja__ayuda", " " + ing.unidad));
    return td;
  }

  function pintarPrep(prep) {
    var caja = $("cajaPrep");
    caja.hidden = !prep;
    if (!prep) return;
    var faltantes = prep.lista.filter(function (x) { return x.faltan > 0; }).length;
    $("prepTexto").textContent = prep.muestras.length
      ? "Promedio de los últimos " + T.plural(prep.muestras.length, prep.dia.toLowerCase(), prep.dia.toLowerCase() + "s") + " + " + prep.margen + " % de margen. " + (faltantes ? T.plural(faltantes, "ingrediente necesita", "ingredientes necesitan") + " surtirse." : "Tienes todo lo necesario.")
      : "Todavía no hay historial de ventas para " + prep.dia.toLowerCase() + ".";
    $("surtirPrep").disabled = !faltantes;
    var tb = $("tablaPrep");
    tb.textContent = "";
    prep.lista.forEach(function (x) {
      var tr = crear("tr");
      tr.appendChild(crear("td", "", x.nombre));
      tr.appendChild(crear("td", "num", x.promedio.toLocaleString("es-MX") + " " + x.unidad));
      tr.appendChild(crear("td", "num", x.sugerido.toLocaleString("es-MX") + " " + x.unidad));
      tr.appendChild(crear("td", "num", x.stock.toLocaleString("es-MX") + " " + x.unidad));
      var f = crear("td", "num");
      f.appendChild(x.faltan > 0 ? chip("+" + x.faltan.toLocaleString("es-MX") + " " + x.unidad, "error") : chip("Completo", "ok"));
      tr.appendChild(f);
      tb.appendChild(tr);
    });
    if (!prep.lista.length) {
      var tr = crear("tr");
      var td = crear("td", "vacio-a", "Sin datos suficientes.");
      td.colSpan = 5;
      tr.appendChild(td);
      tb.appendChild(tr);
    }
  }

  function iniciarInventario() {
    $("prepFecha").addEventListener("change", cargarInventario);
    $("surtirPrep").addEventListener("click", function () {
      confirmar("Surtir lo que falta", "Las existencias de los ingredientes marcados se ajustan a la cantidad sugerida para ese día.", "Surtir").then(function (si) {
        if (!si) return;
        api("surtir_prep", { fecha: $("prepFecha").value }).then(function (r) {
          aviso(T.plural(r.surtidos, "ingrediente surtido", "ingredientes surtidos"));
          cargarInventario();
        }).catch(error);
      });
    });
    $("formIngrediente").addEventListener("submit", function (ev) {
      ev.preventDefault();
      var f = ev.target;
      api("nuevo_ingrediente", { nombre: f.nombre.value.trim(), unidad: f.unidad.value, stock: f.stock.value, minimo: f.minimo.value }).then(function () {
        aviso("Ingrediente agregado");
        f.reset();
        cargarInventario();
      }).catch(error);
    });
  }

  function cargarRuta() {
    api("ruta").then(function (r) {
      var caja = $("diasRuta");
      caja.textContent = "";
      var hoy = new Date().getDay();
      var orden = [1, 2, 3, 4, 5, 6, 0];
      orden.forEach(function (d) {
        var p = r.ruta.semana[d];
        var fila = crear("div", "dia-ruta" + (d === hoy ? " dia-ruta--hoy" : "") + (p.activo ? "" : " dia-ruta--apagado"));
        fila.dataset.dia = d;
        var nombre = crear("div", "dia-ruta__nombre", r.dias[d]);
        if (d === hoy) nombre.appendChild(crear("small", "", "Hoy"));
        fila.appendChild(nombre);
        var sw = crear("label", "interruptor");
        var chk = crear("input");
        chk.type = "checkbox";
        chk.name = "activo";
        chk.checked = !!p.activo;
        chk.setAttribute("aria-label", "Salimos el " + r.dias[d]);
        chk.addEventListener("change", function () { fila.classList.toggle("dia-ruta--apagado", !chk.checked); });
        sw.appendChild(chk);
        sw.appendChild(crear("span", "interruptor__pista"));
        fila.appendChild(sw);
        [["lugar", "Lugar", 60, ""], ["direccion", "Dirección", 120, "dia-ruta__dir"], ["inicio", "Llegada", 0, ""], ["fin", "Salida", 0, ""]].forEach(function (c) {
          var inp = crear("input", c[3]);
          inp.name = c[0];
          inp.type = c[2] ? "text" : "time";
          if (c[2]) inp.maxLength = c[2];
          inp.value = p.activo || c[2] ? p[c[0]] : p[c[0]] === "00:00" ? "" : p[c[0]];
          if (c[0] === "lugar" && !p.activo && p.lugar === "Día de descanso") inp.value = "";
          inp.placeholder = c[1];
          inp.setAttribute("aria-label", c[1] + " del " + r.dias[d]);
          fila.appendChild(inp);
        });
        caja.appendChild(fila);
      });

      var lista = $("listaExcepciones");
      lista.textContent = "";
      r.ruta.excepciones.forEach(function (x) {
        var li = crear("li");
        var info = crear("div");
        info.appendChild(crear("strong", "", fechaBonita(x.fecha)));
        info.appendChild(crear("p", "caja__ayuda", x.tipo === "cerrado" ? "No salimos" + (x.nota ? " · " + x.nota : "") : x.lugar + " · " + x.inicio + "–" + x.fin + (x.nota ? " · " + x.nota : "")));
        li.appendChild(info);
        li.appendChild(boton("Quitar", "boton-a--peligro", function () {
          api("quitar_excepcion", { fecha: x.fecha }).then(function () { aviso("Cambio eliminado"); cargarRuta(); }).catch(error);
        }));
        lista.appendChild(li);
      });
      if (!r.ruta.excepciones.length) lista.appendChild(crear("li", "vacio-a", "No hay cambios programados."));
    }).catch(error);
  }

  function iniciarRuta() {
    $("guardarRuta").addEventListener("click", function () {
      var semana = [];
      document.querySelectorAll(".dia-ruta").forEach(function (fila) {
        var q = function (n) { return fila.querySelector('[name="' + n + '"]'); };
        semana[Number(fila.dataset.dia)] = {
          activo: q("activo").checked,
          lugar: q("lugar").value.trim(),
          direccion: q("direccion").value.trim(),
          inicio: q("inicio").value || "00:00",
          fin: q("fin").value || "00:00"
        };
      });
      api("guardar_ruta", { semana: semana }).then(function () {
        aviso("Ruta guardada. Ya se ve en la página.");
        cargarRuta();
      }).catch(error);
    });
    var form = $("formExcepcion");
    function alternar() {
      var cambio = form.tipo.value === "cambio";
      form.querySelectorAll("[data-cambio]").forEach(function (el) { el.hidden = !cambio; });
    }
    form.tipo.addEventListener("change", alternar);
    alternar();
    form.fecha.min = T.fechaISO(new Date());
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var datos = {};
      ["fecha", "tipo", "nota", "lugar", "direccion", "inicio", "fin"].forEach(function (n) { datos[n] = form[n].value.trim(); });
      api("excepcion", datos).then(function () {
        aviso("Cambio programado");
        form.reset();
        alternar();
        cargarRuta();
      }).catch(error);
    });
  }

  function cargarEventos() {
    api("eventos").then(function (r) {
      estado.eventos = r.eventos;
      pintarEventos(r.hoy);
      var pend = r.eventos.filter(function (e) { return e.estado === "pendiente" && e.fecha >= r.hoy; }).length;
      $("cEventos").textContent = pend;
      $("cEventos").hidden = !pend;
    }).catch(error);
  }

  function pintarEventos(hoy) {
    hoy = hoy || T.fechaISO(new Date());
    var caja = $("listaEventos");
    caja.textContent = "";
    var etiquetas = { pendiente: ["Pendiente", "alerta"], confirmado: ["Confirmado", "ok"], rechazado: ["Rechazado", "error"] };
    var lista = estado.eventos.filter(function (e) { return !estado.filtroEvento || e.estado === estado.filtroEvento; });
    lista.forEach(function (e) {
      var pasado = e.fecha < hoy;
      var art = crear("article", "evento" + (e.conflicto && e.estado !== "rechazado" ? " evento--conflicto" : "") + (pasado ? " evento--pasado" : ""));
      var info = crear("div");
      var cab = crear("div", "evento__cab");
      cab.appendChild(crear("strong", "", e.folio + " · " + e.tipo));
      var et = etiquetas[e.estado];
      cab.appendChild(chip(et[0], et[1]));
      if (pasado) cab.appendChild(chip("Ya pasó", ""));
      if (e.conflicto && e.estado !== "rechazado") cab.appendChild(chip("Choca con otro evento confirmado", "error"));
      info.appendChild(cab);
      var datos = crear("div", "evento__datos");
      [fechaBonita(e.fecha) + " · " + e.hora + " (" + e.horas + " h)", e.invitados + " invitados · " + e.paquete_nombre, e.lugar + " · " + e.km + " km", e.cliente.nombre + " · " + e.cliente.telefono + " · " + e.cliente.correo].forEach(function (t) {
        datos.appendChild(crear("span", "", t));
      });
      info.appendChild(datos);
      if (e.notas) info.appendChild(crear("p", "evento__notas", "“" + e.notas + "”"));
      art.appendChild(info);

      var lado = crear("div", "evento__lado");
      var total = crear("p", "evento__total", T.dinero(e.cotizacion.total));
      total.appendChild(crear("small", "", "Anticipo " + T.dinero(e.cotizacion.anticipo) + " · ≈" + e.cotizacion.tacos + " tacos"));
      lado.appendChild(total);
      var acc = crear("div", "evento__acciones");
      var wa = crear("a", "boton-a boton-a--chico", "WhatsApp");
      wa.href = "https://wa.me/52" + e.cliente.telefono + "?text=" + encodeURIComponent(mensajeEvento(e));
      wa.target = "_blank";
      wa.rel = "noopener";
      acc.appendChild(wa);
      if (e.estado !== "confirmado" && !pasado) acc.appendChild(boton("Confirmar", "boton-a--principal", function () { cambiarEvento(e, "confirmado"); }));
      if (e.estado === "pendiente" && !pasado) acc.appendChild(boton("Rechazar", "boton-a--peligro", function () { cambiarEvento(e, "rechazado"); }));
      if (e.estado !== "pendiente" && !pasado) acc.appendChild(boton("Volver a pendiente", "", function () { cambiarEvento(e, "pendiente"); }));
      if (pasado || e.estado === "rechazado") {
        acc.appendChild(boton("Eliminar", "boton-a--peligro", function () {
          confirmar("Eliminar " + e.folio, "La solicitud se borra del historial.", "Eliminar").then(function (si) {
            if (si) api("eliminar_evento", { id: e.id }).then(function () { aviso("Solicitud eliminada"); cargarEventos(); }).catch(error);
          });
        }));
      }
      lado.appendChild(acc);
      art.appendChild(lado);
      caja.appendChild(art);
    });
    if (!lista.length) caja.appendChild(crear("p", "vacio-a", "No hay solicitudes con ese filtro."));
  }

  function mensajeEvento(e) {
    var base = "Hola " + e.cliente.nombre.split(" ")[0] + ", te escribimos de Trompo Rodante por tu solicitud " + e.folio + " para el " + fechaBonita(e.fecha) + ". ";
    if (e.estado === "confirmado") return base + "¡Tu fecha está confirmada! Total " + T.dinero(e.cotizacion.total) + ". Para apartar, el anticipo es de " + T.dinero(e.cotizacion.anticipo) + ".";
    if (e.estado === "rechazado") return base + "Lamentablemente no tenemos disponibilidad ese día. ¿Te interesa otra fecha?";
    return base + "La cotización es de " + T.dinero(e.cotizacion.total) + " para " + e.invitados + " invitados. ¿Seguimos con la reserva?";
  }

  function cambiarEvento(e, nuevo) {
    api("evento_estado", { id: e.id, estado: nuevo }).then(function () {
      aviso(nuevo === "confirmado" ? e.folio + " confirmado. La fecha quedó bloqueada." : nuevo === "rechazado" ? e.folio + " rechazado" : e.folio + " regresó a pendiente");
      cargarEventos();
    }).catch(error);
  }

  function iniciarEventos() {
    $("filtroEventos").addEventListener("click", function (ev) {
      var b = ev.target.closest("[data-filtro]");
      if (!b) return;
      estado.filtroEvento = b.dataset.filtro;
      $("filtroEventos").querySelectorAll("button").forEach(function (x) {
        x.setAttribute("aria-pressed", String(x === b));
        x.classList.toggle("boton-a--principal", x === b);
      });
      pintarEventos();
    });
    $("filtroEventos").querySelector("button").classList.add("boton-a--principal");
  }

  var DESCRIPCIONES = {
    agotado_auto: "Cada venta descuenta la receta. Si un ingrediente llega a cero, el platillo se marca «Se acabó» y no se puede pedir.",
    franjas_auto: "Cada franja de recogida acepta un número máximo de pedidos. Las llenas desaparecen solas.",
    promo_dia: "La promoción del día se muestra en la página y se descuenta al precio sin cupones.",
    aviso_retraso: "En la fila, los pedidos que pasaron su hora se marcan en rojo y aparecen en el resumen.",
    bloqueo_eventos: "Si confirmas un evento, ese día la ruta pública dice «Evento privado» y no se aceptan pedidos.",
    prep_sugerida: "Calcula cuánto llevar al camión con el promedio de las últimas cuatro semanas."
  };

  function cargarConfig() {
    api("config").then(function (r) {
      estado.config = r.config;
      var c = r.config;
      var lista = $("autoLista");
      lista.textContent = "";
      Object.keys(r.automatizaciones).forEach(function (k) {
        var item = crear("div", "auto-item");
        var txt = crear("div");
        txt.appendChild(crear("strong", "", r.automatizaciones[k]));
        txt.appendChild(crear("p", "", DESCRIPCIONES[k] || ""));
        item.appendChild(txt);
        var sw = crear("label", "interruptor");
        var inp = crear("input");
        inp.type = "checkbox";
        inp.checked = !!c.auto[k];
        inp.setAttribute("aria-label", r.automatizaciones[k]);
        inp.addEventListener("change", function () {
          var auto = {};
          auto[k] = inp.checked;
          api("guardar_config", { auto: auto }).then(function (x) {
            estado.config = x.config;
            aviso(inp.checked ? "Regla activada" : "Regla desactivada");
          }).catch(function (e) { inp.checked = !inp.checked; error(e); });
        });
        sw.appendChild(inp);
        sw.appendChild(crear("span", "interruptor__pista"));
        item.appendChild(sw);
        lista.appendChild(item);
      });

      var fa = $("formAviso");
      fa.activo.checked = !!c.aviso.activo;
      fa.texto.value = c.aviso.texto || "";

      var fp = $("formPedidos");
      ["capacidad_franja", "minutos_franja", "anticipacion_min", "prep_base", "min_por_pedido", "taqueros", "max_piezas", "umbral_pocos", "margen_prep"].forEach(function (n) { fp[n].value = c[n]; });

      estado.platosPromo = r.platos;
      estado.dias = r.dias;
      var lp = $("listaPromos");
      lp.textContent = "";
      c.promos.forEach(function (p) { lp.appendChild(filaPromo(p)); });

      var fe = $("formEventos");
      ["minimo", "maximo", "horas_base", "hora_extra", "km_incluidos", "costo_km", "anticipo_pct", "anticipacion_dias"].forEach(function (n) { fe[n].value = c.eventos[n]; });
      var precios = $("preciosPaquetes");
      precios.textContent = "";
      c.eventos.paquetes.forEach(function (p) {
        var l = crear("label", "campo");
        l.appendChild(crear("span", "", p.nombre + " (por persona)"));
        var inp = crear("input");
        inp.type = "number";
        inp.min = "50";
        inp.name = "precio_" + p.id;
        inp.dataset.paquete = p.id;
        inp.value = p.precio;
        l.appendChild(inp);
        precios.appendChild(l);
      });
    }).catch(error);
  }

  function filaPromo(p) {
    var fila = crear("div", "promo-fila");
    function campo(etiqueta, el) {
      var l = crear("label", "campo");
      l.appendChild(crear("span", "", etiqueta));
      l.appendChild(el);
      fila.appendChild(l);
      return el;
    }
    var dia = crear("select");
    dia.name = "dia";
    estado.dias.forEach(function (d, i) {
      var o = crear("option", "", d);
      o.value = i;
      dia.appendChild(o);
    });
    dia.value = p ? p.dia : 1;
    campo("Día", dia);
    var titulo = crear("input");
    titulo.name = "titulo";
    titulo.maxLength = 40;
    titulo.value = p ? p.titulo : "";
    campo("Título", titulo);
    var plato = crear("select");
    plato.name = "plato";
    estado.platosPromo.forEach(function (x) {
      var o = crear("option", "", x.nombre);
      o.value = x.id;
      plato.appendChild(o);
    });
    if (p) plato.value = p.plato;
    campo("Platillo", plato);
    var tipo = crear("select");
    tipo.name = "tipo";
    [["2x1", "2×1"], ["pct", "% de descuento"]].forEach(function (t) {
      var o = crear("option", "", t[1]);
      o.value = t[0];
      tipo.appendChild(o);
    });
    tipo.value = p ? p.tipo : "2x1";
    campo("Tipo", tipo);
    var valor = crear("input");
    valor.name = "valor";
    valor.type = "number";
    valor.min = "0";
    valor.max = "90";
    valor.value = p ? p.valor : 0;
    campo("%", valor);
    var texto = crear("input");
    texto.name = "texto";
    texto.maxLength = 120;
    texto.value = p ? p.texto : "";
    texto.placeholder = "Texto que ven los clientes";
    var l = campo("Descripción", texto);
    l.parentNode.classList.add("campo--ancho");
    fila.appendChild(boton("Quitar", "boton-a--peligro", function () { fila.remove(); }));
    function alternar() { valor.disabled = tipo.value !== "pct"; }
    tipo.addEventListener("change", alternar);
    alternar();
    return fila;
  }

  function iniciarAutomatizaciones() {
    $("formAviso").addEventListener("submit", function (ev) {
      ev.preventDefault();
      var f = ev.target;
      api("guardar_config", { aviso: { activo: f.activo.checked, texto: f.texto.value.trim() } }).then(function () {
        aviso(f.activo.checked && f.texto.value.trim() ? "Aviso publicado en la página" : "Aviso guardado");
      }).catch(error);
    });
    $("formPedidos").addEventListener("submit", function (ev) {
      ev.preventDefault();
      var f = ev.target;
      var datos = {};
      Array.prototype.forEach.call(f.elements, function (el) { if (el.name) datos[el.name] = el.value; });
      api("guardar_config", datos).then(function () { aviso("Ajustes guardados"); cargarConfig(); }).catch(error);
    });
    $("agregarPromo").addEventListener("click", function () {
      if (estado.dias) $("listaPromos").appendChild(filaPromo(null));
    });
    $("formPromos").addEventListener("submit", function (ev) {
      ev.preventDefault();
      var promos = [];
      var dias = {};
      var repetido = false;
      $("listaPromos").querySelectorAll(".promo-fila").forEach(function (fila) {
        var q = function (n) { return fila.querySelector('[name="' + n + '"]').value; };
        if (dias[q("dia")]) repetido = true;
        dias[q("dia")] = 1;
        promos.push({ dia: Number(q("dia")), titulo: q("titulo"), texto: q("texto"), plato: q("plato"), tipo: q("tipo"), valor: Number(q("valor")) });
      });
      if (repetido) {
        aviso("Solo puede haber una promoción por día.");
        return;
      }
      api("guardar_config", { promos: promos }).then(function () { aviso("Promociones guardadas"); cargarConfig(); }).catch(error);
    });
    $("formEventos").addEventListener("submit", function (ev) {
      ev.preventDefault();
      var f = ev.target;
      var datos = { precios: {} };
      ["minimo", "maximo", "horas_base", "hora_extra", "km_incluidos", "costo_km", "anticipo_pct", "anticipacion_dias"].forEach(function (n) { datos[n] = f[n].value; });
      f.querySelectorAll("[data-paquete]").forEach(function (inp) { datos.precios[inp.dataset.paquete] = inp.value; });
      api("guardar_config", { eventos: datos }).then(function () { aviso("Cotizador actualizado"); cargarConfig(); }).catch(error);
    });
  }

  function iniciarDialogos() {
    var c = $("dlgConfirmar");
    c.addEventListener("click", function (ev) {
      if (ev.target === c) c.close("no");
    });
  }

  function iniciar() {
    iniciarTema();
    iniciarDialogos();
    iniciarNavegacion();
    iniciarFila();
    iniciarPedidos();
    iniciarMenu();
    iniciarInventario();
    iniciarRuta();
    iniciarEventos();
    iniciarAutomatizaciones();
    iniciarAcceso();
    var espera = 0;
    window.addEventListener("resize", function () {
      clearTimeout(espera);
      espera = setTimeout(function () {
        if (estado.ultimaSerie && estado.vista === "resumen") dibujarGrafico(estado.ultimaSerie);
      }, 150);
    });
  }

  iniciar();
})();
