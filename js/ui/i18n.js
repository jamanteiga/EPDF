// ePDF — idioma de la interfaz (castellano / galego)
// Traduce textos y atributos de la interfaz (no el contenido de los PDF) mediante un diccionario.
// SPDX-License-Identifier: AGPL-3.0-or-later
import { settings } from "../core/engine.js";

const GL = {
  // barra superior, modos y paneles
  "Toque para ir · ☐ para seleccionar · arrastre para reordenar": "Toque para ir · ☐ para seleccionar · arrastre para reordenar",
  "Certificar (impide cambios posteriores salvo rellenar formularios y firmar)": "Certificar (impide cambios posteriores agás encher formularios e asinar)",
  "Firmado digitalmente por:": "Asinado dixitalmente por:", "Usar otro certificado (opcional)": "Usar outro certificado (opcional)",
  "Anterior": "Anterior", "Siguiente": "Seguinte", "Primera": "Primeira", "Última": "Última", "Zoom": "Zoom", "Acercar": "Achegar", "Alejar": "Afastar",
  "Ajustar al ancho": "Axustar ao ancho", "Ajustar a la página": "Axustar á páxina", "Seleccionar comentarios": "Seleccionar comentarios", "Selección de texto": "Selección de texto",
  "Editar texto": "Editar texto", "Editar imágenes": "Editar imaxes", "Máquina de escribir": "Máquina de escribir", "Cuadro de texto": "Caixa de texto", "Borrador": "Borrador",
  "Marcar para censurar": "Marcar para censurar", "Instantánea": "Instantánea", "Situar firma": "Situar sinatura", "Situar imagen": "Situar imaxe", "Campo de formulario": "Campo de formulario",
  "Ondulado": "Ondulado", "Resaltado": "Resaltado", "Subrayado": "Subliñado", "Tachado": "Riscado", "Polilínea": "Poliliña", "Polígono": "Polígono", "Imagen": "Imaxe",
  "Sí": "Si", "No": "Non", "Sin cambios": "Sen cambios", "Galego": "Galego", "Castellano": "Castelán", "Recargar": "Recargar", "Idioma": "Idioma",
  "Buscar": "Buscar", "Deshacer": "Desfacer", "Rehacer": "Refacer", "Compartir": "Compartir", "Guardar": "Gardar", "Menú": "Menú",
  "Leer": "Ler", "Anotar": "Anotar", "Medir": "Medir", "Editar": "Editar", "Páginas": "Páxinas", "Formulario": "Formulario", "Firmar": "Asinar", "Convertir": "Converter",
  "Mano": "Man", "Seleccionar": "Seleccionar", "Elegir": "Escoller", "Resaltar": "Resaltar", "Subrayar": "Subliñar", "Tachar": "Riscar", "Lápiz": "Lapis",
  "Rectángulo": "Rectángulo", "Elipse": "Elipse", "Flecha": "Frecha", "Línea": "Liña", "Nota": "Nota", "Texto": "Texto", "Cuadro": "Caixa", "Sello": "Selo",
  "Borrar": "Borrar", "Solo lápiz": "Só lapis", "Color": "Cor", "Resalte": "Resalte", "Letra": "Letra", "Lista": "Lista", "Resumen": "Resumo", "Quitar todo": "Quitar todo",
  "Escala 1:N": "Escala 1:N", "Calibrar": "Calibrar", "Distancia": "Distancia", "Perímetro": "Perímetro", "Área": "Área", "Ángulo": "Ángulo", "Medidas": "Medidas", "Informe": "Informe",
  "Copiar": "Copiar", "Cortar": "Cortar", "Pegar": "Pegar", "Editar línea": "Editar liña", "Editar párrafo": "Editar parágrafo", "Añadir texto": "Engadir texto",
  "Mover imagen": "Mover imaxe", "Añadir imagen": "Engadir imaxe", "Marca agua": "Marca de auga", "Fondo": "Fondo", "Encabezado": "Cabeceira", "Numerar": "Numerar",
  "Aplanar": "Aplanar", "Propiedades": "Propiedades", "Miniaturas": "Miniaturas", "Insertar": "Inserir", "Eliminar": "Eliminar", "Extraer": "Extraer",
  "Copiar pág.": "Copiar páx.", "Cortar pág.": "Cortar páx.", "Pegar pág.": "Pegar páx.", "Mover": "Mover", "Duplicar": "Duplicar", "Girar izq.": "Xirar esq.",
  "Girar der.": "Xirar der.", "Recortar": "Recortar", "Combinar": "Combinar", "Dividir": "Dividir", "Reemplazar": "Substituír", "Invertir": "Inverter",
  "Marcador": "Marcador", "Índice auto": "Índice auto", "Casilla": "Caixa de verificación", "Opción": "Opción", "Desplegable": "Despregable", "Fecha": "Data",
  "Botón": "Botón", "Campo firma": "Campo sinatura", "Alinear": "Aliñar", "Orden tab.": "Orde tab.", "Aplicar": "Aplicar", "Importar": "Importar", "Exportar": "Exportar", "Vaciar": "Baleirar",
  "Certificar": "Certificar", "Validar": "Validar", "Manuscrita": "Manuscrita", "Certificado": "Certificado", "Contraseña": "Contrasinal", "Seguridad": "Seguridade",
  "Censurar": "Censurar", "Buscar datos": "Buscar datos", "Depurar": "Depurar", "Escanear": "Escanear", "Desde fotos": "Desde fotos", "En blanco": "En branco",
  "A imágenes": "A imaxes", "A texto": "A texto", "Reducir": "Reducir", "A Word": "A Word", "A Excel": "A Excel", "Comparar planos": "Comparar planos",
  "Comparar texto": "Comparar texto", "Palabras": "Palabras", "Accesible": "Accesible", "Ancho": "Ancho", "Página": "Páxina", "Girar vista": "Xirar vista",
  "Captura": "Captura", "Leer voz": "Ler en voz alta", "Parar voz": "Parar voz", "Oscuro": "Escuro", "Cuadrícula": "Grade", "Pantalla": "Pantalla completa",
  "Marcadores": "Marcadores", "Comentarios": "Comentarios", "Firmas": "Sinaturas", "Cerrar panel": "Pechar panel",
  // pantalla inicial y Archivo
  "Abrir PDF": "Abrir PDF", "Desde imágenes": "Desde imaxes", "Nuevo en blanco": "Novo en branco", "Archivos recientes": "Ficheiros recentes",
  "También puede arrastrar archivos PDF aquí.": "Tamén pode arrastrar ficheiros PDF aquí.",
  "Editor PDF libre · funciona en tu dispositivo, sin enviar documentos a ningún servidor": "Editor PDF libre · funciona no teu dispositivo, sen enviar documentos a ningún servidor",
  "Abrir": "Abrir", "Guardar como…": "Gardar como…", "Guardar copia reducida": "Gardar copia reducida", "Nuevo documento": "Novo documento", "Imprimir": "Imprimir",
  "Propiedades del documento": "Propiedades do documento", "Cambiar nombre": "Cambiar nome", "Revertir": "Reverter", "Cerrar": "Pechar", "Cerrar todo": "Pechar todo",
  "Preferencias": "Preferencias", "Ayuda": "Axuda", "Atajos de teclado": "Atallos de teclado", "Acerca de": "Acerca de", "Examinar…": "Examinar…",
  "Archivos del iPad, iCloud Drive…": "Ficheiros do iPad, iCloud Drive…", "Abrir desde URL": "Abrir desde URL", "Escanear con la cámara": "Escanear coa cámara",
  "Crear desde imágenes": "Crear desde imaxes", "Nuevo documento en blanco": "Novo documento en branco", "Todavía no hay archivos recientes.": "Aínda non hai ficheiros recentes.",
  "Quitar de la lista": "Quitar da lista", "Imágenes (PNG / JPEG)": "Imaxes (PNG / JPEG)", "Texto (.txt)": "Texto (.txt)",
  "Datos de formulario (JSON / XFDF / CSV)": "Datos de formulario (JSON / XFDF / CSV)", "Resumen de comentarios (HTML)": "Resumo de comentarios (HTML)", "Marcadores (.txt)": "Marcadores (.txt)",
  // diálogos comunes
  "Aceptar": "Aceptar", "Cancelar": "Cancelar", "Continuar": "Continuar", "Abra un documento primero": "Abra primeiro un documento", "Procesando…": "Procesando…",
  "Preparando…": "Preparando…", "Error": "Erro", "Páginas": "Páxinas", "Posición": "Posición", "Tamaño (pt)": "Tamaño (pt)", "Tamaño": "Tamaño", "Resultado": "Resultado",
  "Todas las páginas": "Todas as páxinas", "Aplicar a todas las páginas": "Aplicar a todas as páxinas", "Aplicar a páginas": "Aplicar ás páxinas",
  "Intervalo de páginas no válido": "Intervalo de páxinas non válido", "Nada que deshacer": "Nada que desfacer", "Nada que rehacer": "Nada que refacer",
  // documentos y avisos
  "Permitir la edición": "Permitir a edición", "Panel de firmas": "Panel de sinaturas", "Documento firmado": "Documento asinado", "Guardar ahora": "Gardar agora",
  "Cerrar sin guardar": "Pechar sen gardar", "Recuperar documentos": "Recuperar documentos", "Recuperar": "Recuperar", "Documento protegido": "Documento protexido",
  "Introduzca la contraseña para abrir el documento:": "Introduza o contrasinal para abrir o documento:", "Contraseña incorrecta. Inténtelo de nuevo:": "Contrasinal incorrecto. Ténteo de novo:",
  "Buscar en el documento": "Buscar no documento", "Todos los documentos": "Todos os documentos", "Sin resultados": "Sen resultados", "modificado": "modificado",
  // anotar
  "Texto del comentario": "Texto do comentario", "Contenido:": "Contido:", "Texto de la nota:": "Texto da nota:", "Texto…": "Texto…", "Eliminar comentario": "Eliminar comentario",
  "No hay ningún comentario ahí": "Non hai ningún comentario aí", "Toque sobre una línea de texto": "Toque sobre unha liña de texto", "Toque sobre un párrafo de texto": "Toque sobre un parágrafo de texto",
  "Arrastre para dibujar un rectángulo": "Arrastre para debuxar un rectángulo", "Resumir comentarios": "Resumir comentarios", "Borrar comentarios": "Borrar comentarios", "Borrar todos": "Borrar todos",
  "El documento no tiene comentarios.": "O documento non ten comentarios.", "Sin comentarios.": "Sen comentarios.", "Sin marcadores.": "Sen marcadores.", "Sin documento": "Sen documento",
  "El dedo y el lápiz dibujan": "O dedo e o lapis debuxan", "Solo el Apple Pencil dibuja; el dedo desplaza y amplía": "Só o Apple Pencil debuxa; o dedo despraza e amplía",
  "Imagen · arrastre para mover, tiradores para escalar": "Imaxe · arrastre para mover, tiradores para escalar",
  // sellos y firma manuscrita
  "Texto personalizado": "Texto personalizado", "Incluir fecha y autor": "Incluír data e autor", "Usar una imagen como sello…": "Usar unha imaxe como selo…", "Colocar": "Colocar",
  "Firma manuscrita": "Sinatura manuscrita", "Colocar firma": "Colocar sinatura", "Usar en la firma": "Usar na sinatura", "Desde imagen…": "Desde imaxe…",
  "Guardar en este dispositivo": "Gardar neste dispositivo", "Firme aquí con el dedo o el Apple Pencil": "Asine aquí co dedo ou co Apple Pencil", "Azul": "Azul", "Negro": "Negro", "Grosor": "Grosor",
  // medir
  "Escala del plano": "Escala do plano", "Calibrar escala": "Calibrar escala", "Unidad": "Unidade", "Longitud real de la línea dibujada": "Lonxitude real da liña debuxada",
  "Línea demasiado corta": "Liña demasiado curta", "toque los vértices · doble toque o Intro para terminar": "toque os vértices · dobre toque ou Intro para rematar",
  "toque tres puntos: extremo, vértice y extremo": "toque tres puntos: extremo, vértice e extremo", "dibuje una línea sobre una cota de longitud conocida": "debuxe unha liña sobre unha cota de lonxitude coñecida",
  // editar / organizar
  "Marca de agua": "Marca de auga", "Opacidad (%)": "Opacidade (%)", "Ángulo (°)": "Ángulo (°)", "Encabezado y pie de página": "Cabeceira e pé de páxina", "Margen (mm)": "Marxe (mm)",
  "Paginación": "Paxinación", "Prefijo": "Prefixo", "Sufijo": "Sufixo", "Empezar en": "Comezar en", "Dígitos": "Díxitos", "Color de fondo": "Cor de fondo",
  "Insertar páginas": "Inserir páxinas", "Origen": "Orixe", "Páginas en blanco": "Páxinas en branco", "Desde archivo PDF…": "Desde ficheiro PDF…", "Desde imágenes…": "Desde imaxes…",
  "Número de páginas en blanco": "Número de páxinas en branco", "Igual que la página actual": "Igual que a páxina actual", "Después de la página actual": "Despois da páxina actual",
  "Antes de la página actual": "Antes da páxina actual", "Al principio": "Ao principio", "Al final": "Ao final", "Eliminar páginas": "Eliminar páxinas", "Extraer páginas": "Extraer páxinas",
  "Un documento con todas las páginas": "Un documento con todas as páxinas", "Un documento por página (ZIP)": "Un documento por páxina (ZIP)", "Eliminar del original tras extraer": "Eliminar do orixinal despois de extraer",
  "Duplicar páginas": "Duplicar páxinas", "Copias": "Copias", "Mover páginas": "Mover páxinas", "Girar páginas": "Xirar páxinas", "Giro": "Xiro", "90° a la derecha": "90° á dereita",
  "90° a la izquierda": "90° á esquerda", "Recortar páginas": "Recortar páxinas", "Dividir documento": "Dividir documento", "Método": "Método", "Cada N páginas": "Cada N páxinas",
  "En dos mitades": "En dúas metades", "Descargar ZIP": "Descargar ZIP", "Abrir en pestañas": "Abrir en lapelas", "Combinar archivos": "Combinar ficheiros", "Añadir archivos…": "Engadir ficheiros…",
  "Reemplazar páginas": "Substituír páxinas", "Elegir archivo…": "Escoller ficheiro…",
  // formulario
  "Nombre del campo": "Nome do campo", "Valor por defecto": "Valor por defecto", "Varias líneas": "Varias liñas", "Obligatorio": "Obrigatorio", "Formato": "Formato", "Texto libre": "Texto libre",
  "Número": "Número", "Importe (€)": "Importe (€)", "Porcentaje": "Porcentaxe", "Correo electrónico": "Correo electrónico", "Teléfono": "Teléfono", "DNI / NIE / CIF": "DNI / NIE / CIF",
  "Decimales": "Decimais", "Valor mínimo (opcional)": "Valor mínimo (opcional)", "Valor máximo (opcional)": "Valor máximo (opcional)", "Cálculo automático": "Cálculo automático",
  "Ninguno (lo rellena el usuario)": "Ningún (enche o usuario)", "Suma de campos": "Suma de campos", "Producto de campos": "Produto de campos", "Media de campos": "Media de campos",
  "Mínimo de campos": "Mínimo de campos", "Máximo de campos": "Máximo de campos", "Fórmula": "Fórmula", "Campos de origen (separados por comas)": "Campos de orixe (separados por comas)",
  "Crear": "Crear", "Opciones (una por línea)": "Opcións (unha por liña)", "Texto del botón": "Texto do botón", "Acción": "Acción", "Ninguna": "Ningunha", "Valor de esta opción": "Valor desta opción",
  "Orden de tabulación": "Orde de tabulación", "Recorrer los campos": "Percorrer os campos", "Alinear y distribuir campos": "Aliñar e distribuír campos", "Alinear a la izquierda": "Aliñar á esquerda",
  "Alinear a la derecha": "Aliñar á dereita", "Alinear arriba": "Aliñar arriba", "Alinear abajo": "Aliñar abaixo", "Centrar horizontalmente": "Centrar horizontalmente",
  "Igualar ancho (al mayor)": "Igualar ancho (ao maior)", "Igualar alto (al mayor)": "Igualar alto (ao maior)", "Distribuir verticalmente": "Distribuír verticalmente",
  "Distribuir horizontalmente": "Distribuír horizontalmente", "Exportar datos del formulario": "Exportar datos do formulario", "Restablecer formulario": "Restablecer formulario",
  "Restablecer": "Restablecer", "Datos del formulario aplicados": "Datos do formulario aplicados", "No hay valores pendientes": "Non hai valores pendentes", "Campo calculado": "Campo calculado",
  "correo electrónico no válido": "correo electrónico non válido", "teléfono no válido": "teléfono non válido", "DNI/NIE/CIF no válido": "DNI/NIE/CIF non válido",
  "letra de control del DNI/NIE incorrecta": "letra de control do DNI/NIE incorrecta",
  // firmar
  "Firmar documento": "Asinar documento", "Certificar documento": "Certificar documento", "Método de firma": "Método de sinatura", "Certificado en archivo (.p12 / .pfx)": "Certificado en ficheiro (.p12 / .pfx)",
  "AutoFirma / Cliente @firma": "AutoFirma / Cliente @firma", "Archivo de certificado (.p12 / .pfx)": "Ficheiro de certificado (.p12 / .pfx)", "Contraseña del certificado": "Contrasinal do certificado",
  "Apariencia": "Aparencia", "Firma visible: dibujar el recuadro": "Sinatura visible: debuxar o recadro", "Firma invisible": "Sinatura invisible", "Motivo": "Motivo", "Lugar": "Lugar",
  "Imagen en la firma visible": "Imaxe na sinatura visible", "Sin imagen (solo datos del certificado)": "Sen imaxe (só datos do certificado)", "Dibujar firma manuscrita…": "Debuxar sinatura manuscrita…",
  "Firmando…": "Asinando…", "Validar firmas": "Validar sinaturas", "Firma válida · emisor de confianza": "Sinatura válida · emisor de confianza", "Firma válida · emisor no reconocido": "Sinatura válida · emisor non recoñecido",
  "Firma válida · documento modificado después": "Sinatura válida · documento modificado despois", "Firma NO válida": "Sinatura NON válida", "Identidad digital": "Identidade dixital",
  "Olvidar certificado": "Esquecer certificado", "Seguridad por contraseña": "Seguridade por contrasinal", "Proteger el documento al guardar": "Protexer o documento ao gardar",
  "Contraseña de permisos (obligatoria)": "Contrasinal de permisos (obrigatorio)", "Permitir imprimir": "Permitir imprimir", "Permitir copiar texto e imágenes": "Permitir copiar texto e imaxes",
  "Permitir modificar el documento": "Permitir modificar o documento", "Permitir comentarios y rellenar formularios": "Permitir comentarios e encher formularios", "Permitir organizar páginas": "Permitir organizar páxinas",
  "Buscar y censurar": "Buscar e censurar", "Tipo": "Tipo", "Texto exacto": "Texto exacto", "Correos electrónicos": "Correos electrónicos", "Teléfonos": "Teléfonos", "Marcar": "Marcar",
  "Aplicar censura": "Aplicar censura", "Depurar documento": "Depurar documento", "Propiedades de seguridad": "Propiedades de seguridade",
  // convertir / revisar
  "Reconocimiento de texto (OCR)": "Recoñecemento de texto (OCR)", "Idioma del documento": "Idioma do documento", "Reconocer": "Recoñecer", "Omitir páginas que ya contienen texto": "Omitir páxinas que xa conteñen texto",
  "Resolución de análisis": "Resolución de análise", "Reducir tamaño": "Reducir tamaño", "Calidad de las imágenes": "Calidade das imaxes", "Convertir las imágenes a escala de grises": "Converter as imaxes a escala de grises",
  "Aplicar al documento abierto": "Aplicar ao documento aberto", "Descargar una copia": "Descargar unha copia", "Reduciendo tamaño…": "Reducindo tamaño…", "Exportar a imágenes": "Exportar a imaxes",
  "Resolución (ppp)": "Resolución (ppp)", "Comparar documentos": "Comparar documentos", "Comparar": "Comparar", "Comparando…": "Comparando…", "Documento original": "Documento orixinal",
  "Documento modificado": "Documento modificado", "Resolución": "Resolución", "Sensibilidad": "Sensibilidade", "Recuento de palabras": "Reconto de palabras", "Comprobación de accesibilidad": "Comprobación de accesibilidade",
  "Corregir título e idioma…": "Corrixir título e idioma…", "Guardar cambios": "Gardar cambios", "Título": "Título", "Autor": "Autor", "Asunto": "Asunto", "Palabras clave": "Palabras clave",
  "Nuevo marcador": "Novo marcador", "Crear marcadores": "Crear marcadores", "Eliminar marcador": "Eliminar marcador", "Combinando…": "Combinando…", "Dividiendo…": "Dividindo…",
  "Extrayendo texto…": "Extraendo texto…", "Generando imágenes…": "Xerando imaxes…",
  // preferencias
  "Autor de los comentarios": "Autor dos comentarios", "Color por defecto de comentarios": "Cor predeterminada dos comentarios", "Color de resaltado": "Cor de resaltado",
  "Tamaño de letra por defecto (pt)": "Tamaño de letra predeterminado (pt)", "Escala de medición (1:N)": "Escala de medición (1:N)", "Idioma de la interfaz": "Idioma da interface",
  "Tema": "Tema", "Automático (según el sistema)": "Automático (segundo o sistema)", "Claro": "Claro", "Oscuro (interfaz)": "Escuro (interface)",
  "Borrar la lista de archivos recientes": "Borrar a lista de ficheiros recentes", "Borrar firmas manuscritas guardadas": "Borrar sinaturas manuscritas gardadas", "Preferencias guardadas": "Preferencias gardadas",
  "Manual rápido": "Manual rápido", "Licencias de terceros": "Licenzas de terceiros", "Acerca de ePDF": "Acerca de ePDF",
};

const GL2 = {
  // v1.3 — planos, revisión, firma y conversión
  "Superponer": "Superpoñer", "Superponer planos": "Superpoñer planos", "Alinear": "Aliñar", "Sin alinear": "Sen aliñar", "Informe PDF": "Informe PDF", "Nueva": "Nova",
  "Revisión anterior (rojo)": "Revisión anterior (vermello)", "Revisión nueva (azul)": "Revisión nova (azul)", "Capas": "Capas", "Mostrar todas": "Amosar todas", "Ocultar todas": "Agochar todas",
  "Guardar visibilidad en el documento": "Gardar a visibilidade no documento", "Contar": "Contar", "Categoría": "Categoría", "Recuento": "Reconto", "A Excel": "A Excel",
  "Categoría a contar": "Categoría para contar", "Recuento de símbolos": "Reconto de símbolos", "Exportar a Excel": "Exportar a Excel", "Contar símbolos": "Contar símbolos",
  "Sello rev.": "Selo rev.", "Sello de revisión": "Selo de revisión", "Revisado por": "Revisado por", "Fecha": "Data", "Nº de revisión": "Nº de revisión", "Proyecto / referencia (opcional)": "Proxecto / referencia (opcional)",
  "Estado": "Estado", "…o texto propio": "…ou texto propio", "Según el estado": "Segundo o estado", "Colocar": "Colocar", "Informe": "Informe",
  "Responder": "Responder", "Estado…": "Estado…", "Aceptado": "Aceptado", "Rechazado": "Rexeitado", "Completado": "Completado", "Cancelado": "Cancelado", "Pendiente": "Pendente",
  "Pendientes": "Pendentes", "Aceptados": "Aceptados", "Rechazados": "Rexeitados", "Completados": "Completados", "Cancelados": "Cancelados",
  "Informe de comentarios": "Informe de comentarios", "Formato": "Formato", "Incluir": "Incluír", "Generar": "Xerar", "Todos": "Todos",
  "Todos los documentos": "Todos os documentos", "Por lotes": "Por lotes", "Firmar por lotes": "Asinar por lotes", "Firmar todo": "Asinar todo", "Documentos abiertos": "Documentos abertos",
  "Añadir sello de tiempo (TSA)": "Engadir selo de tempo (TSA)", "Firma longeva (LTV)": "Sinatura lonxeva (LTV)", "Firma longeva (LTV): incluir certificados y estado de revocación": "Sinatura lonxeva (LTV): incluír certificados e estado de revogación",
  "Servicios de firma": "Servizos de sinatura", "URL del intermediario": "URL do intermediario", "Servidor de sello de tiempo (TSA)": "Servidor de selo de tempo (TSA)",
  "Firma invisible": "Sinatura invisible", "Visible en la última página": "Visible na última páxina", "Visible en la primera página": "Visible na primeira páxina", "Posición": "Posición",
  "Abajo a la derecha": "Abaixo á dereita", "Abajo a la izquierda": "Abaixo á esquerda", "Arriba a la derecha": "Arriba á dereita", "Arriba a la izquierda": "Arriba á esquerda",
  "Zona a tabla": "Zona a táboa", "Copiar": "Copiar", "Descargar Excel": "Descargar Excel", "A PDF/A": "A PDF/A", "Convertir a PDF/A-2b": "Converter a PDF/A-2b",
  "Título del documento": "Título do documento", "Autor": "Autor", "Resultado": "Resultado", "Convertir el documento abierto": "Converter o documento aberto", "Descargar una copia PDF/A": "Descargar unha copia PDF/A",
  "Buscar y censurar": "Buscar e censurar", "Texto exacto (opcional)": "Texto exacto (opcional)", "Datos a localizar": "Datos para localizar", "Patrón propio": "Patrón propio", "Nombre": "Nome", "Patrón": "Patrón",
  "Guardar este patrón para otras veces": "Gardar este patrón para outras veces", "Coincidencias encontradas": "Coincidencias atopadas", "Marcar para censurar": "Marcar para censurar",
  "Matrículas": "Matrículas", "Fechas": "Datas", "Teléfonos": "Teléfonos", "Tarjetas bancarias": "Tarxetas bancarias", "Nº de la Seguridad Social": "Nº da Seguridade Social",
  "Optimización avanzada": "Optimización avanzada", "No tocar las imágenes": "Non tocar as imaxes", "Reducir las fuentes a los caracteres usados (subconjunto)": "Reducir as fontes aos caracteres usados (subconxunto)",
  "Eliminar miniaturas incrustadas": "Eliminar miniaturas incrustadas", "Eliminar datos privados de aplicaciones (Illustrator, AutoCAD…)": "Eliminar datos privados de aplicacións (Illustrator, AutoCAD…)",
  "Eliminar JavaScript y acciones automáticas": "Eliminar JavaScript e accións automáticas", "Eliminar archivos adjuntos": "Eliminar ficheiros anexos", "Eliminar metadatos (autor, título, XMP)": "Eliminar metadatos (autor, título, XMP)",
  "Eliminar formulario XFA (se conserva el AcroForm)": "Eliminar formulario XFA (consérvase o AcroForm)",
};
Object.assign(GL, GL2);
const PATTERNS = [
  [/^Herramienta: (.+)$/, (m) => "Ferramenta: " + tr(m[1].split(" — ")[0]) + (m[1].includes(" — ") ? " — " + tr(m[1].split(" — ")[1]) : "")],
  [/^(\d+) de (\d+)$/, (m) => `${m[1]} de ${m[2]}`],
  [/^Página (\d+)$/, (m) => `Páxina ${m[1]}`],
];

let dict = null;
export function lang() { return settings.data.lang || "es"; }
export function tr(s) {
  if (!dict) return s;
  const k = s.trim(); if (!k) return s;
  if (dict[k]) return s.replace(k, dict[k]);
  for (const [re, fn] of PATTERNS) { const m = re.exec(k); if (m) return s.replace(k, fn(m)); }
  return s;
}
const SKIP = (n) => n.closest?.(".page, .pcanvas, textarea, input[type=text]");
function walk(root) {
  if (!dict || !root) return;
  if (root.nodeType === 3) { const p = root.parentElement; if (p && !SKIP(p)) { const t = tr(root.nodeValue); if (t !== root.nodeValue) root.nodeValue = t; } return; }
  if (root.nodeType !== 1 || SKIP(root)) return;
  for (const a of ["title", "aria-label", "placeholder"]) if (root.hasAttribute?.(a)) { const v = root.getAttribute(a), t = tr(v); if (t !== v) root.setAttribute(a, t); }
  if (root.tagName === "OPTION") { const t = tr(root.textContent); if (t !== root.textContent) root.textContent = t; return; }
  for (const c of root.childNodes) walk(c);
}
export function initI18n() {
  if (lang() !== "gl") return;
  dict = GL; document.documentElement.lang = "gl";
  walk(document.body);
  new MutationObserver((ms) => { for (const m of ms) { if (m.type === "characterData") walk(m.target); else m.addedNodes.forEach(walk); } })
    .observe(document.body, { childList: true, subtree: true, characterData: true });
}

/** Tema de la interfaz: auto | light | dark */
export function applyTheme() {
  const t = settings.data.theme || "light";
  if (t === "auto") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", t === "dark" ? "#1b1e23" : "#ffffff");
}
