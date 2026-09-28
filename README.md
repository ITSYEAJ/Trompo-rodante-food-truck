
## Funcionalidades

- Menú con categorías, búsqueda, filtros y detalle de platillos.
- Bolsa de pedido y pedidos para recoger, con horarios y capacidad por franja.
- Estado de la ruta semanal, ubicación del día y próximas paradas.
- Seguimiento del turno de un pedido.
- Cotizador y solicitudes para servicio de taquiza en eventos.
- Panel de administración para pedidos, platillos, inventario, promociones, ruta y eventos.
- Datos locales de respaldo para consultar el sitio cuando la API no está disponible.

## Tecnologías

- HTML, CSS y JavaScript sin framework.
- PHP para la API y el panel administrativo.
- Archivos JSON para almacenar menú, ruta, inventario, pedidos y eventos.
- Apache para servir la aplicación y aplicar las reglas de seguridad de `.htaccess`.

## Requisitos

- Laragon o un entorno equivalente con Apache y PHP.
- PHP habilitado para procesar los endpoints de `api/`.
- Permisos de escritura para los archivos de datos y el directorio `uploads/` si se van a gestionar pedidos, cambios administrativos o imágenes.

## Instalación local con Laragon

1. Coloca el proyecto dentro de la carpeta `www` de Laragon.
2. Inicia Apache desde Laragon.
3. Abre `http://localhost/tercera-pagina/` y cambia `tercera-pagina` por el nombre real de la carpeta del proyecto. La entrada de la raíz redirige automáticamente a `public/`.
4. Para abrir directamente la página, visita `http://localhost/tercera-pagina/public/`.
5. El panel del equipo está disponible en `http://localhost/tercera-pagina/admin/`.

La estructura actual mantiene `public/`, `api/`, `admin/`, `css/`, `js/`, `img/`, `data/` y `uploads/` como directorios hermanos. Por eso, sirve el proyecto desde la raíz de la carpeta del proyecto: los recursos y las llamadas PHP de la página pública usan rutas relativas hacia esos directorios.

## GitHub Pages

GitHub Pages solo publica archivos estáticos y no ejecuta PHP. En consecuencia, puede mostrar partes estáticas de la interfaz, pero los pedidos, el panel, el seguimiento conectado al servidor y la administración de datos requieren alojar el proyecto en un servidor con PHP y Apache.
