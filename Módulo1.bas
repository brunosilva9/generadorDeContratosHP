Attribute VB_Name = "M�dulo1"
Sub GenerarContratosDinamico()

Dim wdApp As Object, wdDoc As Object
    Dim plantillas() As String, destinoCarpeta As String
    Dim i As Long, j As Long, k As Long, ultCol As Long, cant As Long
    Dim nombreArchivo As String, nombrePlantilla As String
    Dim campo As String, valor As String
    Dim fDialog As FileDialog

    Application.ScreenUpdating = False

    ' === CONFIGURACIÓN ===
    destinoCarpeta = ThisWorkbook.Path & "\Contratos\"

    ' Crear carpeta si no existe
    If Dir(destinoCarpeta, vbDirectory) = "" Then MkDir destinoCarpeta

    ' === SELECCIÓN DE PLANTILLAS ===
    Set fDialog = Application.FileDialog(msoFileDialogFilePicker)
    With fDialog
        .Title = "Selecciona una o más plantillas (.doc / .docx)"
        .Filters.Clear
        .Filters.Add "Documentos Word", "*.doc;*.docx"
        .AllowMultiSelect = True
        .InitialFileName = ThisWorkbook.Path & "\"

        If .Show = -1 Then
            cant = .SelectedItems.Count
            ReDim plantillas(1 To cant)
            For k = 1 To cant
                plantillas(k) = .SelectedItems(k)
            Next k
        Else
            MsgBox "No seleccionaste ninguna plantilla. Se cancela la operación.", vbExclamation
            Exit Sub
        End If
    End With
    Set fDialog = Nothing

    ' Iniciar Word
    Set wdApp = CreateObject("Word.Application")
    wdApp.Visible = False

    ' Detectar última columna con encabezado
    ultCol = Sheets("Datos").Cells(1, Columns.Count).End(xlToLeft).Column

    ' Recorre todas las filas con datos (desde la 2)
    For i = 2 To Sheets("Datos").Cells(Rows.Count, 1).End(xlUp).Row

        ' Recorre todas las plantillas seleccionadas
        For k = LBound(plantillas) To UBound(plantillas)

            Set wdDoc = wdApp.Documents.Open(plantillas(k))

            ' Reemplaza dinámicamente cada campo
            For j = 1 To ultCol
                campo = Trim(Sheets("Datos").Cells(1, j).Value)
                valor = Trim(Sheets("Datos").Cells(i, j).Value)

                If campo <> "" Then
                    With wdDoc.Content.Find
                        .Text = "<" & campo & ">"
                        .Replacement.Text = valor
                        .Execute Replace:=2
                    End With
                End If
            Next j

            ' Obtener nombre de la plantilla (sin ruta ni extensión)
            nombrePlantilla = plantillas(k)
            nombrePlantilla = Mid(nombrePlantilla, InStrRev(nombrePlantilla, "\") + 1)
            nombrePlantilla = Left(nombrePlantilla, InStrRev(nombrePlantilla, ".") - 1)

            ' Generar nombre de archivo
            nombreArchivo = destinoCarpeta & _
                            Replace(Sheets("Datos").Cells(i, 1).Value, " ", "_") & "_" & nombrePlantilla & "_Contrato.docx"

            wdDoc.SaveAs2 nombreArchivo
            wdDoc.Close False
        Next k
    Next i

    wdApp.Quit
    Set wdApp = Nothing

    Application.ScreenUpdating = True

    MsgBox "Contratos generados correctamente en: " & destinoCarpeta, vbInformation

End Sub


