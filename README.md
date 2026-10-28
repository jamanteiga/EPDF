# ePDF — editor PDF libre para iPad (web)

Editor PDF que funciona **entero en el navegador**: los documentos y los certificados nunca salen del dispositivo. Interfaz por **modos de trabajo** (Leer · Anotar · Editar · Páginas · Formulario · Firmar · Convertir) con barra contextual de herramientas, pensada para tableta (dedo y Apple Pencil). Varios PDF abiertos a la vez, cada uno en su pestaña.

Licencia: **GNU AGPL-3.0-or-later** © 2026 José Antonio Manteiga Presedo.

## Publicar en GitHub Pages

1. Cree un repositorio público (por ejemplo `epdf`) y suba **todo el contenido de esta carpeta** a la raíz.
2. En el repositorio, vaya a *Settings › Pages › Build and deployment*, elija *Source: Deploy from a branch*, la rama `main` y la carpeta `/ (root)`, y pulse *Save*.
3. Edite `js/app.js` y en `SOURCE_URL` ponga la URL del repositorio. La AGPL obliga a ofrecer el código fuente a los usuarios y esa dirección aparece en *Ayuda › Acerca de*.
4. En el iPad, abra `https://<usuario>.github.io/epdf/` en Safari, pulse *Compartir › Añadir a pantalla de inicio* y ábrala desde el icono. Funciona sin conexión a partir de la primera visita.

No necesita compilación: es HTML, CSS y JavaScript con las librerías en `vendor/`.
Para probarlo en local: `python3 -m http.server` en esta carpeta y abra `http://localhost:8000`.

Requisitos: **iPadOS 16.5 o posterior** (Safari).

## Interfaz
- **Barra superior**: pestañas de documentos abiertos, Buscar, Deshacer/Rehacer, Compartir, **Guardar** y **☰ Menú** (abrir, recientes, guardar como, exportar, imprimir, propiedades, preferencias, ayuda).
- **Selector de modo** flotante; al pulsar el modo activo se oculta/muestra su barra de herramientas.
- **Paneles** (miniaturas, marcadores, comentarios, firmas): botones flotantes a la derecha.
- **Píldora inferior**: página, zoom, ajustar al ancho/página.

| Modo | Herramientas |
|---|---|
| **Leer** | Mano, seleccionar, buscar, ajustar, girar vista, copiar, captura, leer en voz alta, páginas oscuras, cuadrícula, pantalla completa |
| **Anotar** | Resaltar, subrayar, tachar, lápiz, rectángulo, elipse, flecha, línea, nota, texto, cuadro de texto, sello, medir (escala 1:N), borrar, color/tamaño, lista/resumen de comentarios |
| **Editar** | **Editar texto** (sustitución real), añadir texto, imagen, marca de agua, fondo, encabezado y pie, numeración, aplanar, propiedades |
| **Páginas** | Miniaturas, insertar, eliminar, extraer, mover, duplicar, girar, recortar, combinar, dividir, reemplazar, invertir, marcadores |
| **Formulario** | Campos (texto, casilla, opción, desplegable, lista, fecha, botón, firma), resaltar, aplicar, importar/exportar JSON-XFDF-CSV, vaciar, aplanar |
| **Firmar** | **Firma digital PAdES** (.p12/.pfx o AutoFirma), certificar, **validar**, firma manuscrita, contraseña AES-256, censura real (DNI, email, teléfono, IBAN), depurar metadatos |
| **Convertir** | **OCR** (es/gl/en), escanear con cámara, desde fotos, a imágenes, a texto, **reducir tamaño**, comparar documentos, recuento de palabras, accesibilidad |

### PDF/A
Los documentos PDF/A (como los justificantes de la Xunta) muestran una **franja de aviso** ámbar. Antes de la primera modificación se pide confirmación expresa (*Permitir la edición*), porque el documento dejará de cumplir la norma.

### Firma digital
- **Certificado .p12 / .pfx** (por ejemplo, el de la FNMT exportado con su clave privada). La firma es PAdES `ETSI.CAdES.detached` con SHA-256 y el atributo *signing-certificate-v2*, y se guarda de forma **incremental**, de modo que las firmas anteriores siguen siendo válidas. Admite firma visible (dibujando el recuadro), invisible, en un campo de firma que ya exista y la certificación (DocMDP). El certificado solo se guarda en memoria mientras la app está abierta.
- **AutoFirma / Cliente @firma**: en ordenador con AutoFirma instalado funciona directamente. **En iPad**, la app *Cliente @firma* necesita los servicios intermedios `afirma-signature-storage` y `afirma-signature-retriever` de la Suite @firma, publicados en un servidor HTTPS. Sus URL se configuran en *☰ Menú › Preferencias*.
- **Validar firmas** comprueba la integridad y la firma criptográfica. La cadena de confianza y la revocación no se comprueban localmente; para eso está [VALIDe](https://valide.redsara.es/valide/).

### Edición de texto
*Editar texto* elimina realmente del contenido el texto de la línea tocada (no solo lo tapa) y escribe el nuevo con la fuente estándar más parecida (Helvetica, Times o Courier, en su variante normal o negrita). Las fuentes incrustadas en el PDF original suelen ser subconjuntos, así que no se pueden reutilizar.

## Limitaciones de esta versión (solo navegador)
- La conversión a Word, Excel o PowerPoint queda para la fase 2, que requiere un servidor con LibreOffice.
- Sellado de tiempo (TSA): los servidores de TSA no permiten llamadas desde el navegador (CORS).
- No hay etiquetado de accesibilidad (PDF etiquetado).
- Los guardados que no son incrementales (organizar, OCR, formularios nuevos, marcas de agua…) reescriben el archivo; si el documento ya está firmado, la app avisa antes.

## Estructura
```
index.html, sw.js, manifest.webmanifest, css/, icons/
js/app.js              aplicación, pestañas de documentos, Archivo, búsqueda
js/core/               doc (historial/deshacer), viewer (PDF.js), tools (gestos), geom, engine
js/ui/                 modebar (modos y herramientas), sidebar, dialogs, icons
js/cmd/                annot, organize, forms, protect, draw, convert, review
js/sign/               pades (firma/validación), autofirma
vendor/                MuPDF.js (AGPL), PDF.js, pdf-lib, node-forge, Tesseract.js + idiomas, AutoScript
```

## Componentes de terceros
MuPDF.js (AGPL-3.0, Artifex) · PDF.js (Apache-2.0) · pdf-lib (MIT) · node-forge (BSD-3/GPL-2) · Tesseract.js y modelos (Apache-2.0) · AutoScript, de la Suite @firma (GPL-2.0+/EUPL-1.1) · Lucide (ISC).
