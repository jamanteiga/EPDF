# Intermediario de servicios de firma (opcional)

El navegador no puede llamar directamente a las autoridades de sellado de tiempo (TSA) ni a los servicios OCSP y CRL de las autoridades de certificación, porque no admiten llamadas desde páginas web (CORS). Este intermediario reenvía esas peticiones y añade las cabeceras necesarias.

**Qué pasa por él:** solo el resumen (hash) de la firma, el número de serie del certificado y listas públicas de revocación. **Los documentos nunca salen del iPad.** Además, solo reenvía peticiones a dominios de prestadores de confianza (FNMT, DNIe, ACCV, Izenpe, Firmaprofesional, ANF, Camerfirma, Uanataca, DigiCert, Sectigo, GlobalSign, FreeTSA…).

Solo hace falta para el **sello de tiempo**, la **comprobación de revocación** al validar y la **firma longeva (LTV)**. Todo lo demás funciona sin él.

## Opción A · Cloudflare Workers (gratuito, sin servidor propio)

1. Cree una cuenta gratuita en <https://dash.cloudflare.com>.
2. Vaya a **Workers & Pages › Create › Create Worker**, póngale el nombre `epdf-proxy` y pulse **Deploy**.
3. Pulse **Edit code**, borre el contenido, pegue el de `epdf-proxy-worker.js` y pulse **Deploy**.
4. En **Settings › Variables and Secrets**, añada `ALLOW_ORIGIN` con la dirección de su ePDF (por ejemplo `https://usuario.github.io`) para que nadie más lo use.
5. Copie la dirección del worker (`https://epdf-proxy.<usuario>.workers.dev`).
6. En ePDF: **☰ Menú › Preferencias › Servicios de firma › URL del intermediario**, péguela y pulse **Guardar**.

Con la herramienta `wrangler`, en esta carpeta basta con ejecutar `npx wrangler deploy`.

Cloudflare solo permite conectar con los puertos estándar (80 y 443) y algunos más. Si su TSA usa otro puerto (por ejemplo, ACCV en el 8318), use la opción B.

## Opción B · Servidor propio con Node.js (NAS, VPS, Raspberry Pi…)

```
PORT=8787 ALLOW_ORIGIN=https://usuario.github.io node server/epdf-proxy-node.mjs
```

Necesita Node 18 o posterior. Publíquelo con HTTPS (Caddy, nginx…), porque Safari no permite llamadas HTTP desde una página HTTPS.

## Sello de tiempo

Por defecto se usa la TSA gratuita de DigiCert (`http://timestamp.digicert.com`). Puede indicar otra en **☰ Menú › Preferencias › Servidor de sello de tiempo (TSA)**, por ejemplo la de su organización. Si es de otro dominio, añádalo a `ALLOW_HOSTS`.
