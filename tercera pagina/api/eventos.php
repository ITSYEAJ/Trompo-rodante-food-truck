<?php

declare(strict_types=1);
require __DIR__ . '/_negocio.php';

solo_post();
iniciar_sesion();
verificar_origen();
verificar_csrf();

$d = entrada();
$accion = (string) ($d['accion'] ?? '');
$config = config();
$eventos = leer_json('eventos', []);

if ($accion === 'cotizar') {
    if (!limitar_por_ip('cotizar', 120, 600)) {
        error_json(429, 'Demasiadas consultas. Espera unos minutos.');
    }
    responder(200, ['ok' => true] + cotizar_evento($d, $config, $eventos));
}

if ($accion !== 'solicitar') {
    error_json(400, 'Acción no válida.');
}
if (!empty($d['sitio_web'])) {
    responder(200, ['ok' => true, 'folio' => 'EV-0000']);
}
if (!limitar_por_ip('evento', 4, 3600)) {
    error_json(429, 'Ya recibimos varias solicitudes tuyas. Te contactaremos pronto.');
}

$cot = cotizar_evento($d, $config, $eventos);
$errores = $cot['errores'];
$nombre = limpiar($d['nombre'] ?? '', 80);
$telefono = preg_replace('/\D/', '', (string) ($d['telefono'] ?? '')) ?? '';
$correo = limpiar($d['correo'] ?? '', 120);
$tipo = limpiar($d['tipo'] ?? '', 40);
$lugar = limpiar($d['lugar'] ?? '', 140);
$hora = (string) ($d['hora'] ?? '');
$notas = limpiar($d['notas'] ?? '', 500);

if (($d['fecha'] ?? '') === '') {
    $errores['fecha'] = 'Elige la fecha del evento.';
}
if (!hora_valida($hora)) {
    $errores['hora'] = 'Indica a qué hora empieza.';
}
if (mb_strlen($nombre) < 3) {
    $errores['nombre'] = 'Escribe tu nombre completo.';
}
if (strlen($telefono) !== 10) {
    $errores['telefono'] = 'El teléfono debe tener 10 dígitos.';
}
if (!filter_var($correo, FILTER_VALIDATE_EMAIL)) {
    $errores['correo'] = 'Revisa tu correo.';
}
if (mb_strlen($lugar) < 5) {
    $errores['lugar'] = 'Indica la colonia o dirección del evento.';
}
if ($errores) {
    error_json(422, 'Revisa los datos marcados.', ['errores' => $errores]);
}

$folio = con_bloqueo(function () use ($d, $cot, $nombre, $telefono, $correo, $tipo, $lugar, $hora, $notas) {
    $eventos = leer_json('eventos', []);
    $siguiente = 1;
    foreach ($eventos as $e) {
        $siguiente = max($siguiente, (int) substr($e['folio'], 3) + 1);
    }
    $folio = sprintf('EV-%04d', $siguiente);
    $eventos[] = [
        'id' => nuevo_id('e_'),
        'folio' => $folio,
        'creado' => ahora()->format('c'),
        'estado' => 'pendiente',
        'fecha' => (string) $d['fecha'],
        'hora' => $hora,
        'horas' => (int) $d['horas'],
        'invitados' => (int) $d['invitados'],
        'paquete' => (string) $d['paquete'],
        'km' => (int) $d['km'],
        'tipo' => $tipo ?: 'Evento',
        'lugar' => $lugar,
        'notas' => $notas,
        'cliente' => ['nombre' => $nombre, 'telefono' => $telefono, 'correo' => $correo],
        'cotizacion' => array_diff_key($cot, ['errores' => 1, 'disponible' => 1]),
    ];
    guardar_json('eventos', $eventos);
    return $folio;
});

responder(201, ['ok' => true, 'folio' => $folio, 'total' => $cot['total'], 'anticipo' => $cot['anticipo']]);
