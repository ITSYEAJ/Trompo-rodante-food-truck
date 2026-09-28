<?php

declare(strict_types=1);
require __DIR__ . '/_negocio.php';

solo_post();
iniciar_sesion();
verificar_origen();
verificar_csrf();

if (!limitar_por_ip('seguimiento', 90, 600)) {
    error_json(429, 'Demasiadas consultas. Espera unos minutos.');
}

$d = entrada();
$numero = (int) ($d['numero'] ?? 0);
$codigo = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', (string) ($d['codigo'] ?? '')) ?? '');

if ($numero < 1 || strlen($codigo) !== 4) {
    error_json(422, 'Escribe tu número de turno y el código de 4 caracteres.');
}

$config = config();
$pedidos = leer_json('pedidos', []);
$desde = ahora()->modify('-1 day')->format('Y-m-d');
$encontrado = null;
foreach ($pedidos as $p) {
    if ($p['numero'] === $numero && substr($p['fecha'], 0, 10) >= $desde && hash_equals($p['codigo'], $codigo)) {
        $encontrado = $p;
    }
}
if (!$encontrado) {
    usleep(250000);
    error_json(404, 'No encontramos ese turno. Revisa el número y el código de tu ticket.');
}

$delDia = pedidos_de($pedidos, substr($encontrado['fecha'], 0, 10));
$antes = 0;
if (in_array($encontrado['estado'], EN_FILA, true)) {
    foreach ($delDia as $p) {
        if (in_array($p['estado'], EN_FILA, true) && ($p['recoger'] < $encontrado['recoger'] || ($p['recoger'] === $encontrado['recoger'] && $p['numero'] < $numero))) {
            $antes++;
        }
    }
}

responder(200, [
    'ok' => true,
    'numero' => $encontrado['numero'],
    'estado' => $encontrado['estado'],
    'recoger' => $encontrado['recoger'],
    'parada' => $encontrado['parada'],
    'nombre' => $encontrado['cliente']['nombre'],
    'items' => array_map(fn($i) => ['nombre' => $i['nombre'], 'cantidad' => $i['cantidad']], $encontrado['items']),
    'total' => $encontrado['total'],
    'antes' => $antes,
    'historial' => $encontrado['historial'],
]);
