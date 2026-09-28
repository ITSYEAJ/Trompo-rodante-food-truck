(function () {
  "use strict";

  var DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  var MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  var CATEGORIAS = { tacos: "Tacos", especiales: "Especiales", bebidas: "Bebidas", postres: "Postres" };

  var MENU_LOCAL = [
    {
      "id": "taco-pastor",
      "nombre": "Taco al pastor",
      "categoria": "tacos",
      "precio": 26,
      "descripcion": "Cerdo adobado cortado del trompo, piña asada, cebolla y cilantro.",
      "imagen": "img/menu/taco-pastor.webp",
      "picante": 1,
      "vegetariano": false,
      "favorito": true
    },
    {
      "id": "taco-asada",
      "nombre": "Taco de asada",
      "categoria": "tacos",
      "precio": 30,
      "descripcion": "Arrachera al carbón, guacamole de molcajete y cebollita cambray.",
      "imagen": "img/menu/taco-asada.webp",
      "picante": 1,
      "vegetariano": false,
      "favorito": true
    },
    {
      "id": "taco-birria",
      "nombre": "Taco de birria",
      "categoria": "tacos",
      "precio": 32,
      "descripcion": "Res deshebrada en su jugo, queso gratinado y cebolla morada.",
      "imagen": "img/menu/taco-birria.webp",
      "picante": 2,
      "vegetariano": false,
      "favorito": true
    },
    {
      "id": "taco-carnitas",
      "nombre": "Taco de carnitas",
      "categoria": "tacos",
      "precio": 28,
      "descripcion": "Carnitas estilo Michoacán, salsa verde cruda y limón.",
      "imagen": "img/menu/taco-carnitas.webp",
      "picante": 1,
      "vegetariano": false,
      "favorito": false
    },
    {
      "id": "taco-pollo",
      "nombre": "Taco de pollo adobado",
      "categoria": "tacos",
      "precio": 25,
      "descripcion": "Muslo marinado en achiote y chile guajillo, pico de gallo.",
      "imagen": "img/menu/taco-pollo.webp",
      "picante": 1,
      "vegetariano": false,
      "favorito": false
    },
    {
      "id": "taco-cochinita",
      "nombre": "Taco de cochinita",
      "categoria": "tacos",
      "precio": 29,
      "descripcion": "Cochinita pibil con cebolla encurtida y habanero aparte.",
      "imagen": "img/menu/taco-cochinita.webp",
      "picante": 3,
      "vegetariano": false,
      "favorito": false
    },
    {
      "id": "taco-campechano",
      "nombre": "Taco campechano",
      "categoria": "tacos",
      "precio": 30,
      "descripcion": "Asada y chorizo en la misma tortilla, con salsa de árbol.",
      "imagen": "img/menu/taco-campechano.webp",
      "picante": 2,
      "vegetariano": false,
      "favorito": false
    },
    {
      "id": "taco-suadero",
      "nombre": "Taco de suadero",
      "categoria": "tacos",
      "precio": 28,
      "descripcion": "Suadero confitado en su grasa, dorado en la plancha.",
      "imagen": "img/menu/taco-suadero.webp",
      "picante": 1,
      "vegetariano": false,
      "favorito": false
    },
    {
      "id": "taco-hongos",
      "nombre": "Taco de hongos",
      "categoria": "tacos",
      "precio": 27,
      "descripcion": "Hongos al ajillo con epazote y queso fresco.",
      "imagen": "img/menu/taco-hongos.webp",
      "picante": 1,
      "vegetariano": true,
      "favorito": false
    },
    {
      "id": "taco-camote",
      "nombre": "Taco de camote y garbanzo",
      "categoria": "tacos",
      "precio": 26,
      "descripcion": "Camote rostizado, garbanzo crujiente y aguacate. Vegano.",
      "imagen": "img/menu/taco-camote.webp",
      "picante": 1,
      "vegetariano": true,
      "favorito": false
    },
    {
      "id": "taco-chorizo",
      "nombre": "Taco de chorizo",
      "categoria": "tacos",
      "precio": 25,
      "descripcion": "Chorizo de la casa con papa dorada y salsa roja.",
      "imagen": "img/menu/taco-chorizo.webp",
      "picante": 2,
      "vegetariano": false,
      "favorito": false
    },
    {
      "id": "gringa",
      "nombre": "Gringa de pastor",
      "categoria": "especiales",
      "precio": 69,
      "descripcion": "Tortilla de harina, queso Oaxaca derretido y pastor con piña.",
      "imagen": "img/menu/gringa.webp",
      "picante": 1,
      "vegetariano": false,
      "favorito": true
    },
    {
      "id": "quesadilla-flor",
      "nombre": "Quesadilla de flor de calabaza",
      "categoria": "especiales",
      "precio": 48,
      "descripcion": "Tortilla de maíz hecha a mano, queso y flor de calabaza.",
      "imagen": "img/menu/quesadilla-flor.webp",
      "picante": 0,
      "vegetariano": true,
      "favorito": false
    },
    {
      "id": "burrito-trompo",
      "nombre": "Burrito del trompo",
      "categoria": "especiales",
      "precio": 98,
      "descripcion": "Pastor, arroz rojo, frijoles, queso y salsa de la casa.",
      "imagen": "img/menu/burrito-trompo.webp",
      "picante": 1,
      "vegetariano": false,
      "favorito": false
    },
    {
      "id": "burrito-norteno",
      "nombre": "Burrito norteño",
      "categoria": "especiales",
      "precio": 104,
      "descripcion": "Asada, frijoles charros y queso, en tortilla de harina sobaquera.",
      "imagen": "img/menu/burrito-norteno.webp",
      "picante": 1,
      "vegetariano": false,
      "favorito": false
    },
    {
      "id": "nachos-trompo",
      "nombre": "Nachos del trompo",
      "categoria": "especiales",
      "precio": 92,
      "descripcion": "Totopos, queso fundido, pastor, crema y pico de gallo.",
      "imagen": "img/menu/nachos-trompo.webp",
      "picante": 1,
      "vegetariano": false,
      "favorito": false
    },
    {
      "id": "nachos-supremos",
      "nombre": "Nachos supremos",
      "categoria": "especiales",
      "precio": 108,
      "descripcion": "Chorizo, frijoles, jalapeño, crema y mucho queso.",
      "imagen": "img/menu/nachos-supremos.webp",
      "picante": 2,
      "vegetariano": false,
      "favorito": false
    },
    {
      "id": "consome",
      "nombre": "Consomé de birria",
      "categoria": "especiales",
      "precio": 45,
      "descripcion": "Caldo de birria con cebolla, cilantro y limón. Para remojar.",
      "imagen": "img/menu/consome.webp",
      "picante": 2,
      "vegetariano": false,
      "favorito": false
    },
    {
      "id": "elote",
      "nombre": "Elote asado",
      "categoria": "especiales",
      "precio": 42,
      "descripcion": "Al carbón, con mayonesa, queso cotija y chile piquín.",
      "imagen": "img/menu/elote.webp",
      "picante": 1,
      "vegetariano": true,
      "favorito": false
    },
    {
      "id": "totopos-queso",
      "nombre": "Totopos con queso",
      "categoria": "especiales",
      "precio": 58,
      "descripcion": "Totopos recién fritos con queso fundido y chile de árbol.",
      "imagen": "img/menu/totopos-queso.webp",
      "picante": 1,
      "vegetariano": true,
      "favorito": false
    },
    {
      "id": "agua-jamaica",
      "nombre": "Agua de jamaica",
      "categoria": "bebidas",
      "precio": 30,
      "descripcion": "Flor de jamaica infusionada, poco dulce. 500 ml.",
      "imagen": "img/menu/agua-jamaica.webp",
      "picante": 0,
      "vegetariano": true,
      "favorito": false
    },
    {
      "id": "limonada",
      "nombre": "Limonada natural",
      "categoria": "bebidas",
      "precio": 32,
      "descripcion": "Limón recién exprimido con hierbabuena. 500 ml.",
      "imagen": "img/menu/limonada.webp",
      "picante": 0,
      "vegetariano": true,
      "favorito": false
    },
    {
      "id": "limonada-mineral",
      "nombre": "Limonada mineral",
      "categoria": "bebidas",
      "precio": 36,
      "descripcion": "Limón, agua mineral y un toque de piloncillo. 500 ml.",
      "imagen": "img/menu/limonada-mineral.webp",
      "picante": 0,
      "vegetariano": true,
      "favorito": false
    },
    {
      "id": "aguas-del-dia",
      "nombre": "Agua de mango",
      "categoria": "bebidas",
      "precio": 35,
      "descripcion": "Mango de temporada licuado al momento. 500 ml.",
      "imagen": "img/menu/aguas-del-dia.webp",
      "picante": 0,
      "vegetariano": true,
      "favorito": false
    },
    {
      "id": "agua-pepino",
      "nombre": "Agua de pepino con limón",
      "categoria": "bebidas",
      "precio": 33,
      "descripcion": "Pepino, limón y chía. Refresca como ninguna. 500 ml.",
      "imagen": "img/menu/agua-pepino.webp",
      "picante": 0,
      "vegetariano": true,
      "favorito": false
    },
    {
      "id": "churros-chocolate",
      "nombre": "Churros con chocolate",
      "categoria": "postres",
      "precio": 58,
      "descripcion": "Cuatro churros con azúcar y canela y chocolate caliente.",
      "imagen": "img/menu/churros-chocolate.webp",
      "picante": 0,
      "vegetariano": true,
      "favorito": true
    },
    {
      "id": "churros",
      "nombre": "Churros clásicos",
      "categoria": "postres",
      "precio": 40,
      "descripcion": "Tres churros recién fritos con azúcar y canela.",
      "imagen": "img/menu/churros.webp",
      "picante": 0,
      "vegetariano": true,
      "favorito": false
    },
    {
      "id": "churros-cajeta",
      "nombre": "Churros rellenos de cajeta",
      "categoria": "postres",
      "precio": 49,
      "descripcion": "Tres churros rellenos de cajeta de Celaya.",
      "imagen": "img/menu/churros-cajeta.webp",
      "picante": 0,
      "vegetariano": true,
      "favorito": false
    }
  ];

  var RUTA_LOCAL = [
    {
      "dia": 0,
      "activo": true,
      "lugar": "Bosque Los Colomos",
      "direccion": "Acceso Av. Patria, Providencia, Guadalajara",
      "inicio": "11:00",
      "fin": "17:00"
    },
    {
      "dia": 1,
      "activo": false,
      "lugar": "Día de descanso",
      "direccion": "",
      "inicio": "00:00",
      "fin": "00:00"
    },
    {
      "dia": 2,
      "activo": true,
      "lugar": "Plaza Chapultepec",
      "direccion": "Av. Chapultepec Sur 120, Col. Americana, Guadalajara",
      "inicio": "18:30",
      "fin": "23:30"
    },
    {
      "dia": 3,
      "activo": true,
      "lugar": "Oficinas Puerta de Hierro",
      "direccion": "Blvd. Puerta de Hierro 4965, Zapopan",
      "inicio": "13:00",
      "fin": "16:30"
    },
    {
      "dia": 4,
      "activo": true,
      "lugar": "Ciudad Universitaria",
      "direccion": "Periférico Norte 799, Los Belenes, Zapopan",
      "inicio": "12:30",
      "fin": "17:00"
    },
    {
      "dia": 5,
      "activo": true,
      "lugar": "Glorieta Chapalita",
      "direccion": "Av. Guadalupe y Av. de las Rosas, Chapalita, Guadalajara",
      "inicio": "18:30",
      "fin": "23:30"
    },
    {
      "dia": 6,
      "activo": true,
      "lugar": "Mercado nocturno Providencia",
      "direccion": "Av. Rubén Darío 1200, Providencia, Guadalajara",
      "inicio": "17:00",
      "fin": "23:30"
    }
  ];

  var EVENTOS_LOCAL = {
    "minimo": 30,
    "maximo": 400,
    "horas_base": 3,
    "hora_extra": 1500,
    "km_incluidos": 15,
    "costo_km": 18,
    "anticipo_pct": 30,
    "anticipacion_dias": 3,
    "paquetes": [
      {
        "id": "clasica",
        "nombre": "Taquiza clásica",
        "precio": 185,
        "tacos": 4,
        "incluye": "Pastor, asada y pollo · salsas · cebolla y cilantro · aguas frescas"
      },
      {
        "id": "completa",
        "nombre": "Taquiza completa",
        "precio": 245,
        "tacos": 5,
        "incluye": "Cinco guisos · gringas · elote asado · aguas frescas ilimitadas"
      },
      {
        "id": "premium",
        "nombre": "Trompo premium",
        "precio": 320,
        "tacos": 6,
        "incluye": "Trompo en vivo · birria con consomé · barra de salsas · churros"
      }
    ]
  };

  var PROMOS_LOCAL = [
    {
      "dia": 2,
      "titulo": "Martes de pastor",
      "texto": "2×1 en tacos al pastor toda la noche.",
      "plato": "taco-pastor"
    },
    {
      "dia": 4,
      "titulo": "Jueves de birria",
      "texto": "20 % menos en el consomé de birria.",
      "plato": "consome"
    },
    {
      "dia": 6,
      "titulo": "Sábado de churros",
      "texto": "2×1 en churros con chocolate.",
      "plato": "churros-chocolate"
    }
  ];

  var REDES = {
    instagram: "M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077",
    facebook: "M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z",
    tiktok: "M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"
  };

  var IMAGEN_VALIDA = /^(img\/menu\/[a-z0-9-]{1,60}|uploads\/platos\/[a-f0-9]{20})\.(webp|jpg|png)$/;

  function rutaImagen(ruta) {
    return IMAGEN_VALIDA.test(ruta || "") ? "../" + ruta : "";
  }

  function dinero(n) {
    var v = Math.round(Number(n || 0) * 100) / 100;
    return "$" + v.toLocaleString("es-MX", { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 });
  }

  function aMinutos(hora) {
    var p = String(hora || "0:0").split(":");
    return Number(p[0]) * 60 + Number(p[1]);
  }

  function fechaISO(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function fechaCorta(iso) {
    var p = String(iso).split("-");
    return Number(p[2]) + " " + MESES[Number(p[1]) - 1];
  }

  function plural(n, uno, varios) {
    return n + " " + (n === 1 ? uno : varios);
  }

  function duracion(min) {
    min = Math.max(0, Math.round(min));
    if (min < 60) return plural(min, "minuto", "minutos");
    var h = Math.floor(min / 60), m = min % 60;
    if (h >= 24) {
      var d = Math.floor(h / 24);
      return plural(d, "día", "días") + (h % 24 ? " " + (h % 24) + " h" : "");
    }
    return h + " h" + (m ? " " + m + " min" : "");
  }

  function cotizar(d, cfg) {
    var paquete = null;
    cfg.paquetes.forEach(function (p) { if (p.id === d.paquete) paquete = p; });
    var invitados = Math.max(0, parseInt(d.invitados, 10) || 0);
    var horas = Math.max(cfg.horas_base, parseInt(d.horas, 10) || cfg.horas_base);
    var km = Math.max(0, parseInt(d.km, 10) || 0);
    var comida = paquete ? invitados * paquete.precio : 0;
    var extra = Math.max(0, horas - cfg.horas_base) * cfg.hora_extra;
    var traslado = Math.max(0, km - cfg.km_incluidos) * cfg.costo_km;
    var total = comida + extra + traslado;
    return {
      comida: comida,
      horas_extra: extra,
      traslado: traslado,
      total: total,
      anticipo: Math.round(total * cfg.anticipo_pct) / 100,
      tacos: paquete ? invitados * paquete.tacos : 0,
      taqueros: Math.max(1, Math.ceil(invitados / 60))
    };
  }

  function svgRed(clave) {
    return REDES[clave] ? '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="' + REDES[clave] + '"/></svg>' : "";
  }

  window.Trompo = {
    DIAS: DIAS,
    CATEGORIAS: CATEGORIAS,
    MENU_LOCAL: MENU_LOCAL,
    RUTA_LOCAL: RUTA_LOCAL,
    EVENTOS_LOCAL: EVENTOS_LOCAL,
    PROMOS_LOCAL: PROMOS_LOCAL,
    rutaImagen: rutaImagen,
    dinero: dinero,
    aMinutos: aMinutos,
    fechaISO: fechaISO,
    fechaCorta: fechaCorta,
    plural: plural,
    duracion: duracion,
    cotizar: cotizar,
    svgRed: svgRed
  };
})();
