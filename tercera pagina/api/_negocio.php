<?php

declare(strict_types=1);
require __DIR__ . '/_seguridad.php';

const CATEGORIAS = ['tacos' => 'Tacos', 'especiales' => 'Especiales', 'bebidas' => 'Bebidas', 'postres' => 'Postres'];
const ESTADOS    = ['recibido', 'preparando', 'listo', 'entregado', 'cancelado'];
const EN_FILA    = ['recibido', 'preparando'];
const DIAS       = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const RUTA_FOTOS = __DIR__ . '/../img/menu';
const UNIDADES   = ['pz', 'g', 'ml'];
const AUTOMATIZACIONES = [
    'agotado_auto'   => 'Marcar platillos agotados según el inventario',
    'franjas_auto'   => 'Limitar pedidos por franja de recogida',
    'promo_dia'      => 'Aplicar la promoción del día automáticamente',
    'aviso_retraso'  => 'Alertar pedidos que pasaron su hora de recogida',
    'bloqueo_eventos' => 'Suspender la ruta pública los días con evento privado',
    'prep_sugerida'  => 'Calcular la preparación sugerida con el historial',
];

function ahora(): DateTimeImmutable
{
    return new DateTimeImmutable('now');
}

function a_minutos(string $hora): int
{
    [$h, $m] = array_map('intval', explode(':', $hora) + [0, 0]);
    return $h * 60 + $m;
}

function a_hora(int $minutos): string
{
    $minutos = max(0, min(1439, $minutos));
    return sprintf('%02d:%02d', intdiv($minutos, 60), $minutos % 60);
}

function hora_valida($hora): bool
{
    return is_string($hora) && preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $hora) === 1;
}

function fecha_valida($fecha): bool
{
    if (!is_string($fecha) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $fecha)) {
        return false;
    }
    [$a, $m, $d] = array_map('intval', explode('-', $fecha));
    return checkdate($m, $d, $a);
}

function config_defecto(): array
{
    return [
        'pedidos_activos'   => true,
        'capacidad_franja'  => 8,
        'minutos_franja'    => 10,
        'anticipacion_min'  => 15,
        'prep_base'         => 6,
        'min_por_pedido'    => 3,
        'taqueros'          => 2,
        'max_piezas'        => 40,
        'umbral_pocos'      => 12,
        'margen_prep'       => 15,
        'aviso'             => ['activo' => false, 'texto' => ''],
        'auto'              => array_fill_keys(array_keys(AUTOMATIZACIONES), true),
        'promos'            => [
            ['dia' => 2, 'titulo' => 'Martes de pastor', 'texto' => '2×1 en tacos al pastor toda la noche.', 'plato' => 'taco-pastor', 'tipo' => '2x1', 'valor' => 0],
            ['dia' => 4, 'titulo' => 'Jueves de birria', 'texto' => '20 % menos en el consomé de birria.', 'plato' => 'consome', 'tipo' => 'pct', 'valor' => 20],
            ['dia' => 6, 'titulo' => 'Sábado de churros', 'texto' => '2×1 en churros con chocolate.', 'plato' => 'churros-chocolate', 'tipo' => '2x1', 'valor' => 0],
        ],
        'eventos' => [
            'minimo'           => 30,
            'maximo'           => 400,
            'horas_base'       => 3,
            'hora_extra'       => 1500,
            'km_incluidos'     => 15,
            'costo_km'         => 18,
            'anticipo_pct'     => 30,
            'anticipacion_dias' => 3,
            'paquetes'         => [
                ['id' => 'clasica', 'nombre' => 'Taquiza clásica', 'precio' => 185, 'tacos' => 4, 'incluye' => 'Pastor, asada y pollo · salsas · cebolla y cilantro · aguas frescas'],
                ['id' => 'completa', 'nombre' => 'Taquiza completa', 'precio' => 245, 'tacos' => 5, 'incluye' => 'Cinco guisos · gringas · elote asado · aguas frescas ilimitadas'],
                ['id' => 'premium', 'nombre' => 'Trompo premium', 'precio' => 320, 'tacos' => 6, 'incluye' => 'Trompo en vivo · birria con consomé · barra de salsas · churros'],
            ],
        ],
    ];
}

function config(): array
{
    $base = config_defecto();
    $guardada = leer_json('config', []);
    $c = array_replace($base, $guardada);
    $c['auto'] = array_replace($base['auto'], is_array($guardada['auto'] ?? null) ? $guardada['auto'] : []);
    $c['eventos'] = array_replace($base['eventos'], is_array($guardada['eventos'] ?? null) ? $guardada['eventos'] : []);
    $c['aviso'] = array_replace($base['aviso'], is_array($guardada['aviso'] ?? null) ? $guardada['aviso'] : []);
    return $c;
}

function auto_activa(array $config, string $clave): bool
{
    return !empty($config['auto'][$clave]);
}

function ruta_defecto(): array
{
    return [
        'semana' => [
            ['dia' => 0, 'activo' => true,  'lugar' => 'Bosque Los Colomos', 'direccion' => 'Acceso Av. Patria, Providencia, Guadalajara', 'inicio' => '11:00', 'fin' => '17:00'],
            ['dia' => 1, 'activo' => false, 'lugar' => 'Día de descanso', 'direccion' => '', 'inicio' => '00:00', 'fin' => '00:00'],
            ['dia' => 2, 'activo' => true,  'lugar' => 'Plaza Chapultepec', 'direccion' => 'Av. Chapultepec Sur 120, Col. Americana, Guadalajara', 'inicio' => '18:30', 'fin' => '23:30'],
            ['dia' => 3, 'activo' => true,  'lugar' => 'Oficinas Puerta de Hierro', 'direccion' => 'Blvd. Puerta de Hierro 4965, Zapopan', 'inicio' => '13:00', 'fin' => '16:30'],
            ['dia' => 4, 'activo' => true,  'lugar' => 'Ciudad Universitaria', 'direccion' => 'Periférico Norte 799, Los Belenes, Zapopan', 'inicio' => '12:30', 'fin' => '17:00'],
            ['dia' => 5, 'activo' => true,  'lugar' => 'Glorieta Chapalita', 'direccion' => 'Av. Guadalupe y Av. de las Rosas, Chapalita, Guadalajara', 'inicio' => '18:30', 'fin' => '23:30'],
            ['dia' => 6, 'activo' => true,  'lugar' => 'Mercado nocturno Providencia', 'direccion' => 'Av. Rubén Darío 1200, Providencia, Guadalajara', 'inicio' => '17:00', 'fin' => '23:30'],
        ],
        'excepciones' => [],
    ];
}

function ruta(): array
{
    $r = leer_json('ruta', []);
    return isset($r['semana']) && count($r['semana']) === 7 ? $r + ['excepciones' => []] : ruta_defecto();
}

function evento_confirmado_en(array $eventos, string $fecha): ?array
{
    foreach ($eventos as $e) {
        if (($e['estado'] ?? '') === 'confirmado' && ($e['fecha'] ?? '') === $fecha) {
            return $e;
        }
    }
    return null;
}

function parada_del_dia(string $fecha, array $ruta, array $eventos, array $config): array
{
    $dia = (int) (new DateTimeImmutable($fecha))->format('w');
    $base = $ruta['semana'][$dia] ?? ['activo' => false, 'lugar' => '', 'direccion' => '', 'inicio' => '00:00', 'fin' => '00:00'];
    $p = [
        'fecha' => $fecha,
        'dia' => $dia,
        'nombre_dia' => DIAS[$dia],
        'activo' => (bool) $base['activo'],
        'lugar' => (string) $base['lugar'],
        'direccion' => (string) $base['direccion'],
        'inicio' => (string) $base['inicio'],
        'fin' => (string) $base['fin'],
        'nota' => '',
        'tipo' => $base['activo'] ? 'ruta' : 'descanso',
    ];
    foreach ($ruta['excepciones'] ?? [] as $x) {
        if (($x['fecha'] ?? '') !== $fecha) {
            continue;
        }
        if ($x['tipo'] === 'cerrado') {
            $p['activo'] = false;
            $p['tipo'] = 'cerrado';
            $p['nota'] = (string) ($x['nota'] ?: 'Hoy no salimos a ruta.');
        } else {
            $p = array_replace($p, [
                'activo' => true,
                'lugar' => (string) $x['lugar'],
                'direccion' => (string) $x['direccion'],
                'inicio' => (string) $x['inicio'],
                'fin' => (string) $x['fin'],
                'nota' => (string) ($x['nota'] ?? ''),
                'tipo' => 'cambio',
            ]);
        }
    }
    if (auto_activa($config, 'bloqueo_eventos') && evento_confirmado_en($eventos, $fecha)) {
        $p['activo'] = false;
        $p['tipo'] = 'evento';
        $p['nota'] = 'Hoy atendemos un evento privado.';
    }
    return $p;
}

function semana_publica(array $ruta, array $eventos, array $config): array
{
    $hoy = ahora();
    $dias = [];
    for ($i = 0; $i < 7; $i++) {
        $dias[] = parada_del_dia($hoy->modify("+$i day")->format('Y-m-d'), $ruta, $eventos, $config);
    }
    return $dias;
}

function pedidos_de(array $pedidos, string $fecha): array
{
    return array_values(array_filter($pedidos, fn($p) => substr($p['fecha'], 0, 10) === $fecha));
}

function espera_estimada(array $pedidosHoy, array $config): int
{
    $enFila = count(array_filter($pedidosHoy, fn($p) => in_array($p['estado'], EN_FILA, true)));
    return (int) $config['prep_base'] + (int) ceil($enFila * (int) $config['min_por_pedido'] / max(1, (int) $config['taqueros']));
}

function franjas(array $parada, array $pedidosHoy, array $config, int $espera): array
{
    if (!$parada['activo']) {
        return [];
    }
    $paso = max(5, (int) $config['minutos_franja']);
    $ahoraMin = (int) ahora()->format('G') * 60 + (int) ahora()->format('i');
    $desde = max(a_minutos($parada['inicio']), $ahoraMin + max((int) $config['anticipacion_min'], $espera));
    $desde = (int) (ceil($desde / $paso) * $paso);
    $hasta = a_minutos($parada['fin']) - $paso;
    $ocupados = [];
    foreach ($pedidosHoy as $p) {
        if ($p['estado'] !== 'cancelado') {
            $ocupados[$p['recoger']] = ($ocupados[$p['recoger']] ?? 0) + 1;
        }
    }
    $lista = [];
    for ($m = $desde; $m <= $hasta; $m += $paso) {
        $hora = a_hora($m);
        $usados = $ocupados[$hora] ?? 0;
        $lista[] = [
            'hora' => $hora,
            'libres' => max(0, (int) $config['capacidad_franja'] - $usados),
            'lleno' => auto_activa($config, 'franjas_auto') && $usados >= (int) $config['capacidad_franja'],
        ];
    }
    return $lista;
}

function promo_del_dia(array $config, ?int $dia = null): ?array
{
    if (!auto_activa($config, 'promo_dia')) {
        return null;
    }
    $dia ??= (int) ahora()->format('w');
    foreach ($config['promos'] ?? [] as $p) {
        if ((int) $p['dia'] === $dia) {
            return $p;
        }
    }
    return null;
}

function precio_linea(array $plato, int $cantidad, ?array $promo): array
{
    $bruto = round($plato['precio'] * $cantidad, 2);
    $descuento = 0.0;
    if ($promo && $promo['plato'] === $plato['id']) {
        if ($promo['tipo'] === '2x1') {
            $descuento = round(intdiv($cantidad, 2) * $plato['precio'], 2);
        } elseif ($promo['tipo'] === 'pct') {
            $descuento = round($bruto * min(90, max(0, (float) $promo['valor'])) / 100, 2);
        }
    }
    return ['bruto' => $bruto, 'descuento' => $descuento, 'total' => round($bruto - $descuento, 2)];
}

function indice(array $lista): array
{
    $r = [];
    foreach ($lista as $x) {
        $r[$x['id']] = $x;
    }
    return $r;
}

function porciones(array $plato, array $ingredientes): ?int
{
    $receta = $plato['receta'] ?? [];
    if (!$receta) {
        return null;
    }
    $min = PHP_INT_MAX;
    foreach ($receta as $ing => $cant) {
        if ($cant <= 0) {
            continue;
        }
        $stock = (float) ($ingredientes[$ing]['stock'] ?? 0);
        $min = min($min, (int) floor($stock / $cant));
    }
    return $min === PHP_INT_MAX ? null : max(0, $min);
}

function faltante(array $items, array $platos, array $ingredientes): ?string
{
    $uso = [];
    foreach ($items as $it) {
        foreach ($platos[$it['id']]['receta'] ?? [] as $ing => $cant) {
            $uso[$ing] = ($uso[$ing] ?? 0) + $cant * $it['cantidad'];
        }
    }
    foreach ($uso as $ing => $total) {
        if ((float) ($ingredientes[$ing]['stock'] ?? 0) < $total) {
            return $ingredientes[$ing]['nombre'] ?? $ing;
        }
    }
    return null;
}

function mover_ingredientes(array &$ingredientes, array $items, array $platos, int $signo): void
{
    foreach ($items as $it) {
        foreach ($platos[$it['id']]['receta'] ?? [] as $ing => $cant) {
            if (isset($ingredientes[$ing])) {
                $ingredientes[$ing]['stock'] = round(max(0, $ingredientes[$ing]['stock'] + $signo * $cant * $it['cantidad']), 2);
            }
        }
    }
}

function imagen_valida($ruta): bool
{
    return is_string($ruta) && preg_match('/^(img\/menu\/[a-z0-9-]{1,60}|uploads\/platos\/[a-f0-9]{20})\.(webp|jpg|png)$/', $ruta) === 1;
}

function plato_publico(array $p, array $ingredientes, array $config, ?array $promo): array
{
    $quedan = porciones($p, $ingredientes);
    $agotado = !$p['disponible'] || (auto_activa($config, 'agotado_auto') && $quedan !== null && $quedan <= 0);
    return [
        'id' => $p['id'],
        'nombre' => $p['nombre'],
        'categoria' => $p['categoria'],
        'precio' => (float) $p['precio'],
        'descripcion' => $p['descripcion'],
        'imagen' => imagen_valida($p['imagen'] ?? '') ? $p['imagen'] : '',
        'picante' => (int) ($p['picante'] ?? 0),
        'vegetariano' => !empty($p['vegetariano']),
        'favorito' => !empty($p['favorito']),
        'agotado' => $agotado,
        'quedan' => !$agotado && $quedan !== null && $quedan <= (int) $config['umbral_pocos'] ? $quedan : null,
        'promo' => $promo && $promo['plato'] === $p['id'] ? ($promo['tipo'] === '2x1' ? '2×1 hoy' : '-' . (int) $promo['valor'] . ' % hoy') : null,
    ];
}

function mas_pedidos(array $pedidos, int $dias, int $cuantos): array
{
    $limite = ahora()->modify("-$dias day")->format('Y-m-d');
    $conteo = [];
    foreach ($pedidos as $p) {
        if ($p['estado'] === 'cancelado' || substr($p['fecha'], 0, 10) < $limite) {
            continue;
        }
        foreach ($p['items'] as $it) {
            $conteo[$it['id']] = ($conteo[$it['id']] ?? 0) + $it['cantidad'];
        }
    }
    arsort($conteo);
    return array_slice($conteo, 0, $cuantos, true);
}

function estado_hoy(array $pedidos, array $config, array $ruta, array $eventos): array
{
    $ahora = ahora();
    $fecha = $ahora->format('Y-m-d');
    $parada = parada_del_dia($fecha, $ruta, $eventos, $config);
    $pedidosHoy = pedidos_de($pedidos, $fecha);
    $min = (int) $ahora->format('G') * 60 + (int) $ahora->format('i');

    if (!$parada['activo']) {
        $estado = $parada['tipo'];
    } elseif ($min < a_minutos($parada['inicio'])) {
        $estado = 'pronto';
    } elseif ($min < a_minutos($parada['fin'])) {
        $estado = 'abierto';
    } else {
        $estado = 'termino';
    }

    $proxima = null;
    for ($i = in_array($estado, ['pronto', 'abierto'], true) ? 1 : 0; $i <= 8 && !$proxima; $i++) {
        $f = $ahora->modify("+$i day")->format('Y-m-d');
        $p = parada_del_dia($f, $ruta, $eventos, $config);
        if ($p['activo'] && ($i > 0 || $min < a_minutos($p['inicio']))) {
            $inicio = new DateTimeImmutable($f . ' ' . $p['inicio']);
            $p['faltan_min'] = (int) floor(($inicio->getTimestamp() - $ahora->getTimestamp()) / 60);
            $proxima = $p;
        }
    }

    $espera = espera_estimada($pedidosHoy, $config);
    $preparando = array_filter($pedidosHoy, fn($p) => $p['estado'] === 'preparando');
    $atendidos = array_filter($pedidosHoy, fn($p) => in_array($p['estado'], ['listo', 'entregado'], true));
    $turno = $preparando ? min(array_column($preparando, 'numero')) : ($atendidos ? max(array_column($atendidos, 'numero')) : null);
    $aceptaPedidos = !empty($config['pedidos_activos']) && in_array($estado, ['pronto', 'abierto'], true);
    $lista = $aceptaPedidos ? franjas($parada, $pedidosHoy, $config, $espera) : [];

    return [
        'fecha' => $fecha,
        'hora' => $ahora->format('H:i'),
        'estado' => $estado,
        'parada' => $parada,
        'proxima' => $proxima,
        'espera_min' => $espera,
        'en_fila' => count(array_filter($pedidosHoy, fn($p) => in_array($p['estado'], EN_FILA, true))),
        'turno_actual' => $turno,
        'acepta_pedidos' => $aceptaPedidos && count(array_filter($lista, fn($f) => !$f['lleno'])) > 0,
        'franjas' => $lista,
        'promo' => promo_del_dia($config),
        'aviso' => !empty($config['aviso']['activo']) && $config['aviso']['texto'] !== '' ? $config['aviso']['texto'] : null,
    ];
}

function paquete(array $config, string $id): ?array
{
    foreach ($config['eventos']['paquetes'] as $p) {
        if ($p['id'] === $id) {
            return $p;
        }
    }
    return null;
}

function cotizar_evento(array $d, array $config, array $eventos): array
{
    $ev = $config['eventos'];
    $paquete = paquete($config, (string) ($d['paquete'] ?? ''));
    $invitados = (int) ($d['invitados'] ?? 0);
    $horas = (int) ($d['horas'] ?? $ev['horas_base']);
    $km = (int) ($d['km'] ?? 0);
    $fecha = (string) ($d['fecha'] ?? '');
    $errores = [];

    if (!$paquete) {
        $errores['paquete'] = 'Elige un paquete.';
    }
    if ($invitados < $ev['minimo'] || $invitados > $ev['maximo']) {
        $errores['invitados'] = "Atendemos de {$ev['minimo']} a {$ev['maximo']} invitados.";
    }
    if ($horas < $ev['horas_base'] || $horas > 8) {
        $errores['horas'] = "El servicio dura de {$ev['horas_base']} a 8 horas.";
    }
    if ($km < 0 || $km > 120) {
        $errores['km'] = 'Llegamos hasta 120 km desde Guadalajara.';
    }
    $disponible = null;
    if ($fecha !== '') {
        if (!fecha_valida($fecha)) {
            $errores['fecha'] = 'Revisa la fecha.';
        } else {
            $minima = ahora()->modify('+' . (int) $ev['anticipacion_dias'] . ' day')->format('Y-m-d');
            if ($fecha < $minima) {
                $errores['fecha'] = 'Necesitamos al menos ' . (int) $ev['anticipacion_dias'] . ' días de anticipación.';
            } elseif (evento_confirmado_en($eventos, $fecha)) {
                $errores['fecha'] = 'Esa fecha ya está reservada. Prueba con otro día.';
                $disponible = false;
            } else {
                $disponible = true;
            }
        }
    }

    $precio = $paquete ? (float) $paquete['precio'] : 0;
    $comida = $invitados * $precio;
    $extra = max(0, $horas - (int) $ev['horas_base']) * (float) $ev['hora_extra'];
    $traslado = max(0, $km - (int) $ev['km_incluidos']) * (float) $ev['costo_km'];
    $total = round($comida + $extra + $traslado, 2);

    return [
        'errores' => $errores,
        'disponible' => $disponible,
        'comida' => $comida,
        'horas_extra' => $extra,
        'traslado' => $traslado,
        'total' => $total,
        'anticipo' => round($total * (int) $ev['anticipo_pct'] / 100, 2),
        'tacos' => $invitados * (int) ($paquete['tacos'] ?? 0),
        'taqueros' => max(1, (int) ceil($invitados / 60)),
    ];
}

function fechas_ocupadas(array $eventos): array
{
    $hoy = ahora()->format('Y-m-d');
    $r = [];
    foreach ($eventos as $e) {
        if (($e['estado'] ?? '') === 'confirmado' && $e['fecha'] >= $hoy) {
            $r[] = $e['fecha'];
        }
    }
    sort($r);
    return array_values(array_unique($r));
}

function eventos_publicos(array $config): array
{
    $ev = $config['eventos'];
    return [
        'minimo' => (int) $ev['minimo'],
        'maximo' => (int) $ev['maximo'],
        'horas_base' => (int) $ev['horas_base'],
        'hora_extra' => (float) $ev['hora_extra'],
        'km_incluidos' => (int) $ev['km_incluidos'],
        'costo_km' => (float) $ev['costo_km'],
        'anticipo_pct' => (int) $ev['anticipo_pct'],
        'anticipacion_dias' => (int) $ev['anticipacion_dias'],
        'paquetes' => array_map(fn($p) => [
            'id' => $p['id'], 'nombre' => $p['nombre'], 'precio' => (float) $p['precio'], 'tacos' => (int) $p['tacos'], 'incluye' => $p['incluye'],
        ], $ev['paquetes']),
    ];
}
