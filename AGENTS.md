# AGENTS.md — generadorDeContratosHP

## Project

Excel VBA macro (`Módulo1.bas`) inside `Contratos.xlsm` that reads employee data from sheet **Datos** and generates Word contracts by filling `<PLACEHOLDER>` tags in `.docx` templates.

## Key files

| File | Role |
|------|------|
| `Contratos.xlsm` | Workbook containing the macro + data sheet |
| `Módulo1.bas` | Source of the VBA macro (exported from .xlsm) |
| `MODELO.docx`, `anexo.docx` | Word templates with `<NOMBRECOMPLETO>`, `<RUT>`, etc. placeholders |
| `Contratos/` | Generated output (gitignored) |

## Workflow

1. Enter employee data in **Datos** sheet (column headers = placeholder names)
2. Click **"Crear Contratos"** button (calls `GenerarContratosDinamico()`)
3. File picker opens — select one or more `.docx` templates
4. Contracts generated at `Contratos/{nombre}_{plantilla}_Contrato.docx`

## Editing the macro

1. Edit `Módulo1.bas`
2. Open Excel → `Alt+F11` → delete old module → `File > Import` the `.bas` → save `.xlsm`

## Conventions

- Placeholders: `<COLUMN_HEADER>` (exact match, case-insensitive via Word Find)
- Sheet name: `Datos` (hardcoded)
- Template must be `.docx`
- No tests, no build, no lint — pure VBA
- No CI, no package manager
