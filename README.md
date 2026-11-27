# ePDF — editor PDF libre para iPad (web)

Editor PDF que funciona **entero en el navegador**: los documentos y los certificados nunca salen del dispositivo. Interfaz por **modos de trabajo** (Leer · Anotar · Medir · Editar · Páginas · Formulario · Firmar · Convertir) con barra contextual de herramientas, pensada para tableta (dedo y Apple Pencil). Varios PDF abiertos a la vez, cada uno en su pestaña.

Licencia: **GNU AGPL-3.0-or-later** © 2026 José Antonio Manteiga Presedo.

## Publicar en GitHub Pages

1. Cree un repositorio público (por ejemplo `epdf`) y suba **todo el contenido de esta carpeta** a la raíz.
2. En el repositorio, vaya a *Settings › Pages › Build and deployment* y elija *Source: **GitHub Actions***. El flujo `.github/workflows/ci.yml` ejecuta las pruebas automáticas en cada `push` y, si pasan, publica la web (sin las pruebas). Puede ver el resultado en la pestaña *Actions*.
3. Edite `js/app.js` y en `SOURCE_URL` ponga la URL del repositorio. La AGPL obliga a ofrecer el código fuente a los usuarios y esa dirección aparece en *Ayuda › Acerca de*.
4. En el iPad, abra `https://<usuario>.github.io/epdf/` en Safari, pulse *Compartir › Añadir a pantalla de inicio* y ábrala desde el icono. Funciona sin conexión a partir de la primera visita.

No necesita compilación: es HTML, CSS y JavaScript con las librerías en `vendor/`.
Para probarlo en local: `python3 -m http.server` en esta carpeta y abra `http://localhost:8000`.

**Pruebas automáticas** (opcional, en ordenador): `npm install`, `npx playwright install chromium` y `npx playwright test`. Cubren abrir, anotar y deshacer, organizar páginas, rellenar formularios, firmar con .p12 y validar, reducir tamaño, comparar planos, capas, recuento y exportación a Excel, censura con patrones, zona a tabla, respuestas a comentarios y PDF/A. El certificado `tests/fixtures/test.p12` (contraseña 1234) es ficticio y solo sirve para las pruebas.

Requisitos: **iPadOS 16.5 o posterior** (Safari).

## Interfaz
- **Barra superior**: pestañas de documentos abiertos, Buscar, Deshacer/Rehacer, Compartir, **Guardar** y **☰ Menú** (abrir, recientes, guardar como, exportar, imprimir, propiedades, preferencias, ayuda).
- **Selector de modo** flotante; al pulsar el modo activo se oculta/muestra su barra de herramientas.
- **Paneles** (miniaturas, marcadores, comentarios, firmas, capas): botones flotantes a la derecha.
- **Píldora inferior**: página, zoom, ajustar al ancho/página.

| Modo | Herramientas |
|---|---|
| **Leer** | Mano, seleccionar, **párrafo** (también **Ctrl/⌘ + clic** en cualquier modo; con Mayús se añaden más párrafos): copiar, leer en voz alta, resaltar, subrayar, tachar, comentar, editar, buscar, compartir o censurar, buscar, ajustar, girar vista, copiar, captura, leer en voz alta, páginas oscuras, cuadrícula, pantalla completa |
| **Anotar** | Resaltar, subrayar, tachar, lápiz, **solo lápiz** (el dedo desplaza), rectángulo, elipse, flecha, línea, nota, texto, cuadro de texto, sello, **sello de revisión** (estado, revisor, fecha, nº de revisión, proyecto), borrar, lista de comentarios con **respuestas y estado** (aceptado, rechazado…), **informe de comentarios en Excel, PDF o HTML**. Al tocar un comentario: tiradores para redimensionar, color, grosor, opacidad, copiar, cortar, eliminar |
| **Medir** | **Calibrar** sobre una cota conocida o escala 1:N, distancia, perímetro, área, ángulo, **contador de símbolos por categoría**, **exportar mediciones y recuentos a Excel**, **capas** del plano, **superponer revisiones** |
| **Editar** | Copiar/cortar/pegar comentarios e imágenes **entre documentos**, **editar línea** y **editar párrafo** (reajusta las líneas), **mover/escalar/eliminar imágenes**, añadir texto, imagen, marca de agua, fondo, encabezado y pie, numeración, aplanar, propiedades |
| **Páginas** | Copiar/cortar/pegar páginas entre documentos, miniaturas, insertar, eliminar, extraer, mover, duplicar, girar, recortar, combinar, dividir, reemplazar, invertir, marcadores |
| **Formulario** | Campos (texto, casilla, opción, desplegable, lista, fecha, botón, firma) con **formatos** (número, €, %, fecha, email, teléfono, DNI/NIE/CIF), mínimo/máximo, **cálculos** (suma, producto, media, mín., máx. o fórmula), **orden de tabulación**, **alinear y distribuir**, resaltar, aplicar, importar/exportar JSON-XFDF-CSV, vaciar, aplanar |
| **Firmar** | **Firma digital PAdES** (.p12/.pfx o AutoFirma), **firma por lotes**, **sello de tiempo**, **firma longeva (LTV)**, certificar, **validar** (con revocación OCSP/CRL), firma visible con **imagen manuscrita**, firma manuscrita, contraseña AES-256, censura real con patrones (DNI/NIE, CIF, email, teléfono, IBAN, CCC, tarjetas, matrículas, nº SS, fechas y **patrones propios**), depurar metadatos |
| **Convertir** | **OCR** (es/gl/en), **zona a tabla** (Excel, con OCR si es escaneado), **convertir a PDF/A-2b**, escanear con cámara, desde fotos, a imágenes, a texto, **reducir tamaño** (remuestrea imágenes, subconjunto de fuentes, elimina miniaturas, datos privados, JavaScript, adjuntos, metadatos o XFA), **comparar planos** (zonas cambiadas en naranja), comparar texto, recuento de palabras, accesibilidad |

### PDF/A
Los documentos PDF/A (como los justificantes de la Xunta) muestran una **franja de aviso** ámbar. Antes de la primera modificación se pide confirmación expresa (*Permitir la edición*), porque el documento dejará de cumplir la norma.

### Firma digital
- **Certificado .p12 / .pfx** (por ejemplo, el de la FNMT exportado con su clave privada). La firma es PAdES `ETSI.CAdES.detached` con SHA-256 y el atributo *signing-certificate-v2*, y se guarda de forma **incremental**, de modo que las firmas anteriores siguen siendo válidas. Admite firma visible (dibujando el recuadro), invisible, en un campo de firma que ya exista y la certificación (DocMDP). El certificado solo se guarda en memoria mientras la app está abierta.
- **AutoFirma / Cliente @firma**: en ordenador con AutoFirma instalado funciona directamente. **En iPad**, la app *Cliente @firma* necesita los servicios intermedios `afirma-signature-storage` y `afirma-signature-retriever` de la Suite @firma, publicados en un servidor HTTPS. Sus URL se configuran en *☰ Menú › Preferencias*.
- **Sello de tiempo, revocación y LTV**: necesitan un pequeño intermediario porque las TSA y los servicios OCSP/CRL no aceptan llamadas desde el navegador. Está en `server/` (Cloudflare Workers gratuito o Node.js) con instrucciones en `server/LEEME.md`; su dirección se indica en *☰ Menú › Preferencias › Servicios de firma*. Por él solo pasan resúmenes y números de serie, nunca los documentos.
- **Firma por lotes**: *Firmar › Por lotes* firma varios documentos abiertos y/o archivos del iPad con una sola contraseña; los archivos no abiertos se devuelven en un ZIP.
- **Validar firmas** comprueba la integridad, la firma criptográfica y la **cadena de confianza** frente a las autoridades españolas incluidas (FNMT, DNIe, ACCV, Izenpe, Firmaprofesional, ANF), obtenidas de fuentes públicas (almacén de Mozilla y repositorio MeLlamoPablo/SpainAssist). Con el intermediario configurado, también consulta la **revocación** (OCSP, o CRL si no hay OCSP) y muestra el sello de tiempo. Para una validación oficial está [VALIDe](https://valide.redsara.es/valide/).

### PDF/A-2b
*Convertir › A PDF/A* incrusta las fuentes que falten (sustitutas con las mismas medidas: Liberation Sans para Helvetica/Arial, Foxit Serif para Times, Foxit Fixed para Courier), añade el perfil sRGB y los metadatos XMP, y elimina JavaScript, acciones, adjuntos, XFA y multimedia. Si el documento usa color CMYK de dispositivo, avisa: en ese caso conviene generar el PDF/A desde la aplicación de origen. Para una validación formal use veraPDF.

### Otras funciones
- **Recuperación automática**: los documentos con cambios se guardan en el propio iPad cada pocos segundos; si Safari se cierra, al volver se ofrece *Recuperar documentos*.
- **Segundo plano**: reducir tamaño, combinar, dividir, extraer texto y buscar en documentos grandes se ejecutan en un *Web Worker* sin bloquear la pantalla.
- **Buscar en todos los documentos**: en la barra de búsqueda, *Todos los documentos* muestra la lista de resultados con su contexto; al tocar uno se abre su pestaña.
- **Idioma y tema**: *☰ Menú › Preferencias › Idioma de la interfaz* (Castellano / Galego) y *Tema* (Claro / Oscuro / Automático).

### Edición de texto
*Editar texto* elimina realmente del contenido el texto de la línea tocada (no solo lo tapa) y escribe el nuevo con la fuente estándar más parecida (Helvetica, Times o Courier, en su variante normal o negrita). Las fuentes incrustadas en el PDF original suelen ser subconjuntos, así que no se pueden reutilizar.

## Limitaciones de esta versión (solo navegador)
- La conversión a Word, Excel o PowerPoint queda para la fase 2, que requiere un servidor con LibreOffice.
- Sello de tiempo, revocación y LTV requieren el intermediario de `server/` (los servicios no admiten llamadas desde el navegador).
- No hay etiquetado de accesibilidad (PDF etiquetado).
- Los guardados que no son incrementales (organizar, OCR, formularios nuevos, marcas de agua…) reescriben el archivo; si el documento ya está firmado, la app avisa antes.

## Estructura
```
index.html, sw.js, manifest.webmanifest, css/, icons/
js/app.js              aplicación, pestañas de documentos, Archivo, búsqueda
js/core/               doc (historial/deshacer), viewer (PDF.js), tools (gestos), geom, engine,
                       muops + muworker (segundo plano), formrt (cálculos y validaciones)
js/ui/                 modebar (modos y herramientas), sidebar, dialogs, icons, i18n (gallego, tema)
js/cmd/                annot, clip, measure, plans (superposición, capas, recuento), zone (zona a tabla),
                       pdfa, organize, forms, protect, draw, convert, review
js/sign/               pades (firma/validación), ltv (TSA, OCSP, CRL, DSS), autofirma, trust-es (CA españolas)
js/core/xlsx.js        generador de hojas Excel sin dependencias
server/                intermediario para TSA/OCSP/CRL (Cloudflare Workers o Node.js)
tests/, .github/       pruebas Playwright y publicación automática
vendor/                MuPDF.js (AGPL), PDF.js, pdf-lib, node-forge, Tesseract.js + idiomas, AutoScript
```

## Componentes de terceros
MuPDF.js (AGPL-3.0, Artifex) · PDF.js (Apache-2.0) · pdf-lib (MIT) · node-forge (BSD-3/GPL-2) · Tesseract.js y modelos (Apache-2.0) · AutoScript, de la Suite @firma (GPL-2.0+/EUPL-1.1) · Lucide (ISC).
