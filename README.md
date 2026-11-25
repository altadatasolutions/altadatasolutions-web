# Altadata Solutions: landing

Sitio estático (HTML, CSS y JS, sin build). Para Vercel: importa el repositorio, framework "Other", sin comando de build, carpeta raíz `/`.

- Formulario: envía a luisiglesias@altadatasolutions.com por FormSubmit. El primer envío manda un correo de activación a esa dirección: confírmalo una vez y desde ahí llegan los pedidos.
- Catálogo (oculto por ahora: para mostrarlo, quita el comentario "Oculto hasta tener el inventario" en `index.html`): edita `productos.json` (nombre, detalle, categoría, precio, promo, etiqueta, imagen). Las fotos van en `img/productos/`.
- Sitios de clientes (carrusel 3D): las portadas están en `img/sitios/` (camaraboquete.jpg, coffee-estate-inn.jpg, nuovomundo.jpg). Son capturas de 1600×1060 px; para cambiarlas usa el mismo nombre y tamaño. Nombres, descripciones y enlaces están en el bloque JSON dentro de la sección `#sitios` de `index.html`. Three.js (licencia MIT) va en `assets/vendor/`.
- Idiomas: `index.html` es español y `en.html` inglés. Si cambias un texto en uno, cámbialo también en el otro. `vercel.json` activa direcciones limpias (/en).
- Dominio: descomenta `<link rel="canonical">` en `index.html` con tu dominio.
