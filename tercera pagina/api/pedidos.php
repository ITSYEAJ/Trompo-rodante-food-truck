<?php

declare(strict_types=1);
require __DIR__ . '/_negocio.php';

solo_post();
iniciar_sesion();
verificar_origen();
verificar_csrf();

$d = entrada();

if (!empty($d['sitio_web'])) {
    responder(200, ['ok' => true, 'numero' => 0, 'codigo' => '----']);
}
if (time() - (int) ($_SESSION['ultimo_pedido'] ?? 0) < 20) {
    error_json(429, 'Espera unos segundos antes de hacer otro pedido.');
}
if (!limitar_por_ip('pedido', 6, 3600)) {
    error_json(429, 'Hiciste muchos pedidos seguidos. Intenta más tarde o llámanos.');
}

$nombre = limpiar($d['nombre'] ?? '', 60);
$telefono = preg_replace('/\D/', '', (string) ($d['telefono'] ?? '')) ?? '';
$recoger = (string) ($d['recoger'] ?? '');
$nota = limpiar($d['nota'] ?? '', 160);
$errores = [];

if (mb_strlen($nombre) < 2) {
    $errores['nombre'] = 'Escribe tu nombre para llamarte en la ventanilla.';
}
if (strlen($telefono) !== 10) {
    $errores['telefono'] = 'El teléfono debe tener 10 dígitos.';
}
if (!hora_valida($recoger)) {
    $errores['recoger'] = 'Elige una hora para recoger.';
}
if (!is_array($d['items'] ?? null) || !$d['items']) {
    error_json(422, 'Tu pedido está vacío.');
}
if ($errores) {
    error_json(422, 'Revisa los datos marcados.', ['errores' => $errores]);
}

$resultado = con_bloqueo(function () use ($d, $nombre, $telefono, $recoger, $nota) {
    $config = config();
    $ruta = ruta();
    $eventos = leer_json('eventos', []);
    $pedidos = leer_json('pedidos', []);
    $platos = indice(leer_json('platos', []));
    $ingredientes = indice(leer_json('ingredientes', []));
    $hoy = estado_hoy($pedidos, $config, $ruta, $eventos);

    if (!$hoy['acepta_pedidos']) {
        error_json(409, 'En este momento no estamos recibiendo pedidos en línea.');
    }
    $franja = null;
    foreach ($hoy['franjas'] as $f) {
        if ($f['hora'] === $recoger) {
            $franja = $f;
        }
    }
    if (!$franja) {
        error_json(409, 'Esa hora ya no está disponible. Elige otra.', ['errores' => ['recoger' => 'Elige otra hora.']]);
    }
    if ($franja['lleno']) {
        error_json(409, 'Esa franja se llenó hace un momento. Elige la siguiente.', ['errores' => ['recoger' => 'Franja llena.']]);
    }

    $items = [];
    $piezas = 0;
    foreach ($d['items'] as $linea) {
        $id = (string) ($linea['id'] ?? '');
        $cantidad = (int) ($linea['cantidad'] ?? 0);
        $p = $platos[$id] ?? null;
        if (!$p || empty($p['activo']) || empty($p['disponible']) || $cantidad < 1 || $cantidad > 30) {
            error_json(422, 'Uno de los productos ya no está disponible. Actualiza la página.');
        }
        $piezas += $cantidad;
        $items[$id] = ['id' => $id, 'cantidad' => ($items[$id]['cantidad'] ?? 0) + $cantidad];
    }
    if ($piezas > (int) $config['max_piezas']) {
        error_json(422, 'Para más de ' . (int) $config['max_piezas'] . ' piezas escríbenos por WhatsApp y lo preparamos aparte.');
    }
    $items = array_values($items);

    if (auto_activa($config, 'agotado_auto') && ($falta = faltante($items, $platos, $ingredientes))) {
        error_json(409, "Se nos acabó: $falta. Quita ese producto e inténtalo de nuevo.");
    }

    $promo = $hoy['promo'];
    $lineas = [];
    $total = 0.0;
    $ahorro = 0.0;
    foreach ($items as $it) {
        $p = $platos[$it['id']];
        $precio = precio_linea($p, $it['cantidad'], $promo);
        $lineas[] = ['id' => $p['id'], 'nombre' => $p['nombre'], 'precio' => (float) $p['precio'], 'cantidad' => $it['cantidad'], 'descuento' => $precio['descuento'], 'total' => $precio['total']];
        $total += $precio['total'];
        $ahorro += $precio['descuento'];
    }

    $pedidosHoy = pedidos_de($pedidos, $hoy['fecha']);
    $numero = $pedidosHoy ? max(array_column($pedidosHoy, 'numero')) + 1 : 1;
    $codigo = '';
    $letras = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    for ($i = 0; $i < 4; $i++) {
        $codigo .= $letras[random_int(0, strlen($letras) - 1)];
    }
    $fecha = ahora()->format('c');
    $pedido = [
        'id' => nuevo_id('p_'),
        'numero' => $numero,
        'codigo' => $codigo,
        'fecha' => $fecha,
        'recoger' => $recoger,
        'parada' => $hoy['parada']['lugar'],
        'cliente' => ['nombre' => $nombre, 'telefono' => $telefono],
        'items' => $lineas,
        'ahorro' => round($ahorro, 2),
        'total' => round($total, 2),
        'nota' => $nota,
        'estado' => 'recibido',
        'historial' => [['estado' => 'recibido', 'fecha' => $fecha]],
    ];
    if (auto_activa($config, 'agotado_auto')) {
        mover_ingredientes($ingredientes, $items, $platos, -1);
        guardar_json('ingredientes', array_values($ingredientes));
    }
    $pedidos[] = $pedido;
    guardar_json('pedidos', $pedidos);
    return ['pedido' => $pedido, 'posicion' => $hoy['en_fila'] + 1];
});

$_SESSION['ultimo_pedido'] = time();
$p = $resultado['pedido'];
responder(201, [
    'ok' => true,
    'numero' => $p['numero'],
    'codigo' => $p['codigo'],
    'recoger' => $p['recoger'],
    'parada' => $p['parada'],
    'total' => $p['total'],
    'ahorro' => $p['ahorro'],
    'posicion' => $resultado['posicion'],
]);
