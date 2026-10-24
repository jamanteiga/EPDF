# ePDF — editor PDF libre para iPad (web)

Editor PDF que funciona **entero en el navegador**: los documentos y los certificados nunca salen del dispositivo. Interfaz con **Archivo + pestañas** al estilo de PDF-XChange Editor, pensada para tableta (dedo y Apple Pencil). Varios PDF abiertos a la vez, cada uno en su pestaña.

Licencia: **GNU AGPL-3.0-or-later** © 2026 José Antonio Manteiga Presedo.

## Publicar en GitHub Pages

1. Cree un repositorio público (por ejemplo `epdf`) y suba **todo el contenido de esta carpeta** a la raíz.
2. En el repositorio, vaya a *Settings › Pages › Build and deployment*, elija *Source: Deploy from a branch*, la rama `main` y la carpeta `/ (root)`, y pulse *Save*.
3. Edite `js/app.js` y en `SOURCE_URL` ponga la URL del repositorio. La AGPL obliga a ofrecer el código fuente a los usuarios y esa dirección aparece en *Ayuda › Acerca de*.
4. En el iPad, abra `https://<usuario>.github.io/epdf/` en Safari, pulse *Compartir › Añadir a pantalla de inicio* y ábrala desde el icono. Funciona sin conexión a partir de la primera visita.

No necesita compilación: es HTML, CSS y JavaScript con las librerías en `vendor/`.
Para probarlo en local: `python3 -m http.server` en esta carpeta y abra `http://localhost:8000`.

Requisitos: **iPadOS 16.5 o posterior** (Safari).

## Funciones por pestaña

| Pestaña | Contenido |
|---|---|
| **Archivo** | Abrir (archivos, URL, cámara, imágenes), archivos recientes (guardados en el dispositivo), Guardar / Guardar como / copia optimizada, Nuevo, Imprimir, Exportar, Compartir, Propiedades, Revertir, Cerrar, Preferencias |
| **Inicio** | Mano, selección de texto, seleccionar comentarios, instantánea, buscar, zoom, girar, **Editar texto** (sustitución real de líneas), Añadir texto, Añadir imagen, comentarios rápidos, sello, firmar |
| **Ver** | Navegación, escalas, girar vista, pantalla completa, cuadrícula, páginas oscuras, paneles, leer en voz alta |
| **Comentario** | Máquina de escribir, cuadro de texto, nota, resaltar, subrayar, tachar, ondulado, línea, flecha, rectángulo, elipse, lápiz, borrador, sello, **Distancia** con escala 1:N, color/tamaño, lista, resumen y aplanado |
| **Proteger** | **Firma digital PAdES** con .p12/.pfx o **AutoFirma**, certificar, **validar firmas**, firma manuscrita, contraseña AES-256 y permisos, censura real (manual o buscando DNI, email, teléfono, IBAN), depurar |
| **Formulario** | Crear campos (texto, casilla, radio, lista, desplegable, botón, fecha, firma); rellenar; importar y exportar JSON, XFDF y CSV; restablecer; aplanar |
| **Organizar** | Insertar (en blanco, PDF, imágenes), eliminar, extraer, combinar, dividir, duplicar, mover, reemplazar, invertir, girar, recortar, marca de agua, fondo, encabezado y pie, paginación |
| **Convertir** | Escanear con la cámara, crear desde imágenes, exportar a imágenes y texto, **OCR** (español, gallego, inglés), copia optimizada |
| **Compartir** | Hoja de compartir de iPadOS (Guardar en Archivos, Mail, AirDrop…) |
| **Revisar** | Recuento de palabras, **comparar documentos** (diferencias de texto), comentarios |
| **Accesibilidad** | Comprobación básica, título e idioma, lectura en voz alta |
| **Marcadores** | Añadir y eliminar marcadores, crearlos desde los encabezados, exportarlos |

### PDF/A
Los documentos PDF/A (como los justificantes de la Xunta) muestran la **franja rosa** de aviso. Antes de la primera modificación se pide confirmación expresa (*Permitir la edición*), porque el documento dejará de cumplir la norma.

### Firma digital
- **Certificado .p12 / .pfx** (por ejemplo, el de la FNMT exportado con su clave privada). La firma es PAdES `ETSI.CAdES.detached` con SHA-256 y el atributo *signing-certificate-v2*, y se guarda de forma **incremental**, de modo que las firmas anteriores siguen siendo válidas. Admite firma visible (dibujando el recuadro), invisible, en un campo de firma que ya exista y la certificación (DocMDP). El certificado solo se guarda en memoria mientras la app está abierta.
- **AutoFirma / Cliente @firma**: en ordenador con AutoFirma instalado funciona directamente. **En iPad**, la app *Cliente @firma* necesita los servicios intermedios `afirma-signature-storage` y `afirma-signature-retriever` de la Suite @firma, publicados en un servidor HTTPS. Sus URL se configuran en *Archivo › Preferencias*.
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
js/ui/                 ribbon, sidebar, dialogs, icons
js/cmd/                annot, organize, forms, protect, draw, convert, review
js/sign/               pades (firma/validación), autofirma
vendor/                MuPDF.js (AGPL), PDF.js, pdf-lib, node-forge, Tesseract.js + idiomas, AutoScript
```

## Componentes de terceros
MuPDF.js (AGPL-3.0, Artifex) · PDF.js (Apache-2.0) · pdf-lib (MIT) · node-forge (BSD-3/GPL-2) · Tesseract.js y modelos (Apache-2.0) · AutoScript, de la Suite @firma (GPL-2.0+/EUPL-1.1) · Lucide (ISC).
