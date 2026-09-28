<?php

declare(strict_types=1);
require __DIR__ . '/_negocio.php';

header('X-Robots-Tag: noindex, nofollow');
solo_post();
iniciar_sesion();
verificar_origen();
verificar_csrf();

$d = entrada();
$accion = (string) ($d['accion'] ?? '');
$credenciales = leer_json('admin', []);

$publicas = [
    'estado' => function () use ($credenciales) {
        responder(200, [
            'ok'          => true,
            'configurado' => !empty($credenciales['hash']),
            'sesion'      => !empty($credenciales['hash']) && !empty($_SESSION['admin']) && time() - (int) ($_SESSION['admin_actividad'] ?? 0) <= 7200,
            'local'       => es_local(),
        ]);
    },
    'setup' => function () use ($d, $credenciales) {
        if (!empty($credenciales['hash'])) {
            error_json(409, 'La cuenta de administrador ya existe.');
        }
        if (!es_local()) {
            error_json(403, 'La cuenta solo se puede crear desde el mismo equipo del servidor.');
        }
        $usuario = (string) ($d['usuario'] ?? '');
        $clave = (string) ($d['clave'] ?? '');
        if (!preg_match('/^[a-zA-Z0-9_.-]{3,30}$/', $usuario)) {
            error_json(422, 'El usuario debe tener de 3 a 30 letras, números, punto o guion.');
        }
        if (strlen($clave) < 10 || strlen($clave) > 200) {
            error_json(422, 'La contraseña debe tener al menos 10 caracteres.');
        }
        guardar_json('admin', ['usuario' => $usuario, 'hash' => password_hash($clave, PASSWORD_DEFAULT), 'creado' => date('c')]);
        session_regenerate_id(true);
        $_SESSION['admin'] = true;
        $_SESSION['admin_actividad'] = time();
        responder(200, ['ok' => true]);
    },
    'login' => function () use ($d, $credenciales) {
        if (empty($credenciales['hash'])) {
            error_json(409, 'Primero crea la cuenta de administrador.');
        }
        if (!limitar_por_ip('login', 5, 900)) {
            error_json(429, 'Demasiados intentos. Espera 15 minutos.');
        }
        $usuario = (string) ($d['usuario'] ?? '');
        $clave = (string) ($d['clave'] ?? '');
        if (!hash_equals($credenciales['usuario'], $usuario) || !password_verify($clave, $credenciales['hash'])) {
            usleep(400000);
            error_json(401, 'Usuario o contraseña incorrectos.');
        }
        session_regenerate_id(true);
        $_SESSION['admin'] = true;
        $_SESSION['admin_actividad'] = time();
        responder(200, ['ok' => true]);
    },
    'logout' => function () {
        unset($_SESSION['admin'], $_SESSION['admin_actividad']);
        session_regenerate_id(true);
        responder(200, ['ok' => true]);
    },
];

if (isset($publicas[$accion])) {
    $publicas[$accion]();
}
if (empty($credenciales['hash'])) {
    unset($_SESSION['admin']);
    error_json(401, 'Primero crea la cuenta de administrador.', ['sesion' => false]);
}
requerir_admin();

function slug(string $texto): string
{
    $t = iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $texto) ?: $texto;
    $t = strtolower(preg_replace('/[^a-zA-Z0-9]+/', '-', $t) ?? '');
    return trim(substr($t, 0, 50), '-') ?: 'item';
}

function biblioteca_fotos(): array
{
    $lista = [];
    foreach (glob(RUTA_FOTOS . '/*.*') ?: [] as $f) {
        $ruta = 'img/menu/' . basename($f);
        if (imagen_valida($ruta)) {
            $lista[] = $ruta;
        }
    }
    sort($lista);
    return $lista;
}

function guardar_imagen(array $archivo): string
{
    if (($archivo['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        error_json(422, 'No se pudo subir la imagen.');
    }
    if ($archivo['size'] > 3 * 1024 * 1024) {
        error_json(422, 'La imagen pesa más de 3 MB.');
    }
    $info = @getimagesize($archivo['tmp_name']);
    $ext = $info ? (['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'][$info['mime']] ?? null) : null;
    if (!$ext) {
        error_json(422, 'La imagen debe ser JPG, PNG o WEBP.');
    }
    if (!is_dir(RUTA_SUBIDAS)) {
        mkdir(RUTA_SUBIDAS, 0755, true);
    }
    $nombre = bin2hex(random_bytes(10)) . '.' . $ext;
    if (!move_uploaded_file($archivo['tmp_name'], RUTA_SUBIDAS . '/' . $nombre)) {
        error_json(500, 'No se pudo guardar la imagen.');
    }
    return 'uploads/platos/' . $nombre;
}

function borrar_subida(string $ruta): void
{
    if (preg_match('/^uploads\/platos\/([a-f0-9]{20}\.(jpg|png|webp))$/', $ruta, $m) && is_file(RUTA_SUBIDAS . '/' . $m[1])) {
        unlink(RUTA_SUBIDAS . '/' . $m[1]);
    }
}

function numero($valor, float $min, float $max): float
{
    $n = is_numeric($valor) ? (float) $valor : $min;
    return max($min, min($max, $n));
}

function atrasado(array $p, array $config): bool
{
    if (!auto_activa($config, 'aviso_retraso') || !in_array($p['estado'], EN_FILA, true)) {
        return false;
    }
    $limite = new DateTimeImmutable(substr($p['fecha'], 0, 10) . ' ' . $p['recoger']);
    return ahora() > $limite;
}

function pedido_admin(array $p, array $config): array
{
    return $p + ['atrasado' => atrasado($p, $config)];
}

function uso_por_fecha(array $pedidos, array $platos): array
{
    $uso = [];
    foreach ($pedidos as $p) {
        if ($p['estado'] === 'cancelado') {
            continue;
        }
        $f = substr($p['fecha'], 0, 10);
        foreach ($p['items'] as $it) {
            foreach ($platos[$it['id']]['receta'] ?? [] as $ing => $cant) {
                $uso[$f][$ing] = ($uso[$f][$ing] ?? 0) + $cant * $it['cantidad'];
            }
        }
    }
    return $uso;
}

function prep_sugerida(string $fecha, array $pedidos, array $platos, array $ingredientes, array $config): array
{
    $dia = (int) (new DateTimeImmutable($fecha))->format('w');
    $hoy = ahora()->format('Y-m-d');
    $uso = uso_por_fecha($pedidos, $platos);
    $fechas = [];
    foreach (array_keys($uso) as $f) {
        if ($f < $hoy && (int) (new DateTimeImmutable($f))->format('w') === $dia) {
            $fechas[] = $f;
        }
    }
    rsort($fechas);
    $fechas = array_slice($fechas, 0, 4);
    $margen = 1 + (int) $config['margen_prep'] / 100;
    $lista = [];
    foreach ($ingredientes as $id => $ing) {
        $suma = 0;
        foreach ($fechas as $f) {
            $suma += $uso[$f][$id] ?? 0;
        }
        $promedio = $fechas ? $suma / count($fechas) : 0;
        if ($promedio <= 0) {
            continue;
        }
        $sugerido = ceil($promedio * $margen);
        $lista[] = [
            'id' => $id,
            'nombre' => $ing['nombre'],
            'unidad' => $ing['unidad'],
            'promedio' => round($promedio, 1),
            'sugerido' => $sugerido,
            'stock' => (float) $ing['stock'],
            'faltan' => max(0, $sugerido - (float) $ing['stock']),
        ];
    }
    usort($lista, fn($a, $b) => $b['faltan'] <=> $a['faltan'] ?: strcmp($a['nombre'], $b['nombre']));
    return ['fecha' => $fecha, 'dia' => DIAS[$dia], 'muestras' => $fechas, 'margen' => (int) $config['margen_prep'], 'lista' => $lista];
}

function validar_parada(array $x, bool $exigirLugar): array
{
    $activo = !empty($x['activo']);
    $r = [
        'activo' => $activo,
        'lugar' => limpiar($x['lugar'] ?? '', 60),
        'direccion' => limpiar($x['direccion'] ?? '', 120),
        'inicio' => (string) ($x['inicio'] ?? '00:00'),
        'fin' => (string) ($x['fin'] ?? '00:00'),
    ];
    if ($activo || $exigirLugar) {
        if (mb_strlen($r['lugar']) < 3) {
            error_json(422, 'Cada parada activa necesita un nombre de lugar.');
        }
        if (!hora_valida($r['inicio']) || !hora_valida($r['fin']) || a_minutos($r['fin']) <= a_minutos($r['inicio']) + 30) {
            error_json(422, 'Revisa los horarios: la salida debe ser al menos 30 minutos después de la llegada, el mismo día.');
        }
    } else {
        $r['lugar'] = $r['lugar'] ?: 'Día de descanso';
    }
    return $r;
}

$acciones = [
    'resumen' => function () {
        $config = config();
        $pedidos = leer_json('pedidos', []);
        $eventos = leer_json('eventos', []);
        $platos = indice(leer_json('platos', []));
        $ingredientes = leer_json('ingredientes', []);
        $hoy = ahora()->format('Y-m-d');
        $validos = fn($l) => array_filter($l, fn($p) => $p['estado'] !== 'cancelado');

        $deHoy = $validos(pedidos_de($pedidos, $hoy));
        $ventas = array_sum(array_column($deHoy, 'total'));
        $piezas = 0;
        foreach ($deHoy as $p) {
            foreach ($p['items'] as $it) {
                if (($platos[$it['id']]['categoria'] ?? '') === 'tacos') {
                    $piezas += $it['cantidad'];
                }
            }
        }

        $serie = [];
        for ($i = 13; $i >= 0; $i--) {
            $f = ahora()->modify("-$i day");
            $lista = $validos(pedidos_de($pedidos, $f->format('Y-m-d')));
            $serie[] = ['fecha' => $f->format('Y-m-d'), 'etiqueta' => mb_substr(DIAS[(int) $f->format('w')], 0, 2) . ' ' . $f->format('j'), 'ventas' => array_sum(array_column($lista, 'total')), 'pedidos' => count($lista)];
        }

        $top = [];
        foreach (mas_pedidos($pedidos, 7, 5) as $id => $cant) {
            $top[] = ['nombre' => $platos[$id]['nombre'] ?? $id, 'cantidad' => $cant];
        }

        $alertas = [];
        foreach ($ingredientes as $ing) {
            if ($ing['stock'] <= 0) {
                $alertas[] = ['nivel' => 'alta', 'texto' => "Sin {$ing['nombre']}: los platillos que lo usan ya aparecen agotados.", 'vista' => 'inventario'];
            } elseif ($ing['stock'] <= $ing['minimo']) {
                $alertas[] = ['nivel' => 'media', 'texto' => "Queda poco {$ing['nombre']} ({$ing['stock']} {$ing['unidad']}).", 'vista' => 'inventario'];
            }
        }
        $atrasados = count(array_filter(pedidos_de($pedidos, $hoy), fn($p) => atrasado($p, $config)));
        if ($atrasados) {
            $alertas[] = ['nivel' => 'alta', 'texto' => $atrasados === 1 ? '1 pedido pasó su hora de recogida.' : "$atrasados pedidos pasaron su hora de recogida.", 'vista' => 'fila'];
        }
        $pendientes = array_filter($eventos, fn($e) => $e['estado'] === 'pendiente' && $e['fecha'] >= $hoy);
        if ($pendientes) {
            $alertas[] = ['nivel' => 'media', 'texto' => count($pendientes) === 1 ? '1 solicitud de evento espera respuesta.' : count($pendientes) . ' solicitudes de evento esperan respuesta.', 'vista' => 'eventos'];
        }

        $proximos = array_values(array_filter($eventos, fn($e) => $e['estado'] === 'confirmado' && $e['fecha'] >= $hoy));
        usort($proximos, fn($a, $b) => strcmp($a['fecha'], $b['fecha']));

        responder(200, [
            'ok' => true,
            'hoy' => estado_hoy($pedidos, $config, ruta(), $eventos),
            'kpi' => [
                'ventas' => round($ventas, 2),
                'pedidos' => count($deHoy),
                'ticket' => $deHoy ? round($ventas / count($deHoy), 2) : 0,
                'tacos' => $piezas,
            ],
            'serie' => $serie,
            'top' => $top,
            'alertas' => $alertas,
            'proximos' => array_slice($proximos, 0, 4),
        ]);
    },

    'fila' => function () {
        $config = config();
        $pedidos = leer_json('pedidos', []);
        $hoy = ahora()->format('Y-m-d');
        $lista = array_map(fn($p) => pedido_admin($p, $config), pedidos_de($pedidos, $hoy));
        usort($lista, fn($a, $b) => strcmp($a['recoger'], $b['recoger']) ?: $a['numero'] <=> $b['numero']);
        responder(200, ['ok' => true, 'pedidos_activos' => (bool) $config['pedidos_activos'], 'hoy' => estado_hoy($pedidos, $config, ruta(), leer_json('eventos', [])), 'pedidos' => $lista]);
    },

    'avanzar' => function () use ($d) {
        $id = (string) ($d['id'] ?? '');
        $estado = (string) ($d['estado'] ?? '');
        if (!in_array($estado, ESTADOS, true)) {
            error_json(422, 'Estado no válido.');
        }
        con_bloqueo(function () use ($id, $estado) {
            $pedidos = leer_json('pedidos', []);
            foreach ($pedidos as &$p) {
                if ($p['id'] !== $id) {
                    continue;
                }
                if (in_array($p['estado'], ['entregado', 'cancelado'], true)) {
                    error_json(409, 'Ese pedido ya está cerrado.');
                }
                if ($estado === 'cancelado' && auto_activa(config(), 'agotado_auto')) {
                    $ingredientes = indice(leer_json('ingredientes', []));
                    mover_ingredientes($ingredientes, $p['items'], indice(leer_json('platos', [])), 1);
                    guardar_json('ingredientes', array_values($ingredientes));
                }
                $p['estado'] = $estado;
                $p['historial'][] = ['estado' => $estado, 'fecha' => ahora()->format('c')];
                guardar_json('pedidos', $pedidos);
                return;
            }
            error_json(404, 'No encontramos ese pedido.');
        });
        responder(200, ['ok' => true]);
    },

    'pedidos' => function () use ($d) {
        $config = config();
        $desde = fecha_valida($d['desde'] ?? null) ? $d['desde'] : ahora()->modify('-6 day')->format('Y-m-d');
        $hasta = fecha_valida($d['hasta'] ?? null) ? $d['hasta'] : ahora()->format('Y-m-d');
        $estado = in_array($d['estado'] ?? '', ESTADOS, true) ? $d['estado'] : '';
        $buscar = mb_strtolower(limpiar($d['buscar'] ?? '', 40));
        $lista = array_filter(leer_json('pedidos', []), function ($p) use ($desde, $hasta, $estado, $buscar) {
            $f = substr($p['fecha'], 0, 10);
            if ($f < $desde || $f > $hasta || ($estado && $p['estado'] !== $estado)) {
                return false;
            }
            return $buscar === '' || str_contains(mb_strtolower($p['cliente']['nombre']), $buscar) || (string) $p['numero'] === $buscar;
        });
        usort($lista, fn($a, $b) => strcmp($b['fecha'], $a['fecha']));
        $validos = array_filter($lista, fn($p) => $p['estado'] !== 'cancelado');
        responder(200, [
            'ok' => true,
            'total' => count($lista),
            'ventas' => round(array_sum(array_column($validos, 'total')), 2),
            'pedidos' => array_map(fn($p) => pedido_admin($p, $config), array_slice($lista, 0, 300)),
        ]);
    },

    'exportar' => function () use ($d) {
        $desde = fecha_valida($d['desde'] ?? null) ? $d['desde'] : '0000-00-00';
        $hasta = fecha_valida($d['hasta'] ?? null) ? $d['hasta'] : '9999-12-31';
        $filas = [['Fecha', 'Turno', 'Recoger', 'Parada', 'Cliente', 'Teléfono', 'Productos', 'Total', 'Estado']];
        foreach (leer_json('pedidos', []) as $p) {
            $f = substr($p['fecha'], 0, 10);
            if ($f < $desde || $f > $hasta) {
                continue;
            }
            $productos = implode(' | ', array_map(fn($i) => $i['cantidad'] . 'x ' . $i['nombre'], $p['items']));
            $filas[] = [$f, $p['numero'], $p['recoger'], $p['parada'], $p['cliente']['nombre'], $p['cliente']['telefono'], $productos, $p['total'], $p['estado']];
        }
        $salida = fopen('php://temp', 'r+');
        foreach ($filas as $fila) {
            fputcsv($salida, array_map(fn($v) => seguro_para_csv((string) $v), $fila));
        }
        rewind($salida);
        responder(200, ['ok' => true, 'csv' => "\u{FEFF}" . stream_get_contents($salida)]);
    },

    'platos' => function () {
        $config = config();
        $ingredientes = indice(leer_json('ingredientes', []));
        $lista = array_map(fn($p) => $p + ['porciones' => porciones($p, $ingredientes), 'agotado_auto' => auto_activa($config, 'agotado_auto') && porciones($p, $ingredientes) === 0], leer_json('platos', []));
        responder(200, ['ok' => true, 'platos' => $lista, 'categorias' => CATEGORIAS, 'fotos' => biblioteca_fotos(), 'ingredientes' => array_values($ingredientes)]);
    },

    'guardar_plato' => function () use ($d) {
        $nombre = limpiar($d['nombre'] ?? '', 60);
        $categoria = (string) ($d['categoria'] ?? '');
        $precio = (float) ($d['precio'] ?? 0);
        if (mb_strlen($nombre) < 3) {
            error_json(422, 'El nombre necesita al menos 3 caracteres.', ['errores' => ['nombre' => 'Muy corto.']]);
        }
        if (!isset(CATEGORIAS[$categoria])) {
            error_json(422, 'Elige una categoría.');
        }
        if ($precio < 5 || $precio > 2000) {
            error_json(422, 'El precio debe estar entre $5 y $2,000.', ['errores' => ['precio' => 'Fuera de rango.']]);
        }
        $receta = [];
        $crudo = json_decode((string) ($d['receta'] ?? '[]'), true);
        $ingredientes = indice(leer_json('ingredientes', []));
        foreach (is_array($crudo) ? $crudo : [] as $ing => $cant) {
            if (isset($ingredientes[$ing]) && is_numeric($cant) && $cant > 0) {
                $receta[$ing] = round(min(5000, (float) $cant), 2);
            }
        }
        $nueva = !empty($_FILES['imagen']['name']) ? guardar_imagen($_FILES['imagen']) : null;
        $foto = (string) ($d['foto'] ?? '');

        $plato = con_bloqueo(function () use ($d, $nombre, $categoria, $precio, $receta, $nueva, $foto) {
            $platos = leer_json('platos', []);
            $id = (string) ($d['id'] ?? '');
            $pos = null;
            foreach ($platos as $i => $p) {
                if ($p['id'] === $id) {
                    $pos = $i;
                }
            }
            $actual = $pos !== null ? $platos[$pos] : ['id' => '', 'creado' => ahora()->format('c'), 'imagen' => '', 'disponible' => true];
            if ($pos === null) {
                $base = slug($nombre);
                $nuevoId = $base;
                $n = 2;
                while (in_array($nuevoId, array_column($platos, 'id'), true)) {
                    $nuevoId = $base . '-' . $n++;
                }
                $actual['id'] = $nuevoId;
            }
            $imagen = $actual['imagen'];
            if ($nueva) {
                borrar_subida($imagen);
                $imagen = $nueva;
            } elseif ($foto !== '' && imagen_valida($foto)) {
                if ($foto !== $imagen) {
                    borrar_subida($imagen);
                }
                $imagen = $foto;
            }
            $plato = array_replace($actual, [
                'nombre' => $nombre,
                'categoria' => $categoria,
                'precio' => round($precio, 2),
                'descripcion' => limpiar($d['descripcion'] ?? '', 180),
                'imagen' => $imagen,
                'picante' => (int) numero($d['picante'] ?? 0, 0, 3),
                'vegetariano' => ($d['vegetariano'] ?? '') === '1',
                'favorito' => ($d['favorito'] ?? '') === '1',
                'activo' => ($d['activo'] ?? '1') === '1',
                'receta' => $receta,
            ]);
            if ($pos === null) {
                $platos[] = $plato;
            } else {
                $platos[$pos] = $plato;
            }
            guardar_json('platos', $platos);
            return $plato;
        });
        responder(200, ['ok' => true, 'plato' => $plato]);
    },

    'eliminar_plato' => function () use ($d) {
        $id = (string) ($d['id'] ?? '');
        con_bloqueo(function () use ($id) {
            $platos = leer_json('platos', []);
            foreach ($platos as $p) {
                if ($p['id'] === $id) {
                    borrar_subida($p['imagen'] ?? '');
                }
            }
            guardar_json('platos', array_values(array_filter($platos, fn($p) => $p['id'] !== $id)));
        });
        responder(200, ['ok' => true]);
    },

    'disponible' => function () use ($d) {
        $id = (string) ($d['id'] ?? '');
        $valor = !empty($d['disponible']);
        con_bloqueo(function () use ($id, $valor) {
            $platos = leer_json('platos', []);
            foreach ($platos as &$p) {
                if ($p['id'] === $id) {
                    $p['disponible'] = $valor;
                }
            }
            guardar_json('platos', $platos);
        });
        responder(200, ['ok' => true]);
    },

    'inventario' => function () use ($d) {
        $config = config();
        $platos = indice(leer_json('platos', []));
        $ingredientes = indice(leer_json('ingredientes', []));
        $usos = [];
        foreach ($platos as $p) {
            foreach (array_keys($p['receta'] ?? []) as $ing) {
                $usos[$ing][] = $p['nombre'];
            }
        }
        $lista = [];
        foreach ($ingredientes as $id => $ing) {
            $lista[] = $ing + ['usado_en' => $usos[$id] ?? []];
        }
        $fecha = fecha_valida($d['fecha'] ?? null) ? $d['fecha'] : ahora()->modify('+1 day')->format('Y-m-d');
        responder(200, [
            'ok' => true,
            'ingredientes' => $lista,
            'unidades' => UNIDADES,
            'prep' => auto_activa($config, 'prep_sugerida') ? prep_sugerida($fecha, leer_json('pedidos', []), $platos, $ingredientes, $config) : null,
        ]);
    },

    'stock' => function () use ($d) {
        $id = (string) ($d['id'] ?? '');
        $modo = ($d['modo'] ?? 'fijar') === 'sumar' ? 'sumar' : 'fijar';
        $valor = numero($d['valor'] ?? 0, -100000, 100000);
        $minimo = isset($d['minimo']) ? numero($d['minimo'], 0, 100000) : null;
        con_bloqueo(function () use ($id, $modo, $valor, $minimo) {
            $lista = leer_json('ingredientes', []);
            foreach ($lista as &$i) {
                if ($i['id'] === $id) {
                    $i['stock'] = round(max(0, $modo === 'sumar' ? $i['stock'] + $valor : $valor), 2);
                    if ($minimo !== null) {
                        $i['minimo'] = $minimo;
                    }
                    guardar_json('ingredientes', $lista);
                    return;
                }
            }
            error_json(404, 'No encontramos ese ingrediente.');
        });
        responder(200, ['ok' => true]);
    },

    'surtir_prep' => function () use ($d) {
        $fecha = fecha_valida($d['fecha'] ?? null) ? $d['fecha'] : ahora()->modify('+1 day')->format('Y-m-d');
        $n = con_bloqueo(function () use ($fecha) {
            $platos = indice(leer_json('platos', []));
            $ingredientes = indice(leer_json('ingredientes', []));
            $prep = prep_sugerida($fecha, leer_json('pedidos', []), $platos, $ingredientes, config());
            $n = 0;
            foreach ($prep['lista'] as $x) {
                if ($x['faltan'] > 0) {
                    $ingredientes[$x['id']]['stock'] = $x['sugerido'];
                    $n++;
                }
            }
            guardar_json('ingredientes', array_values($ingredientes));
            return $n;
        });
        responder(200, ['ok' => true, 'surtidos' => $n]);
    },

    'nuevo_ingrediente' => function () use ($d) {
        $nombre = limpiar($d['nombre'] ?? '', 40);
        $unidad = in_array($d['unidad'] ?? '', UNIDADES, true) ? $d['unidad'] : 'pz';
        if (mb_strlen($nombre) < 2) {
            error_json(422, 'Escribe el nombre del ingrediente.');
        }
        con_bloqueo(function () use ($nombre, $unidad, $d) {
            $lista = leer_json('ingredientes', []);
            $id = slug($nombre);
            if (in_array($id, array_column($lista, 'id'), true)) {
                error_json(409, 'Ese ingrediente ya existe.');
            }
            $lista[] = ['id' => $id, 'nombre' => $nombre, 'unidad' => $unidad, 'stock' => numero($d['stock'] ?? 0, 0, 100000), 'minimo' => numero($d['minimo'] ?? 0, 0, 100000)];
            guardar_json('ingredientes', $lista);
        });
        responder(200, ['ok' => true]);
    },

    'eliminar_ingrediente' => function () use ($d) {
        $id = (string) ($d['id'] ?? '');
        con_bloqueo(function () use ($id) {
            guardar_json('ingredientes', array_values(array_filter(leer_json('ingredientes', []), fn($i) => $i['id'] !== $id)));
            $platos = leer_json('platos', []);
            foreach ($platos as &$p) {
                unset($p['receta'][$id]);
            }
            guardar_json('platos', $platos);
        });
        responder(200, ['ok' => true]);
    },

    'ruta' => function () {
        $config = config();
        $ruta = ruta();
        $eventos = leer_json('eventos', []);
        $hoy = ahora()->format('Y-m-d');
        $ruta['excepciones'] = array_values(array_filter($ruta['excepciones'], fn($x) => $x['fecha'] >= $hoy));
        usort($ruta['excepciones'], fn($a, $b) => strcmp($a['fecha'], $b['fecha']));
        responder(200, ['ok' => true, 'ruta' => $ruta, 'dias' => DIAS, 'proxima' => semana_publica($ruta, $eventos, $config)]);
    },

    'guardar_ruta' => function () use ($d) {
        if (!is_array($d['semana'] ?? null) || count($d['semana']) !== 7) {
            error_json(422, 'Faltan días de la semana.');
        }
        $semana = [];
        foreach (array_values($d['semana']) as $i => $x) {
            $semana[] = ['dia' => $i] + validar_parada(is_array($x) ? $x : [], false);
        }
        con_bloqueo(function () use ($semana) {
            $ruta = ruta();
            $ruta['semana'] = $semana;
            guardar_json('ruta', $ruta);
        });
        responder(200, ['ok' => true]);
    },

    'excepcion' => function () use ($d) {
        $fecha = (string) ($d['fecha'] ?? '');
        if (!fecha_valida($fecha) || $fecha < ahora()->format('Y-m-d')) {
            error_json(422, 'Elige una fecha de hoy en adelante.');
        }
        $tipo = ($d['tipo'] ?? '') === 'cerrado' ? 'cerrado' : 'cambio';
        $x = ['fecha' => $fecha, 'tipo' => $tipo, 'nota' => limpiar($d['nota'] ?? '', 120)];
        if ($tipo === 'cambio') {
            $x += validar_parada(['activo' => true] + $d, true);
            unset($x['activo']);
        }
        con_bloqueo(function () use ($x) {
            $ruta = ruta();
            $ruta['excepciones'] = array_values(array_filter($ruta['excepciones'], fn($e) => $e['fecha'] !== $x['fecha']));
            $ruta['excepciones'][] = $x;
            guardar_json('ruta', $ruta);
        });
        responder(200, ['ok' => true]);
    },

    'quitar_excepcion' => function () use ($d) {
        $fecha = (string) ($d['fecha'] ?? '');
        con_bloqueo(function () use ($fecha) {
            $ruta = ruta();
            $ruta['excepciones'] = array_values(array_filter($ruta['excepciones'], fn($e) => $e['fecha'] !== $fecha));
            guardar_json('ruta', $ruta);
        });
        responder(200, ['ok' => true]);
    },

    'eventos' => function () {
        $config = config();
        $eventos = leer_json('eventos', []);
        $confirmados = [];
        foreach ($eventos as $e) {
            if ($e['estado'] === 'confirmado') {
                $confirmados[$e['fecha']][] = $e['id'];
            }
        }
        $hoy = ahora()->format('Y-m-d');
        $lista = array_map(function ($e) use ($confirmados, $config) {
            $otros = array_diff($confirmados[$e['fecha']] ?? [], [$e['id']]);
            return $e + ['conflicto' => (bool) $otros, 'paquete_nombre' => paquete($config, $e['paquete'])['nombre'] ?? $e['paquete']];
        }, $eventos);
        $orden = ['pendiente' => 0, 'confirmado' => 1, 'rechazado' => 2];
        usort($lista, function ($a, $b) use ($orden, $hoy) {
            $pa = $a['fecha'] < $hoy ? 3 : $orden[$a['estado']];
            $pb = $b['fecha'] < $hoy ? 3 : $orden[$b['estado']];
            return $pa <=> $pb ?: strcmp($a['fecha'], $b['fecha']);
        });
        responder(200, ['ok' => true, 'eventos' => $lista, 'hoy' => $hoy]);
    },

    'evento_estado' => function () use ($d) {
        $id = (string) ($d['id'] ?? '');
        $estado = (string) ($d['estado'] ?? '');
        if (!in_array($estado, ['pendiente', 'confirmado', 'rechazado'], true)) {
            error_json(422, 'Estado no válido.');
        }
        con_bloqueo(function () use ($id, $estado) {
            $eventos = leer_json('eventos', []);
            foreach ($eventos as &$e) {
                if ($e['id'] !== $id) {
                    continue;
                }
                if ($estado === 'confirmado') {
                    foreach ($eventos as $o) {
                        if ($o['id'] !== $id && $o['estado'] === 'confirmado' && $o['fecha'] === $e['fecha']) {
                            error_json(409, "Ya tienes confirmado {$o['folio']} ese mismo día. Solo hay un camión.");
                        }
                    }
                }
                $e['estado'] = $estado;
                $e['actualizado'] = ahora()->format('c');
                guardar_json('eventos', $eventos);
                return;
            }
            error_json(404, 'No encontramos esa solicitud.');
        });
        responder(200, ['ok' => true]);
    },

    'eliminar_evento' => function () use ($d) {
        $id = (string) ($d['id'] ?? '');
        con_bloqueo(fn() => guardar_json('eventos', array_values(array_filter(leer_json('eventos', []), fn($e) => $e['id'] !== $id))));
        responder(200, ['ok' => true]);
    },

    'config' => function () {
        $platos = array_map(fn($p) => ['id' => $p['id'], 'nombre' => $p['nombre']], leer_json('platos', []));
        responder(200, ['ok' => true, 'config' => config(), 'automatizaciones' => AUTOMATIZACIONES, 'dias' => DIAS, 'platos' => $platos]);
    },

    'guardar_config' => function () use ($d) {
        $actual = config();
        $c = $actual;
        $limites = [
            'capacidad_franja' => [1, 60], 'minutos_franja' => [5, 30], 'anticipacion_min' => [0, 120], 'prep_base' => [1, 60],
            'min_por_pedido' => [1, 30], 'taqueros' => [1, 8], 'max_piezas' => [5, 200], 'umbral_pocos' => [0, 100], 'margen_prep' => [0, 100],
        ];
        foreach ($limites as $k => [$min, $max]) {
            if (isset($d[$k])) {
                $c[$k] = (int) numero($d[$k], $min, $max);
            }
        }
        if (isset($d['pedidos_activos'])) {
            $c['pedidos_activos'] = (bool) $d['pedidos_activos'];
        }
        if (is_array($d['aviso'] ?? null)) {
            $c['aviso'] = ['activo' => !empty($d['aviso']['activo']), 'texto' => limpiar($d['aviso']['texto'] ?? '', 140)];
        }
        if (is_array($d['auto'] ?? null)) {
            foreach (array_keys(AUTOMATIZACIONES) as $k) {
                if (array_key_exists($k, $d['auto'])) {
                    $c['auto'][$k] = (bool) $d['auto'][$k];
                }
            }
        }
        if (is_array($d['promos'] ?? null)) {
            $ids = array_column(leer_json('platos', []), 'id');
            $promos = [];
            foreach ($d['promos'] as $p) {
                $dia = (int) ($p['dia'] ?? -1);
                if ($dia < 0 || $dia > 6 || !in_array($p['plato'] ?? '', $ids, true)) {
                    continue;
                }
                $promos[$dia] = [
                    'dia' => $dia,
                    'titulo' => limpiar($p['titulo'] ?? '', 40) ?: DIAS[$dia],
                    'texto' => limpiar($p['texto'] ?? '', 120),
                    'plato' => $p['plato'],
                    'tipo' => ($p['tipo'] ?? '') === 'pct' ? 'pct' : '2x1',
                    'valor' => (int) numero($p['valor'] ?? 0, 0, 90),
                ];
            }
            ksort($promos);
            $c['promos'] = array_values($promos);
        }
        if (is_array($d['eventos'] ?? null)) {
            $e = $d['eventos'];
            foreach (['minimo' => [10, 1000], 'maximo' => [20, 2000], 'horas_base' => [1, 8], 'hora_extra' => [0, 20000], 'km_incluidos' => [0, 200], 'costo_km' => [0, 500], 'anticipo_pct' => [0, 100], 'anticipacion_dias' => [0, 60]] as $k => [$min, $max]) {
                if (isset($e[$k])) {
                    $c['eventos'][$k] = numero($e[$k], $min, $max);
                }
            }
            if ($c['eventos']['maximo'] <= $c['eventos']['minimo']) {
                error_json(422, 'El máximo de invitados debe ser mayor que el mínimo.');
            }
            if (is_array($e['precios'] ?? null)) {
                foreach ($c['eventos']['paquetes'] as &$p) {
                    if (isset($e['precios'][$p['id']])) {
                        $p['precio'] = numero($e['precios'][$p['id']], 50, 5000);
                    }
                }
                unset($p);
            }
        }
        guardar_json('config', $c);
        responder(200, ['ok' => true, 'config' => config()]);
    },
];

if (!isset($acciones[$accion])) {
    error_json(400, 'Acción no válida.');
}
$acciones[$accion]();
