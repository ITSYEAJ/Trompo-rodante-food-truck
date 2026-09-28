(function () {
  "use strict";

  var T = window.Trompo;
  var API = "../api/";
  var CLAVE_BOLSA = "trompo_bolsa";
  var CLAVE_TURNO = "trompo_turno";
  var reducirMovimiento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var estado = {
    datos: null,
    servidor: false,
    cargadoEn: Date.now(),
    categoria: "todos",
    busqueda: "",
    completo: false,
    vistaId: "",
    bolsa: {},
    franja: "",
    token: "",
    turnoTimer: 0,
    enviando: false
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

  function icono(ruta, vista) {
    var ns = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", vista || "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    ruta.split("|").forEach(function (d) {
      var p = document.createElementNS(ns, "path");
      p.setAttribute("d", d);
      svg.appendChild(p);
    });
    return svg;
  }

  var ICONOS = {
    mas: "M12 5v14M5 12h14",
    menos: "M5 12h14",
    mapa: "M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11Z|M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"
  };

  function leerLocal(clave) {
    try {
      return JSON.parse(localStorage.getItem(clave) || "null");
    } catch (e) {
      return null;
    }
  }

  function guardarLocal(clave, valor) {
    try {
      if (valor === null) localStorage.removeItem(clave);
      else localStorage.setItem(clave, JSON.stringify(valor));
    } catch (e) {}
  }

  var avisoTimer = 0;
  function aviso(texto) {
    var el = $("aviso");
    el.textContent = texto;
    el.classList.add("aviso--visible");
    clearTimeout(avisoTimer);
    avisoTimer = setTimeout(function () {
      el.classList.remove("aviso--visible");
    }, 3500);
  }

  function pedirToken() {
    return fetch(API + "token.php", { credentials: "same-origin" })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        estado.token = d.token || "";
        return estado.token;
      });
  }

  function enviar(archivo, datos, reintento) {
    var listo = estado.token ? Promise.resolve(estado.token) : pedirToken();
    return listo.then(function (token) {
      return fetch(API + archivo, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": token },
        body: JSON.stringify(datos)
      });
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (cuerpo) {
        if (r.status === 403 && !reintento) {
          estado.token = "";
          return enviar(archivo, datos, true);
        }
        if (!r.ok || cuerpo.ok === false) {
          var error = new Error(cuerpo.mensaje || "No pudimos conectar. Intenta de nuevo.");
          error.estado = r.status;
          error.errores = cuerpo.errores || {};
          throw error;
        }
        return cuerpo;
      });
    });
  }

  function minutosAhora() {
    var d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  }

  function datosLocales() {
    var hoy = new Date();
    var semana = [];
    for (var i = 0; i < 7; i++) {
      var d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + i);
      var base = T.RUTA_LOCAL[d.getDay()];
      semana.push({
        fecha: T.fechaISO(d),
        dia: d.getDay(),
        nombre_dia: T.DIAS[d.getDay()],
        activo: base.activo,
        lugar: base.lugar,
        direccion: base.direccion,
        inicio: base.inicio,
        fin: base.fin,
        nota: "",
        tipo: base.activo ? "ruta" : "descanso"
      });
    }
    var parada = semana[0];
    var min = minutosAhora();
    var est = !parada.activo ? "descanso" : min < T.aMinutos(parada.inicio) ? "pronto" : min < T.aMinutos(parada.fin) ? "abierto" : "termino";
    var proxima = null;
    semana.forEach(function (p, i) {
      if (proxima || !p.activo || (i === 0 && (est === "pronto" || est === "abierto" || min >= T.aMinutos(p.inicio)))) return;
      proxima = Object.assign({}, p, { faltan_min: i * 1440 + T.aMinutos(p.inicio) - min });
    });
    var promo = null;
    T.PROMOS_LOCAL.forEach(function (x) { if (x.dia === hoy.getDay()) promo = x; });
    return {
      hoy: { estado: est, parada: parada, proxima: proxima, espera_min: null, turno_actual: null, acepta_pedidos: false, franjas: [], promo: promo, aviso: null },
      semana: semana,
      categorias: T.CATEGORIAS,
      menu: T.MENU_LOCAL.map(function (p) {
        return Object.assign({}, p, { agotado: false, quedan: null, promo: promo && promo.plato === p.id ? "Promo hoy" : null });
      }),
      top: ["taco-pastor", "taco-asada", "taco-birria", "gringa"],
      promos: T.PROMOS_LOCAL,
      eventos: T.EVENTOS_LOCAL,
      ocupadas: []
    };
  }

  function cargar(silencioso) {
    return fetch(API + "sitio.php", { credentials: "same-origin", cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error("sin servidor");
        return r.json();
      })
      .then(function (d) {
        if (!d.ok) throw new Error("sin datos");
        estado.servidor = true;
        return d;
      })
      .catch(function () {
        estado.servidor = false;
        return datosLocales();
      })
      .then(function (d) {
        estado.datos = d;
        estado.cargadoEn = Date.now();
        limpiarBolsa();
        pintarTodo(silencioso);
      });
  }

  function pintarTodo(silencioso) {
    pintarAvisoGeneral();
    pintarHoy();
    pintarPromoHoy();
    pintarPantalla();
    pintarSemana();
    pintarProxima();
    pintarPie();
    if (!silencioso) {
      pintarFiltros();
      prepararCotizador();
    }
    pintarPlatos(silencioso);
    pintarBolsa();
  }

  function pintarAvisoGeneral() {
    var d = estado.datos;
    var el = $("avisoGeneral");
    var texto = d.hoy.aviso || (d.hoy.parada.nota && !d.hoy.parada.activo ? d.hoy.parada.nota : "");
    el.textContent = texto;
    el.hidden = !texto;
  }

  function horario(p) {
    return p.inicio + "–" + p.fin;
  }

  function enlaceMapa(p) {
    return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(p.lugar + ", " + p.direccion);
  }

  function textoEstado(h) {
    var p = h.parada;
    var min = minutosAhora();
    switch (h.estado) {
      case "abierto":
        return { clase: "abierto", texto: "Sirviendo · cierra " + p.fin };
      case "pronto":
        return { clase: "pronto", texto: "Abre en " + T.duracion(T.aMinutos(p.inicio) - min) };
      case "termino":
        return { clase: "cerrado", texto: "Terminamos por hoy" };
      case "evento":
        return { clase: "cerrado", texto: "Evento privado" };
      case "cerrado":
        return { clase: "cerrado", texto: "Hoy no salimos" };
      default:
        return { clase: "cerrado", texto: "Día de descanso" };
    }
  }

  function pintarHoy() {
    var h = estado.datos.hoy;
    var p = h.parada;
    var visible = p.activo && h.estado !== "termino" ? p : h.proxima || p;
    var est = textoEstado(h);
    var mostrarProxima = visible !== p;

    $("hoyDia").textContent = mostrarProxima ? "Próxima parada · " + visible.nombre_dia : "Hoy · " + p.nombre_dia;
    var chip = $("hoyEstado");
    chip.textContent = est.texto;
    chip.className = "letrero__estado letrero__estado--" + est.clase;
    $("hoyLugar").textContent = visible.lugar;
    $("hoyDireccion").textContent = visible.direccion || (p.nota || "");
    $("hoyHorario").textContent = visible.activo ? horario(visible) : "—";
    $("hoyEspera").textContent = h.estado === "abierto" && h.espera_min ? "~" + h.espera_min + " min" : mostrarProxima ? "En " + T.duracion(visible.faltan_min - minutosTranscurridos()) : h.estado === "pronto" ? "En " + T.duracion(T.aMinutos(p.inicio) - minutosAhora()) : "—";
    $("hoyTurno").textContent = h.estado === "abierto" && h.turno_actual ? "#" + String(h.turno_actual).padStart(3, "0") : "—";
    var dt = $("hoyEspera").parentNode.querySelector("dt");
    dt.textContent = h.estado === "abierto" ? "Espera" : "Llegamos";
    var mapa = $("hoyMapa");
    if (visible.activo && visible.direccion) {
      mapa.href = enlaceMapa(visible);
      mapa.hidden = false;
    } else {
      mapa.hidden = true;
    }
  }

  function minutosTranscurridos() {
    return Math.floor((Date.now() - estado.cargadoEn) / 60000);
  }

  function pintarSemana() {
    var lista = $("semana");
    lista.textContent = "";
    estado.datos.semana.forEach(function (p, i) {
      var li = crear("li", "parada" + (i === 0 ? " parada--hoy" : "") + (!p.activo ? " parada--libre" : ""));
      var dia = crear("div", "parada__dia");
      dia.appendChild(crear("strong", "", i === 0 ? "Hoy" : i === 1 ? "Mañana" : p.nombre_dia.slice(0, 3)));
      dia.appendChild(crear("span", "", T.fechaCorta(p.fecha)));
      li.appendChild(dia);

      var info = crear("div");
      info.appendChild(crear("p", "parada__lugar", p.activo ? p.lugar : p.tipo === "evento" ? "Evento privado" : p.tipo === "cerrado" ? "Sin servicio" : "Día de descanso"));
      info.appendChild(crear("p", "parada__detalle", p.activo ? horario(p) + " · " + p.direccion : p.nota || "Nos vemos al día siguiente."));
      li.appendChild(info);

      if (p.activo) {
        var a = crear("a", "parada__mapa");
        a.href = enlaceMapa(p);
        a.target = "_blank";
        a.rel = "noopener";
        a.setAttribute("aria-label", "Cómo llegar a " + p.lugar);
        a.appendChild(icono(ICONOS.mapa));
        li.appendChild(a);
      } else {
        li.appendChild(crear("span", "parada__marca", p.tipo === "evento" ? "Privado" : p.tipo === "cerrado" ? "Cerrado" : "Descanso"));
      }
      var pr = promoDe(p.dia);
      if (pr && p.activo) info.appendChild(crear("span", "parada__promo", pr.titulo));
      if (p.tipo === "cambio") {
        info.appendChild(crear("p", "parada__detalle", "Cambio de lugar: " + (p.nota || "solo este día")));
      }
      lista.appendChild(li);
    });
  }

  function pintarProxima() {
    var h = estado.datos.hoy;
    var p = h.parada;
    var etiqueta = $("proximaEtiqueta");
    if (h.estado === "abierto") {
      etiqueta.textContent = "Estamos ahora en";
      $("proximaLugar").textContent = p.lugar;
      var resta = T.aMinutos(p.fin) - minutosAhora();
      $("proximaCuando").textContent = "Cerramos en " + T.duracion(resta) + " · " + p.direccion;
    } else if (h.estado === "pronto") {
      etiqueta.textContent = "Hoy llegamos a";
      $("proximaLugar").textContent = p.lugar;
      $("proximaCuando").textContent = "Abrimos en " + T.duracion(T.aMinutos(p.inicio) - minutosAhora()) + " · " + horario(p);
    } else if (h.proxima) {
      etiqueta.textContent = "Próxima parada";
      $("proximaLugar").textContent = h.proxima.lugar;
      $("proximaCuando").textContent = h.proxima.nombre_dia + " " + horario(h.proxima) + " · en " + T.duracion(h.proxima.faltan_min - minutosTranscurridos());
    } else {
      etiqueta.textContent = "Próxima parada";
      $("proximaLugar").textContent = "Por confirmar";
      $("proximaCuando").textContent = "Síguenos en redes para enterarte.";
    }
  }

  function pintarPie() {
    var h = estado.datos.hoy;
    $("pieHoy").textContent = h.parada.activo ? h.parada.lugar + " (" + horario(h.parada) + ")" : "sin servicio al público";
    var lista = $("pieHorario");
    lista.textContent = "";
    var orden = [1, 2, 3, 4, 5, 6, 0];
    var base = {};
    estado.datos.semana.forEach(function (p) { base[p.dia] = p; });
    orden.forEach(function (d) {
      var p = base[d];
      if (!p) return;
      var li = crear("li", d === h.parada.dia ? "hoy-pie" : "");
      li.appendChild(crear("span", "", T.DIAS[d].slice(0, 3)));
      li.appendChild(crear("span", "", p.activo ? horario(p) : p.tipo === "evento" ? "Privado" : "Descanso"));
      lista.appendChild(li);
    });
  }

  function promoDe(dia) {
    var r = null;
    (estado.datos.promos || []).forEach(function (x) {
      if (x.dia === dia) r = x;
    });
    return r;
  }

  function pintarPromoHoy() {
    var el = $("promoHoy");
    var p = promoDe(estado.datos.hoy.parada.dia);
    el.textContent = "";
    el.hidden = !p;
    if (!p) return;
    el.appendChild(crear("strong", "", "Hoy"));
    el.appendChild(document.createTextNode(p.titulo + ": " + p.texto));
  }

  function pintarPantalla() {
    var h = estado.datos.hoy;
    var num = $("pantallaTurno");
    var nuevo = h.estado === "abierto" && h.turno_actual ? String(h.turno_actual).padStart(3, "0") : "---";
    if (num.textContent !== nuevo && num.textContent !== "---" && !reducirMovimiento) {
      num.classList.remove("cambio");
      void num.offsetWidth;
      num.classList.add("cambio");
    }
    num.textContent = nuevo;
    $("pantallaLugar").textContent = h.parada.activo ? h.parada.lugar : "Sin servicio hoy";
    $("pantallaEspera").textContent = h.estado === "abierto" && h.espera_min ? "Espera ~" + h.espera_min + " min" : h.estado === "pronto" ? "Abrimos " + h.parada.inicio : "Cerrado";
  }

  function platoPorId(id) {
    var r = null;
    estado.datos.menu.forEach(function (p) { if (p.id === id) r = p; });
    return r;
  }

  function imagenPlato(p, clase) {
    var img = crear("img", clase || "");
    var ruta = T.rutaImagen(p.imagen);
    img.src = ruta || "../img/sitio/tacos-letras.webp";
    img.alt = p.nombre;
    img.loading = "lazy";
    img.decoding = "async";
    img.width = 800;
    img.height = 600;
    return img;
  }

  function pintarFiltros() {
    var caja = $("filtros");
    caja.textContent = "";
    var conteo = { todos: estado.datos.menu.length };
    estado.datos.menu.forEach(function (p) { conteo[p.categoria] = (conteo[p.categoria] || 0) + 1; });
    var claves = ["todos"].concat(Object.keys(estado.datos.categorias));
    claves.forEach(function (c) {
      if (!conteo[c]) return;
      var b = crear("button", "filtro");
      b.type = "button";
      b.dataset.categoria = c;
      b.setAttribute("aria-pressed", String(c === estado.categoria));
      b.appendChild(document.createTextNode(c === "todos" ? "Todo" : estado.datos.categorias[c]));
      b.appendChild(crear("small", "", conteo[c]));
      caja.appendChild(b);
    });
  }

  function normalizar(t) {
    return String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  }

  function platosFiltrados() {
    var q = normalizar(estado.busqueda);
    return estado.datos.menu.filter(function (p) {
      if (estado.categoria !== "todos" && p.categoria !== estado.categoria) return false;
      if (!q) return true;
      var texto = normalizar(p.nombre + " " + p.descripcion + " " + (p.vegetariano ? "vegetariano vegano veggie" : "") + " " + (estado.datos.categorias[p.categoria] || ""));
      return q.split(/\s+/).every(function (w) { return texto.indexOf(w) !== -1; });
    });
  }

  function pintarEsqueletos() {
    var caja = $("platos");
    caja.textContent = "";
    for (var i = 0; i < 6; i++) caja.appendChild(crear("div", "esqueleto"));
  }

  function pintarPlatos(silencioso) {
    var caja = $("platos");
    var lista = platosFiltrados();
    var filtrando = estado.categoria !== "todos" || !!estado.busqueda;
    var grupos = {};
    lista.forEach(function (p) {
      (grupos[p.categoria] = grupos[p.categoria] || []).push(p);
    });
    var presentes = Object.keys(estado.datos.categorias).filter(function (c) { return grupos[c]; });
    var visibles = filtrando || estado.completo ? presentes : presentes.slice(0, 2);
    caja.textContent = "";
    var n = 0;
    visibles.forEach(function (c) {
      var sec = crear("section", "grupo-carta");
      var h = crear("h3", "grupo-carta__titulo", estado.datos.categorias[c]);
      h.appendChild(crear("small", "", c === "tacos" ? "por pieza, tortilla hecha a mano" : T.plural(grupos[c].length, "opción", "opciones")));
      sec.appendChild(h);
      var ul = crear("ul", "renglones");
      grupos[c].forEach(function (p) {
        var li = crearRenglon(p);
        if (!silencioso) {
          li.classList.add("entra");
          li.style.animationDelay = Math.min(n++, 12) * 30 + "ms";
        }
        ul.appendChild(li);
      });
      sec.appendChild(ul);
      caja.appendChild(sec);
    });
    $("menuVacio").hidden = lista.length > 0;
    var ocultos = presentes.slice(visibles.length);
    var cuantos = ocultos.reduce(function (a, c) { return a + grupos[c].length; }, 0);
    $("verMasCaja").hidden = !ocultos.length;
    $("verMasCuenta").textContent = ocultos.length ? "Faltan " + ocultos.map(function (c) { return estado.datos.categorias[c].toLowerCase(); }).join(" y ") + " · " + T.plural(cuantos, "platillo", "platillos") : "";
    var actual = estado.vistaId && lista.filter(function (p) { return p.id === estado.vistaId; })[0];
    if (actual) marcarActivo(actual.id);
    else mostrarVista(lista[0]);
  }

  function crearRenglon(p) {
    var li = crear("li", "renglon" + (p.agotado ? " renglon--agotado" : ""));
    li.dataset.plato = p.id;
    var img = imagenPlato(p, "renglon__foto");
    img.width = 56;
    img.height = 56;
    img.alt = "";
    li.appendChild(img);
    var info = crear("div");
    var linea = crear("div", "renglon__linea");
    linea.appendChild(crear("h4", "renglon__nombre", p.nombre));
    linea.appendChild(crear("span", "renglon__puntos"));
    linea.appendChild(crear("span", "renglon__precio", T.dinero(p.precio)));
    info.appendChild(linea);
    info.appendChild(crear("p", "renglon__desc", p.descripcion));
    var marcas = crear("div", "renglon__marcas");
    if (estado.datos.top.indexOf(p.id) !== -1) marcas.appendChild(crear("span", "insignia insignia--top", "Más pedido"));
    if (p.promo) marcas.appendChild(crear("span", "insignia insignia--promo", p.promo));
    if (p.agotado) marcas.appendChild(crear("span", "insignia", "Se acabó por hoy"));
    else if (p.quedan) marcas.appendChild(crear("span", "insignia insignia--pocos", "Quedan " + p.quedan));
    if (p.vegetariano) marcas.appendChild(crear("span", "insignia insignia--veg", "Veggie"));
    if (p.picante > 0) marcas.appendChild(crear("span", "insignia insignia--pica", ["", "Pica poquito", "Pica", "Pica en serio"][p.picante] || "Pica"));
    if (marcas.children.length) info.appendChild(marcas);
    li.appendChild(info);
    var ctrl = crear("div", "renglon__control");
    ctrl.appendChild(controlCantidad(p));
    li.appendChild(ctrl);
    return li;
  }

  function marcarActivo(id) {
    document.querySelectorAll(".renglon.activo").forEach(function (r) { r.classList.remove("activo"); });
    var fila = document.querySelector('.renglon[data-plato="' + id + '"]');
    if (fila) fila.classList.add("activo");
  }

  var vistaTimer = 0;
  function mostrarVista(p) {
    if (!p || estado.vistaId === p.id) return;
    estado.vistaId = p.id;
    marcarActivo(p.id);
    var img = $("vistaFoto");
    clearTimeout(vistaTimer);
    img.classList.add("cambiando");
    vistaTimer = setTimeout(function () {
      img.src = T.rutaImagen(p.imagen) || "../img/sitio/tacos-letras.webp";
      $("vistaNombre").textContent = p.nombre;
      $("vistaDesc").textContent = p.descripcion;
      $("vistaPrecio").textContent = T.dinero(p.precio);
      var listo = function () { img.classList.remove("cambiando"); };
      if (img.decode) img.decode().then(listo, listo);
      else listo();
    }, reducirMovimiento ? 0 : 140);
  }

  function controlCantidad(p) {
    var cant = estado.bolsa[p.id] || 0;
    if (!cant) {
      var b = crear("button", "agregar");
      b.type = "button";
      b.dataset.accion = "agregar";
      b.dataset.id = p.id;
      b.disabled = !!p.agotado;
      b.setAttribute("aria-label", p.agotado ? p.nombre + " agotado" : "Agregar " + p.nombre);
      b.appendChild(icono(ICONOS.mas));
      return b;
    }
    var c = crear("div", "contador");
    var menos = crear("button");
    menos.type = "button";
    menos.dataset.accion = "restar";
    menos.dataset.id = p.id;
    menos.setAttribute("aria-label", "Quitar uno de " + p.nombre);
    menos.appendChild(icono(ICONOS.menos));
    var valor = crear("output", "", cant);
    valor.setAttribute("aria-live", "polite");
    var mas = crear("button");
    mas.type = "button";
    mas.dataset.accion = "agregar";
    mas.dataset.id = p.id;
    mas.disabled = !!p.agotado || cant >= 30;
    mas.setAttribute("aria-label", "Agregar otro " + p.nombre);
    mas.appendChild(icono(ICONOS.mas));
    c.appendChild(menos);
    c.appendChild(valor);
    c.appendChild(mas);
    return c;
  }

  function refrescarControles(id) {
    var p = platoPorId(id);
    if (!p) return;
    document.querySelectorAll('.renglon[data-plato="' + id + '"] .renglon__control').forEach(function (c) {
      var tenia = c.contains(document.activeElement);
      var accion = tenia ? document.activeElement.dataset.accion : "";
      c.textContent = "";
      c.appendChild(controlCantidad(p));
      if (tenia) {
        var foco = c.querySelector('[data-accion="' + accion + '"]') || c.querySelector("button");
        if (foco) foco.focus({ preventScroll: true });
      }
    });
  }

  function cambiarCantidad(id, delta) {
    var p = platoPorId(id);
    if (!p || (delta > 0 && p.agotado)) return;
    var actual = estado.bolsa[id] || 0;
    var nuevo = Math.max(0, Math.min(30, actual + delta));
    if (nuevo === 0) delete estado.bolsa[id];
    else estado.bolsa[id] = nuevo;
    guardarLocal(CLAVE_BOLSA, estado.bolsa);
    refrescarControles(id);
    pintarBolsa();
    if (delta > 0 && actual === 0) {
      aviso(p.nombre + " agregado a tu pedido");
      var num = $("bolsaNum");
      num.classList.remove("salto");
      void num.offsetWidth;
      num.classList.add("salto");
    }
  }

  function limpiarBolsa() {
    var cambio = false;
    Object.keys(estado.bolsa).forEach(function (id) {
      var p = platoPorId(id);
      if (!p || p.agotado) {
        delete estado.bolsa[id];
        cambio = true;
      }
    });
    if (cambio) guardarLocal(CLAVE_BOLSA, estado.bolsa);
  }

  function lineaPrecio(p, cantidad) {
    var bruto = p.precio * cantidad;
    var promo = estado.datos.hoy.promo;
    var descuento = 0;
    if (estado.servidor && promo && promo.plato === p.id) {
      if (promo.tipo === "2x1") descuento = Math.floor(cantidad / 2) * p.precio;
      else if (promo.tipo === "pct") descuento = Math.round(bruto * Math.min(90, promo.valor)) / 100;
    }
    return { bruto: bruto, descuento: descuento, total: bruto - descuento };
  }

  function resumenBolsa() {
    var r = { piezas: 0, bruto: 0, descuento: 0, total: 0, lineas: [] };
    Object.keys(estado.bolsa).forEach(function (id) {
      var p = platoPorId(id);
      if (!p) return;
      var c = estado.bolsa[id];
      var precio = lineaPrecio(p, c);
      r.piezas += c;
      r.bruto += precio.bruto;
      r.descuento += precio.descuento;
      r.total += precio.total;
      r.lineas.push({ plato: p, cantidad: c, precio: precio });
    });
    return r;
  }

  function pintarBolsa() {
    if (!estado.datos) return;
    var r = resumenBolsa();
    var num = $("bolsaNum");
    num.textContent = r.piezas;
    num.hidden = r.piezas === 0;
    $("abrirBolsa").setAttribute("aria-label", r.piezas ? "Ver tu pedido, " + T.plural(r.piezas, "producto", "productos") : "Ver tu pedido");

    var barra = $("barraPedido");
    barra.hidden = r.piezas === 0 || $("bolsa").open;
    document.body.classList.toggle("con-barra", !barra.hidden);
    $("barraCantidad").textContent = "Ver pedido · " + T.plural(r.piezas, "producto", "productos");
    $("barraTotal").textContent = T.dinero(r.total);

    var lista = $("lineas");
    lista.textContent = "";
    r.lineas.forEach(function (l) {
      var li = crear("li", "linea");
      li.appendChild(imagenPlato(l.plato));
      var info = crear("div");
      info.appendChild(crear("p", "linea__nombre", l.plato.nombre));
      info.appendChild(crear("p", "linea__precio", T.dinero(l.plato.precio) + " c/u · " + T.dinero(l.precio.total)));
      if (l.precio.descuento) info.appendChild(crear("p", "linea__promo", "Promo del día: −" + T.dinero(l.precio.descuento)));
      li.appendChild(info);
      var c = controlCantidad(l.plato);
      li.appendChild(c);
      lista.appendChild(li);
    });

    var vacia = r.piezas === 0;
    $("bolsaVacia").hidden = !vacia;
    $("bolsaPie").hidden = vacia;
    $("checkout").hidden = vacia;
    $("subtotal").textContent = T.dinero(r.bruto);
    $("filaAhorro").hidden = !r.descuento;
    $("ahorro").textContent = "−" + T.dinero(r.descuento);
    $("total").textContent = T.dinero(r.total);
    $("confirmar").textContent = "Confirmar pedido · " + T.dinero(r.total);

    var h = estado.datos.hoy;
    var parada = $("bolsaParada");
    parada.textContent = h.parada.activo && (h.estado === "abierto" || h.estado === "pronto") ? "Recoges hoy en " + h.parada.lugar + " · " + h.parada.direccion : "";
    parada.hidden = !parada.textContent;

    var cerrado = $("bolsaCerrado");
    var motivo = "";
    if (!estado.servidor) motivo = "Los pedidos en línea necesitan el servidor PHP encendido. Mientras tanto puedes ver el menú.";
    else if (!h.acepta_pedidos) motivo = h.estado === "abierto" || h.estado === "pronto" ? "Ya no quedan horarios libres para hoy. Te esperamos en la ventanilla." : "Hoy ya no recibimos pedidos en línea. " + (h.proxima ? "Vuelve el " + h.proxima.nombre_dia.toLowerCase() + " desde temprano." : "");
    cerrado.textContent = motivo;
    cerrado.hidden = !motivo || vacia;
    $("confirmar").disabled = !!motivo || estado.enviando;
    pintarFranjas();
  }

  function pintarFranjas() {
    var caja = $("franjas");
    var lista = estado.datos.hoy.franjas || [];
    var grupo = caja.closest(".grupo");
    grupo.hidden = !lista.length;
    var disponibles = lista.filter(function (f) { return !f.lleno; }).map(function (f) { return f.hora; });
    if (disponibles.indexOf(estado.franja) === -1) estado.franja = disponibles[0] || "";
    caja.textContent = "";
    lista.forEach(function (f) {
      var b = crear("button", "franja");
      b.type = "button";
      b.setAttribute("role", "radio");
      b.setAttribute("aria-checked", String(f.hora === estado.franja));
      b.tabIndex = f.hora === estado.franja ? 0 : -1;
      b.disabled = f.lleno;
      b.dataset.hora = f.hora;
      b.appendChild(document.createTextNode(f.hora));
      b.appendChild(crear("small", "", f.lleno ? "Llena" : f.libres <= 2 ? "Quedan " + f.libres : "Libre"));
      caja.appendChild(b);
    });
  }

  function elegirFranja(hora) {
    estado.franja = hora;
    $("errRecoger").hidden = true;
    $("franjas").querySelectorAll(".franja").forEach(function (b) {
      var si = b.dataset.hora === hora;
      b.setAttribute("aria-checked", String(si));
      b.tabIndex = si ? 0 : -1;
    });
  }

  function abrirBolsa() {
    var d = $("bolsa");
    if (d.open) return;
    $("pasoBolsa").hidden = false;
    $("pasoListo").hidden = true;
    $("pedidoError").hidden = true;
    pintarBolsa();
    d.showModal();
    $("barraPedido").hidden = true;
  }

  function cerrarBolsa() {
    $("bolsa").close();
  }

  function mostrarErrorCampo(id, texto) {
    var el = $(id);
    el.textContent = texto || "";
    el.hidden = !texto;
  }

  function confirmarPedido(ev) {
    ev.preventDefault();
    if (estado.enviando) return;
    var form = $("checkout");
    var nombre = form.nombre.value.trim();
    var telefono = form.telefono.value.replace(/\D/g, "");
    var ok = true;
    mostrarErrorCampo("errNombre", nombre.length < 2 ? "Escribe tu nombre para llamarte en la ventanilla." : "");
    mostrarErrorCampo("errTelefono", telefono.length !== 10 ? "El teléfono debe tener 10 dígitos." : "");
    mostrarErrorCampo("errRecoger", !estado.franja ? "Elige una hora para recoger." : "");
    form.nombre.setAttribute("aria-invalid", String(nombre.length < 2));
    form.telefono.setAttribute("aria-invalid", String(telefono.length !== 10));
    if (nombre.length < 2) { form.nombre.focus(); ok = false; }
    else if (telefono.length !== 10) { form.telefono.focus(); ok = false; }
    else if (!estado.franja) ok = false;
    if (!ok) return;

    var items = Object.keys(estado.bolsa).map(function (id) { return { id: id, cantidad: estado.bolsa[id] }; });
    var boton = $("confirmar");
    estado.enviando = true;
    boton.disabled = true;
    boton.textContent = "Enviando a la plancha…";
    $("pedidoError").hidden = true;

    enviar("pedidos.php", {
      items: items,
      nombre: nombre,
      telefono: telefono,
      recoger: estado.franja,
      nota: form.nota.value.trim(),
      sitio_web: form.sitio_web.value
    }).then(function (r) {
      estado.bolsa = {};
      guardarLocal(CLAVE_BOLSA, {});
      guardarLocal(CLAVE_TURNO, { numero: r.numero, codigo: r.codigo });
      $("tkNumero").textContent = String(r.numero).padStart(3, "0");
      $("tkCodigo").textContent = r.codigo;
      $("tkHora").textContent = r.recoger;
      $("tkParada").textContent = r.parada;
      $("tkTotal").textContent = T.dinero(r.total);
      $("tkTexto").textContent = (r.ahorro ? "Te ahorraste " + T.dinero(r.ahorro) + " con la promo del día. " : "") + "Llega a las " + r.recoger + " a la ventanilla lateral y di tu número. Guarda el código para seguir tu turno.";
      $("pasoBolsa").hidden = true;
      $("bolsaPie").hidden = true;
      $("pasoListo").hidden = false;
      form.reset();
      rellenarTurno(r.numero, r.codigo);
      document.querySelectorAll(".renglon").forEach(function (t) { refrescarControles(t.dataset.plato); });
      cargar(true);
    }).catch(function (e) {
      var err = $("pedidoError");
      err.textContent = e.message;
      err.hidden = false;
      if (e.errores) {
        if (e.errores.nombre) mostrarErrorCampo("errNombre", e.errores.nombre);
        if (e.errores.telefono) mostrarErrorCampo("errTelefono", e.errores.telefono);
        if (e.errores.recoger) mostrarErrorCampo("errRecoger", e.errores.recoger);
      }
      if (e.estado === 409 || e.estado === 422) cargar(true);
    }).then(function () {
      estado.enviando = false;
      pintarBolsa();
    });
  }

  function rellenarTurno(numero, codigo) {
    var f = $("turnoForm");
    f.numero.value = numero;
    f.codigo.value = codigo;
    seguirTurno(numero, codigo, true);
  }

  var TEXTOS_TURNO = {
    recibido: "Recibimos tu pedido",
    preparando: "Tu pedido está en la plancha",
    listo: "¡Listo! Pasa a la ventanilla",
    entregado: "Entregado. ¡Buen provecho!",
    cancelado: "Este pedido se canceló"
  };

  function seguirTurno(numero, codigo, silencioso) {
    clearTimeout(estado.turnoTimer);
    if (!estado.servidor) {
      if (!silencioso) {
        var e = $("turnoError");
        e.textContent = "El seguimiento necesita el servidor PHP encendido.";
        e.hidden = false;
      }
      return;
    }
    enviar("seguimiento.php", { numero: numero, codigo: codigo }).then(function (r) {
      $("turnoError").hidden = true;
      var caja = $("estadoTurno");
      caja.hidden = false;
      $("etNumero").textContent = String(r.numero).padStart(3, "0");
      $("etTexto").textContent = TEXTOS_TURNO[r.estado] || r.estado;
      var pasos = ["recibido", "preparando", "listo", "entregado"];
      var i = pasos.indexOf(r.estado);
      $("etProgreso").querySelectorAll("li").forEach(function (li, k) {
        li.className = r.estado === "cancelado" ? "" : k < i || (k === i && r.estado === "entregado") ? "hecho" : k === i ? "actual" : "";
      });
      var detalle = "";
      if (r.estado === "recibido" || r.estado === "preparando") {
        detalle = r.antes ? "Hay " + T.plural(r.antes, "pedido", "pedidos") + " antes que el tuyo. Recoge a las " + r.recoger + " en " + r.parada + "." : "Eres el siguiente. Recoge a las " + r.recoger + " en " + r.parada + ".";
      } else if (r.estado === "listo") {
        detalle = "Te esperamos en " + r.parada + ". Di tu número en la ventanilla.";
      } else if (r.estado === "entregado") {
        detalle = "Gracias por pedir con nosotros, " + r.nombre + ".";
      } else {
        detalle = "Si crees que es un error, escríbenos por WhatsApp.";
      }
      $("etDetalle").textContent = detalle + " Total: " + T.dinero(r.total) + ".";
      var items = $("etItems");
      items.textContent = "";
      r.items.forEach(function (it) { items.appendChild(crear("li", "", it.cantidad + "× " + it.nombre)); });
      if (r.estado !== "entregado" && r.estado !== "cancelado") {
        estado.turnoTimer = setTimeout(function () { seguirTurno(numero, codigo, true); }, 15000);
      } else {
        guardarLocal(CLAVE_TURNO, null);
      }
    }).catch(function (e) {
      if (silencioso) {
        if (e.estado === 404) guardarLocal(CLAVE_TURNO, null);
        return;
      }
      $("estadoTurno").hidden = true;
      var err = $("turnoError");
      err.textContent = e.message;
      err.hidden = false;
    });
  }

  function iniciarTurno() {
    $("turnoForm").addEventListener("submit", function (ev) {
      ev.preventDefault();
      var f = ev.target;
      var numero = parseInt(f.numero.value, 10);
      var codigo = f.codigo.value.trim().toUpperCase();
      var err = $("turnoError");
      if (!numero || codigo.length !== 4) {
        err.textContent = "Escribe tu número de turno y el código de 4 caracteres.";
        err.hidden = false;
        return;
      }
      seguirTurno(numero, codigo, false);
    });
    var guardado = leerLocal(CLAVE_TURNO);
    if (guardado && guardado.numero && guardado.codigo) {
      var f = $("turnoForm");
      f.numero.value = guardado.numero;
      f.codigo.value = guardado.codigo;
      seguirTurno(guardado.numero, guardado.codigo, true);
    }
  }

  function prepararCotizador() {
    var cfg = estado.datos.eventos;
    var form = $("cotizador");
    var caja = $("paquetes");
    var elegido = form.dataset.paquete || (cfg.paquetes[1] || cfg.paquetes[0]).id;
    form.dataset.paquete = elegido;
    caja.textContent = "";
    cfg.paquetes.forEach(function (p) {
      var b = crear("button", "paquete");
      b.type = "button";
      b.setAttribute("role", "radio");
      b.setAttribute("aria-checked", String(p.id === elegido));
      b.dataset.paquete = p.id;
      b.appendChild(crear("span", "paquete__nombre", p.nombre));
      var precio = crear("span", "paquete__precio", T.dinero(p.precio));
      precio.appendChild(crear("small", "", " /persona"));
      b.appendChild(precio);
      b.appendChild(crear("span", "paquete__incluye", p.incluye));
      caja.appendChild(b);
    });

    var horas = $("evHoras");
    var actual = horas.value;
    horas.textContent = "";
    for (var h = cfg.horas_base; h <= 8; h++) {
      var o = crear("option", "", h + " horas" + (h === cfg.horas_base ? " (incluidas)" : " (+" + T.dinero((h - cfg.horas_base) * cfg.hora_extra) + ")"));
      o.value = h;
      horas.appendChild(o);
    }
    if (actual) horas.value = actual;

    var inv = $("evInvitados");
    inv.min = cfg.minimo;
    inv.max = cfg.maximo;
    $("evInvitadosAyuda").textContent = "De " + cfg.minimo + " a " + cfg.maximo + " personas.";
    $("evKmAyuda").textContent = "Los primeros " + cfg.km_incluidos + " km no tienen costo; después " + T.dinero(cfg.costo_km) + " por km.";
    var min = new Date();
    min.setDate(min.getDate() + cfg.anticipacion_dias);
    $("evFecha").min = T.fechaISO(min);
    $("evFechaAyuda").textContent = "Con al menos " + T.plural(cfg.anticipacion_dias, "día", "días") + " de anticipación.";
    recalcular();
  }

  function valoresCotizador() {
    var f = $("cotizador");
    return {
      paquete: f.dataset.paquete,
      tipo: f.tipo.value,
      invitados: f.invitados.value,
      fecha: f.fecha.value,
      hora: f.hora.value,
      horas: f.horas.value,
      km: f.km.value,
      nombre: f.nombre.value.trim(),
      telefono: f.telefono.value.replace(/\D/g, ""),
      correo: f.correo.value.trim(),
      lugar: f.lugar.value.trim(),
      notas: f.notas.value.trim(),
      sitio_web: f.sitio_web.value
    };
  }

  function recalcular() {
    var cfg = estado.datos.eventos;
    var v = valoresCotizador();
    var c = T.cotizar(v, cfg);
    var inv = parseInt(v.invitados, 10) || 0;
    var paquete = null;
    cfg.paquetes.forEach(function (p) { if (p.id === v.paquete) paquete = p; });
    $("evComidaTexto").textContent = paquete ? inv + " × " + T.dinero(paquete.precio) : "Comida";
    $("evComida").textContent = T.dinero(c.comida);
    $("evExtra").textContent = T.dinero(c.horas_extra);
    $("evTraslado").textContent = T.dinero(c.traslado);
    $("evTotal").textContent = T.dinero(c.total);
    $("evAnticipo").textContent = "Anticipo para apartar la fecha: " + T.dinero(c.anticipo) + " (" + cfg.anticipo_pct + " %).";
    $("evCalculo").textContent = inv >= cfg.minimo ? "Preparamos ≈ " + c.tacos.toLocaleString("es-MX") + " tacos con " + T.plural(c.taqueros, "taquero", "taqueros") + " en el camión." : "";

    var disp = $("evDisponible");
    var fechaMin = $("evFecha").min;
    if (!v.fecha) {
      disp.className = "resumen__disponible";
      disp.textContent = "Elige una fecha para revisar disponibilidad.";
    } else if (v.fecha < fechaMin) {
      disp.className = "resumen__disponible resumen__disponible--no";
      disp.textContent = "Necesitamos al menos " + T.plural(cfg.anticipacion_dias, "día", "días") + " de anticipación.";
    } else if (estado.datos.ocupadas.indexOf(v.fecha) !== -1) {
      disp.className = "resumen__disponible resumen__disponible--no";
      disp.textContent = "Esa fecha ya está reservada. Prueba con otro día.";
    } else {
      disp.className = "resumen__disponible resumen__disponible--si";
      disp.textContent = "¡Fecha disponible! " + fechaLarga(v.fecha);
    }
    var fueraRango = inv < cfg.minimo || inv > cfg.maximo;
    $("evInvitadosAyuda").className = "campo__ayuda" + (fueraRango && v.invitados !== "" ? " campo__ayuda--error" : "");
  }

  function fechaLarga(iso) {
    var p = iso.split("-");
    var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    return T.DIAS[d.getDay()] + " " + T.fechaCorta(iso) + ".";
  }

  function iniciarCotizador() {
    var form = $("cotizador");
    $("paquetes").addEventListener("click", function (ev) {
      var b = ev.target.closest(".paquete");
      if (!b) return;
      form.dataset.paquete = b.dataset.paquete;
      $("paquetes").querySelectorAll(".paquete").forEach(function (x) {
        x.setAttribute("aria-checked", String(x === b));
      });
      recalcular();
    });
    $("paquetes").addEventListener("keydown", function (ev) {
      if (ev.key !== "ArrowRight" && ev.key !== "ArrowLeft") return;
      var botones = Array.prototype.slice.call($("paquetes").querySelectorAll(".paquete"));
      var i = botones.indexOf(document.activeElement);
      if (i === -1) return;
      var sig = botones[(i + (ev.key === "ArrowRight" ? 1 : botones.length - 1)) % botones.length];
      sig.focus();
      sig.click();
    });
    form.addEventListener("input", function (ev) {
      if (ev.target.getAttribute("aria-invalid") === "true") ev.target.setAttribute("aria-invalid", "false");
      recalcular();
    });
    form.addEventListener("change", recalcular);
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var v = valoresCotizador();
      var errores = {};
      var cfg = estado.datos.eventos;
      var inv = parseInt(v.invitados, 10) || 0;
      if (inv < cfg.minimo || inv > cfg.maximo) errores.invitados = 1;
      if (!v.fecha) errores.fecha = 1;
      if (!v.hora) errores.hora = 1;
      if (v.nombre.length < 3) errores.nombre = 1;
      if (v.telefono.length !== 10) errores.telefono = 1;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.correo)) errores.correo = 1;
      if (v.lugar.length < 5) errores.lugar = 1;
      marcarErrores(form, errores);
      var err = $("evError");
      if (Object.keys(errores).length) {
        err.textContent = "Revisa los campos marcados en rojo.";
        err.hidden = false;
        return;
      }
      if (!estado.servidor) {
        err.textContent = "Para enviar la solicitud necesitas el servidor PHP encendido. También puedes escribirnos por WhatsApp.";
        err.hidden = false;
        return;
      }
      err.hidden = true;
      var boton = $("evEnviar");
      boton.disabled = true;
      boton.textContent = "Enviando…";
      v.accion = "solicitar";
      enviar("eventos.php", v).then(function (r) {
        $("evFolio").textContent = r.folio;
        $("evExitoTexto").textContent = "Total estimado " + T.dinero(r.total) + ". Te escribiremos al " + v.telefono.replace(/(\d{2})(\d{4})(\d{4})/, "$1 $2 $3") + " para confirmar y apartar con " + T.dinero(r.anticipo) + ".";
        form.hidden = true;
        var ok = $("evExito");
        ok.hidden = false;
        ok.focus();
      }).catch(function (e) {
        marcarErrores(form, e.errores || {});
        var primer = e.errores && Object.keys(e.errores)[0];
        err.textContent = primer ? e.errores[primer] : e.message;
        err.hidden = false;
      }).then(function () {
        boton.disabled = false;
        boton.textContent = "Enviar solicitud";
      });
    });
    $("evOtra").addEventListener("click", function () {
      form.reset();
      form.hidden = false;
      $("evExito").hidden = true;
      recalcular();
      form.invitados.focus();
    });
  }

  function marcarErrores(form, errores) {
    var primero = null;
    ["invitados", "fecha", "hora", "nombre", "telefono", "correo", "lugar", "km", "horas"].forEach(function (n) {
      var campo = form.elements[n];
      if (!campo) return;
      var mal = !!errores[n];
      campo.setAttribute("aria-invalid", String(mal));
      if (mal && !primero) primero = campo;
    });
    if (primero) primero.focus();
  }

  function descargarRuta() {
    var semana = estado.datos.semana.filter(function (p) { return p.activo; });
    if (!semana.length) {
      aviso("No hay paradas activas esta semana.");
      return;
    }
    var sello = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
    var escapar = function (t) { return String(t).replace(/([,;\\])/g, "\\$1"); };
    var lineas = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Trompo Rodante//Ruta//ES", "CALSCALE:GREGORIAN", "X-WR-CALNAME:Ruta Trompo Rodante"];
    semana.forEach(function (p) {
      var f = p.fecha.replace(/-/g, "");
      lineas.push(
        "BEGIN:VEVENT",
        "UID:" + f + "-" + p.dia + "@trompo-rodante.mx",
        "DTSTAMP:" + sello,
        "DTSTART:" + f + "T" + p.inicio.replace(":", "") + "00",
        "DTEND:" + f + "T" + p.fin.replace(":", "") + "00",
        "SUMMARY:" + escapar("Trompo Rodante en " + p.lugar),
        "LOCATION:" + escapar(p.direccion),
        "DESCRIPTION:" + escapar("Pide antes y salta la fila en trompo-rodante.mx"),
        "END:VEVENT"
      );
    });
    lineas.push("END:VCALENDAR");
    var blob = new Blob([lineas.join("\r\n")], { type: "text/calendar;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "ruta-trompo-rodante.ics";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    aviso("Descargamos " + T.plural(semana.length, "parada", "paradas") + " para tu calendario");
  }

  function iniciarCabecera() {
    var cab = $("cabecera");
    var boton = $("menuBoton");
    var nav = $("nav");
    var tick = false;
    window.addEventListener("scroll", function () {
      if (tick) return;
      tick = true;
      requestAnimationFrame(function () {
        cab.classList.toggle("cabecera--baja", window.scrollY > 8);
        tick = false;
      });
    }, { passive: true });

    function cerrarNav() {
      nav.classList.remove("nav--abierta");
      boton.setAttribute("aria-expanded", "false");
      boton.setAttribute("aria-label", "Abrir menú");
    }
    boton.addEventListener("click", function () {
      var abierto = nav.classList.toggle("nav--abierta");
      boton.setAttribute("aria-expanded", String(abierto));
      boton.setAttribute("aria-label", abierto ? "Cerrar menú" : "Abrir menú");
    });
    nav.addEventListener("click", function (ev) {
      if (ev.target.closest("a")) cerrarNav();
    });
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") cerrarNav();
    });

    if ("IntersectionObserver" in window) {
      var enlaces = {};
      nav.querySelectorAll("a").forEach(function (a) { enlaces[a.getAttribute("href").slice(1)] = a; });
      var obs = new IntersectionObserver(function (entradas) {
        entradas.forEach(function (e) {
          var a = enlaces[e.target.id];
          if (a && e.isIntersecting) {
            nav.querySelectorAll("a").forEach(function (x) { x.removeAttribute("aria-current"); });
            a.setAttribute("aria-current", "true");
          }
        });
      }, { rootMargin: "-45% 0px -50% 0px" });
      Object.keys(enlaces).forEach(function (id) {
        var s = $(id);
        if (s) obs.observe(s);
      });
    }
  }

  var observador = null;
  function observarRevelar(raiz) {
    var els = (raiz || document).querySelectorAll(".revelar:not(.visible)");
    if (!("IntersectionObserver" in window) || reducirMovimiento) {
      els.forEach(function (el) { el.classList.add("visible"); });
      return;
    }
    if (!observador) {
      observador = new IntersectionObserver(function (entradas) {
        entradas.forEach(function (e) {
          if (e.isIntersecting) {
            e.target.classList.add("visible");
            observador.unobserve(e.target);
          }
        });
      }, { rootMargin: "0px 0px -10% 0px" });
    }
    els.forEach(function (el) { observador.observe(el); });
  }

  function marcarRevelables() {
    var selectores = [".carta", ".ruta__intro", ".parada", ".historia__cab > *", ".proceso li", ".galeria__cab", ".eventos__intro > div", ".grupo", ".resenas__grid > *", ".turno__grid > *"];
    document.querySelectorAll(selectores.join(",")).forEach(function (el) {
      if (el.closest(".heroe") || el.closest(".bolsa")) return;
      el.classList.add("revelar");
    });
    [".semana .parada", ".proceso li"].forEach(function (sel) {
      document.querySelectorAll(sel).forEach(function (el, i) {
        el.style.transitionDelay = i * 60 + "ms";
      });
    });
    observarRevelar();
  }

  var RESENAS = [
    { estrellas: 5, texto: "Pedí desde la oficina, llegué a las 14:10 y mis tacos ya estaban envueltos. El pastor con piña es de los mejores de la ciudad.", autor: "Ximena R. · Puerta de Hierro" },
    { estrellas: 5, texto: "Los contratamos para la boda: 180 invitados, cero filas y el trompo fue la sensación. Cotizamos en la página y todo salió igual.", autor: "Mónica y Andrés · Tlaquepaque" },
    { estrellas: 4, texto: "La birria con consomé de los jueves no tiene comparación. Me encanta saber dónde van a estar sin buscar en redes.", autor: "Iván M. · Ciudad Universitaria" },
    { estrellas: 5, texto: "Vi en la pantalla que mi turno iba en camino y llegué justo cuando lo gritaron. Así sí dan ganas de volver cada viernes.", autor: "Paola S. · Chapalita" },
    { estrellas: 5, texto: "Las tortillas hechas ahí mismo hacen toda la diferencia. La gringa es enorme y el precio muy justo.", autor: "Rodrigo L. · Providencia" }
  ];

  function iniciarResenas() {
    var i = 0;
    var puntos = $("citaPuntos");
    var cita = $("cita");
    RESENAS.forEach(function (r, k) {
      var b = crear("button");
      b.type = "button";
      b.setAttribute("aria-label", "Ver reseña " + (k + 1) + " de " + RESENAS.length);
      b.addEventListener("click", function () { ir(k); });
      puntos.appendChild(b);
    });
    function pintar() {
      var r = RESENAS[i];
      $("citaTexto").textContent = "“" + r.texto + "”";
      $("citaAutor").textContent = r.autor;
      $("citaEstrellas").textContent = "★★★★★".slice(0, r.estrellas) + "☆☆☆☆☆".slice(0, 5 - r.estrellas);
      $("citaEstrellas").setAttribute("aria-label", r.estrellas + " de 5 estrellas");
      puntos.querySelectorAll("button").forEach(function (b, k) {
        b.setAttribute("aria-current", String(k === i));
      });
    }
    function ir(k) {
      i = (k + RESENAS.length) % RESENAS.length;
      if (reducirMovimiento) {
        pintar();
        return;
      }
      cita.classList.add("cambiando");
      setTimeout(function () {
        pintar();
        cita.classList.remove("cambiando");
      }, 260);
    }
    $("citaAnterior").addEventListener("click", function () { ir(i - 1); });
    $("citaSiguiente").addEventListener("click", function () { ir(i + 1); });
    pintar();
  }

  function iniciarGaleria() {
    var pista = $("galeriaPista");
    function paso() {
      var f = pista.querySelector(".polaroid");
      return f ? f.getBoundingClientRect().width + 28 : 300;
    }
    function mover(dir) {
      pista.scrollBy({ left: dir * paso() * 2, behavior: reducirMovimiento ? "auto" : "smooth" });
    }
    $("galeriaAnterior").addEventListener("click", function () { mover(-1); });
    $("galeriaSiguiente").addEventListener("click", function () { mover(1); });
    pista.addEventListener("keydown", function (ev) {
      if (ev.key === "ArrowRight" || ev.key === "ArrowLeft") {
        ev.preventDefault();
        mover(ev.key === "ArrowRight" ? 0.5 : -0.5);
      }
    });
    var inicioX = 0, inicioScroll = 0, arrastrando = false;
    pista.addEventListener("pointerdown", function (ev) {
      if (ev.pointerType !== "mouse" || ev.button !== 0) return;
      arrastrando = true;
      inicioX = ev.clientX;
      inicioScroll = pista.scrollLeft;
      pista.setPointerCapture(ev.pointerId);
      pista.classList.add("arrastrando");
    });
    pista.addEventListener("pointermove", function (ev) {
      if (arrastrando) pista.scrollLeft = inicioScroll - (ev.clientX - inicioX);
    });
    function soltar() {
      if (!arrastrando) return;
      arrastrando = false;
      pista.classList.remove("arrastrando");
    }
    pista.addEventListener("pointerup", soltar);
    pista.addEventListener("pointercancel", soltar);
  }

  function iniciarMapa() {
    var canvas = $("mapaRuta");
    var ctx = canvas.getContext("2d");
    if (!ctx) return;
    var ancho = 0, alto = 0, dpr = 1;
    var calles = [], paradas = [], camino = [], longitudes = [], total = 0;
    var visible = true, t0 = performance.now(), cuadro = 0;

    function azar(semilla) {
      var s = semilla;
      return function () {
        s = (s * 16807) % 2147483647;
        return (s - 1) / 2147483646;
      };
    }

    function preparar() {
      var caja = canvas.parentNode.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      ancho = Math.max(320, Math.round(caja.width));
      alto = Math.max(320, Math.round(caja.height));
      canvas.width = ancho * dpr;
      canvas.height = alto * dpr;
      canvas.style.width = ancho + "px";
      canvas.style.height = alto + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      var r = azar(7);
      calles = [];
      var paso = 46;
      var angulo = -0.21;
      var diag = Math.hypot(ancho, alto);
      for (var i = -diag; i < diag; i += paso + Math.floor(r() * 20)) {
        calles.push({ a: angulo, d: i, g: r() < 0.14 ? 3 : 1 });
      }
      for (var j = -diag; j < diag; j += paso + Math.floor(r() * 26)) {
        calles.push({ a: angulo + Math.PI / 2, d: j, g: r() < 0.14 ? 3 : 1 });
      }
      calles.push({ a: 0.62, d: alto * 0.1, g: 5 });
      calles.push({ a: -0.95, d: ancho * 0.55, g: 4 });

      var base = [[0.52, 0.2], [0.7, 0.3], [0.88, 0.2], [0.93, 0.52], [0.78, 0.72], [0.6, 0.86], [0.46, 0.62]];
      if (ancho < 860) base = [[0.12, 0.12], [0.4, 0.2], [0.78, 0.1], [0.9, 0.42], [0.62, 0.6], [0.3, 0.78], [0.14, 0.5]];
      paradas = base.map(function (p) { return { x: p[0] * ancho, y: p[1] * alto }; });

      camino = [];
      for (var k = 0; k < paradas.length; k++) {
        var a = paradas[k], b = paradas[(k + 1) % paradas.length];
        var mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        var dx = b.x - a.x, dy = b.y - a.y;
        var cx = mx - dy * 0.22, cy = my + dx * 0.22;
        for (var s = 0; s < 40; s++) {
          var t = s / 40;
          camino.push({
            x: (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * cx + t * t * b.x,
            y: (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * cy + t * t * b.y
          });
        }
      }
      longitudes = [0];
      total = 0;
      for (var m = 1; m <= camino.length; m++) {
        var p1 = camino[m - 1], p2 = camino[m % camino.length];
        total += Math.hypot(p2.x - p1.x, p2.y - p1.y);
        longitudes.push(total);
      }
    }

    function puntoEn(dist) {
      dist = ((dist % total) + total) % total;
      var i = 1;
      while (i < longitudes.length && longitudes[i] < dist) i++;
      var a = camino[(i - 1) % camino.length], b = camino[i % camino.length];
      var tramo = longitudes[i] - longitudes[i - 1] || 1;
      var t = (dist - longitudes[i - 1]) / tramo;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, ang: Math.atan2(b.y - a.y, b.x - a.x) };
    }

    function dibujar(ahora) {
      var t = (ahora - t0) / 1000;
      ctx.clearRect(0, 0, ancho, alto);

      ctx.lineCap = "round";
      calles.forEach(function (c) {
        var cos = Math.cos(c.a), sin = Math.sin(c.a);
        var cx = ancho / 2 - sin * c.d, cy = alto / 2 + cos * c.d;
        var largo = Math.hypot(ancho, alto);
        ctx.strokeStyle = c.g > 2 ? "rgba(243,235,220,0.13)" : "rgba(243,235,220,0.06)";
        ctx.lineWidth = c.g;
        ctx.beginPath();
        ctx.moveTo(cx - cos * largo, cy - sin * largo);
        ctx.lineTo(cx + cos * largo, cy + sin * largo);
        ctx.stroke();
      });

      ctx.strokeStyle = "rgba(243,235,220,0.1)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(paradas[4].x, paradas[4].y, 38, 0, Math.PI * 2);
      ctx.stroke();

      ctx.setLineDash([10, 10]);
      ctx.lineDashOffset = reducirMovimiento ? 0 : -t * 22;
      ctx.strokeStyle = "rgba(226,71,43,0.85)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      camino.forEach(function (p, i) { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
      ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);

      var hoy = estado.datos ? estado.datos.hoy.parada.dia : new Date().getDay();
      paradas.forEach(function (p, i) {
        var esHoy = (i + 1) % 7 === hoy;
        if (esHoy && !reducirMovimiento) {
          var fase = (t % 2) / 2;
          ctx.strokeStyle = "rgba(243,235,220," + (0.6 * (1 - fase)) + ")";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 10 + fase * 26, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.fillStyle = esHoy ? "#F3EBDC" : "#13352A";
        ctx.strokeStyle = esHoy ? "#E2472B" : "rgba(243,235,220,0.7)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(p.x, p.y, esHoy ? 10 : 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "rgba(243,235,220,0.55)";
        ctx.font = "600 11px 'Geist', sans-serif";
        ctx.fillText(T.DIAS[(i + 1) % 7].slice(0, 3).toUpperCase(), p.x + 14, p.y - 10);
      });

      var pos = puntoEn(reducirMovimiento ? total * 0.3 : t * 38);
      ctx.save();
      ctx.translate(pos.x, pos.y);
      ctx.rotate(pos.ang);
      ctx.fillStyle = "#E2472B";
      ctx.strokeStyle = "#F3EBDC";
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(-14, -8, 28, 16, 4);
      else ctx.rect(-14, -8, 28, 16);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#F3EBDC";
      ctx.fillRect(4, -5, 6, 10);
      ctx.restore();
    }

    function bucle(ahora) {
      dibujar(ahora);
      if (visible && !reducirMovimiento) cuadro = requestAnimationFrame(bucle);
    }

    preparar();
    dibujar(performance.now());

    if ("ResizeObserver" in window) {
      var espera = 0;
      new ResizeObserver(function () {
        clearTimeout(espera);
        espera = setTimeout(function () {
          preparar();
          dibujar(performance.now());
        }, 120);
      }).observe(canvas.parentNode);
    }

    if (!reducirMovimiento && "IntersectionObserver" in window) {
      new IntersectionObserver(function (e) {
        visible = e[0].isIntersecting;
        cancelAnimationFrame(cuadro);
        if (visible) cuadro = requestAnimationFrame(bucle);
      }).observe(canvas);
    }
  }

  function iniciarEventos() {
    $("filtros").addEventListener("click", function (ev) {
      var b = ev.target.closest(".filtro");
      if (!b) return;
      estado.categoria = b.dataset.categoria;
      $("filtros").querySelectorAll(".filtro").forEach(function (x) {
        x.setAttribute("aria-pressed", String(x === b));
      });
      pintarPlatos(false);
    });

    var espera = 0;
    $("buscar").addEventListener("input", function (ev) {
      clearTimeout(espera);
      espera = setTimeout(function () {
        estado.busqueda = ev.target.value.trim();
        pintarPlatos(false);
      }, 180);
    });

    $("verMas").addEventListener("click", function () {
      estado.completo = true;
      pintarPlatos(false);
    });

    ["mouseover", "focusin"].forEach(function (tipo) {
      $("platos").addEventListener(tipo, function (ev) {
        var fila = ev.target.closest(".renglon");
        if (fila) mostrarVista(platoPorId(fila.dataset.plato));
      });
    });

    document.addEventListener("click", function (ev) {
      var b = ev.target.closest("[data-accion]");
      if (!b || !b.dataset.id) return;
      cambiarCantidad(b.dataset.id, b.dataset.accion === "agregar" ? 1 : -1);
    });

    $("abrirBolsa").addEventListener("click", abrirBolsa);
    $("barraPedido").addEventListener("click", function (ev) {
      ev.preventDefault();
      abrirBolsa();
    });

    var bolsa = $("bolsa");
    bolsa.addEventListener("click", function (ev) {
      if (ev.target === bolsa || ev.target.closest("[data-cerrar]")) cerrarBolsa();
    });
    bolsa.addEventListener("close", function () {
      pintarBolsa();
    });
    $("tkSeguir").addEventListener("click", cerrarBolsa);

    $("franjas").addEventListener("click", function (ev) {
      var b = ev.target.closest(".franja");
      if (b && !b.disabled) elegirFranja(b.dataset.hora);
    });
    $("franjas").addEventListener("keydown", function (ev) {
      if (["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].indexOf(ev.key) === -1) return;
      ev.preventDefault();
      var botones = Array.prototype.slice.call($("franjas").querySelectorAll(".franja:not(:disabled)"));
      var i = botones.indexOf(document.activeElement);
      var sig = botones[(i + (ev.key === "ArrowRight" || ev.key === "ArrowDown" ? 1 : botones.length - 1)) % botones.length];
      if (sig) {
        sig.focus();
        elegirFranja(sig.dataset.hora);
      }
    });
    $("checkout").addEventListener("submit", confirmarPedido);
    $("checkout").addEventListener("input", function (ev) {
      ev.target.setAttribute("aria-invalid", "false");
    });
    $("descargarIcs").addEventListener("click", descargarRuta);

    document.querySelectorAll("[data-red]").forEach(function (a) {
      a.innerHTML = T.svgRed(a.dataset.red);
    });
  }

  function iniciar() {
    estado.bolsa = leerLocal(CLAVE_BOLSA) || {};
    iniciarCabecera();
    iniciarEventos();
    iniciarCotizador();
    pintarEsqueletos();
    cargar(false).then(function () {
      marcarRevelables();
      iniciarMapa();
      iniciarTurno();
    });
    iniciarResenas();
    iniciarGaleria();
    setInterval(function () {
      if (document.hidden || $("bolsa").open) {
        if (estado.datos) { pintarHoy(); pintarProxima(); }
        return;
      }
      cargar(true);
    }, 60000);
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden && estado.datos && Date.now() - estado.cargadoEn > 60000) cargar(true);
    });
  }

  iniciar();
})();
