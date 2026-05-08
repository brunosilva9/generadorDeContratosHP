$XlsmPath = Join-Path $PSScriptRoot "Contratos.xlsm"
$BasPath = Get-ChildItem -Path $PSScriptRoot -Filter "*.bas" | Select-Object -First 1 -ExpandProperty FullName

if (-not $BasPath) {
    Write-Host "ERROR: No se encontró archivo .bas" -ForegroundColor Red
    exit 1
}

Write-Host "XLSM: $XlsmPath" -ForegroundColor Cyan
Write-Host "BAS:  $BasPath" -ForegroundColor Cyan

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false

try {
    $wb = $excel.Workbooks.Open($XlsmPath)
    $vbProject = $wb.VBProject

    # Listar componentes antes
    Write-Host "`nComponentes antes:" -ForegroundColor Yellow
    $modulosEliminar = @()
    foreach ($comp in $vbProject.VBComponents) {
        $tipo = switch ($comp.Type) { 1 { "StdModule" } 3 { "UserForm" } 100 { "Document" } default { $comp.Type } }
        Write-Host "  - $($comp.Name) ($tipo)" -ForegroundColor Gray
        if ($comp.Type -eq 1) {
            $modulosEliminar += $comp
        }
    }

    # Eliminar módulos estándar existentes
    foreach ($comp in $modulosEliminar) {
        Write-Host "Eliminando: $($comp.Name)" -ForegroundColor Yellow
        $vbProject.VBComponents.Remove($comp)
    }

    # Importar el nuevo .bas
    Write-Host "Importando: $BasPath" -ForegroundColor Yellow
    $importado = $vbProject.VBComponents.Import($BasPath)
    Write-Host "Importado: $($importado.Name)" -ForegroundColor Green

    # Verificar líneas
    $codeModule = $importado.CodeModule
    Write-Host "Líneas importadas: $($codeModule.CountOfLines)" -ForegroundColor Green

    $wb.Save()
    Write-Host "`nMacro actualizado correctamente!" -ForegroundColor Green
}
catch {
    Write-Host "ERROR: $_" -ForegroundColor Red
    Write-Host "`nAsegúrate de tener habilitado en Excel:" -ForegroundColor Yellow
    Write-Host "  Archivo > Opciones > Centro de confianza > Configuración del Centro de confianza" -ForegroundColor Yellow
    Write-Host "  > Confianza acceso al modelo de objetos del proyecto de VBA" -ForegroundColor Yellow
    Read-Host "`nPresiona Enter para salir"
}
finally {
    if ($wb) { try { $wb.Close($false) } catch {} }
    $excel.Quit()
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null
}
