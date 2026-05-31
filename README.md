# Generador de Contratos

App web 100% client-side que genera contratos `.docx` a partir de una planilla Excel y una o más plantillas Word. Sin instalación, sin Word, sin backend — todo corre en el navegador.

**Sitio en vivo:** https://brunosilva9.github.io/generadorDeContratosHP/

## Qué hace

1. Subís un Excel con los datos (un encabezado por columna) y N plantillas `.docx` con marcadores tipo `<Nombre>`, `<RUT>`, etc.
2. Editás los datos en el preview y configurás cuántas copias generar de cada plantilla por persona.
3. Descargás:
   - **ZIP** — `{persona}/{plantilla}.docx`, un archivo por (fila × plantilla), para archivo digital.
   - **PDF** — cada (fila × plantilla) repetido `copias` veces, para imprimir.

## PDF con fidelidad de Word

El PDF se genera con **LibreOffice compilado a WebAssembly** ([ZetaOffice](https://zetaoffice.net/)) corriendo dentro del navegador, así sale igual que Word — líneas de firma, columnas, tabuladores, todo. La primera generación descarga ~300 MB del runtime desde el CDN de ZetaOffice y queda cacheado. Si el navegador no lo soporta, cae automáticamente a un render alternativo (menos fiel).

Los datos nunca salen del navegador.

## Desarrollo

```bash
npm install
npm run dev      # Vite + HMR
npm test         # vitest
npm run lint
npm run build    # bundle a dist/
```

UI en español. Despliegue automático a GitHub Pages en cada push a `master`. Detalles de arquitectura en [CLAUDE.md](CLAUDE.md).
