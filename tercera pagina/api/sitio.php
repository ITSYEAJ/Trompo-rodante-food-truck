<?php

declare(strict_types=1);
require __DIR__ . '/_negocio.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    error_json(405, 'Método no permitido.');
}

$config = config();
$ruta = ruta();
$eventos = leer_json('eventos', []);
$pedidos = leer_json('pedidos', []);
$ingredientes = indice(leer_json('ingredientes', []));
$promo = promo_del_dia($config);

$menu = [];
foreach (leer_json('platos', []) as $p) {
    if (!empty($p['activo']) && isset(CATEGORIAS[$p['categoria']])) {
        $menu[] = plato_publico($p, $ingredientes, $config, $promo);
    }
}

$top = array_keys(mas_pedidos($pedidos, 7, 4));
foreach ($menu as $m) {
    if (count($top) < 4 && $m['favorito'] && !in_array($m['id'], $top, true)) {
        $top[] = $m['id'];
    }
}

responder(200, [
    'ok' => true,
    'hoy' => estado_hoy($pedidos, $config, $ruta, $eventos),
    'semana' => semana_publica($ruta, $eventos, $config),
    'categorias' => CATEGORIAS,
    'menu' => $menu,
    'top' => $top,
    'promos' => auto_activa($config, 'promo_dia') ? array_map(fn($x) => ['dia' => (int) $x['dia'], 'titulo' => $x['titulo'], 'texto' => $x['texto'], 'plato' => $x['plato']], $config['promos']) : [],
    'eventos' => eventos_publicos($config),
    'ocupadas' => fechas_ocupadas($eventos),
]);
