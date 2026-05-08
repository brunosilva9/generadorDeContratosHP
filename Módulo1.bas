Attribute VB_Name = "Módulo1"
Option Explicit

Private m_errorFila As Long
Private m_errorPlantilla As String

Private Const NOMBRE_HOJA As String = "Datos"
Private Const CARPETA_SALIDA As String = "Contratos"
Private Const NOMBRE_CONFIG As String = "_Config"
Private Const CELDA_ULTIMA_CARPETA As String = "A1"

Sub GenerarContratosDinamico()

    Dim plantillas() As String
    Dim wdApp As Object
    Dim encabezados() As String
    Dim ultFila As Long, ultCol As Long
    Dim i As Long, k As Long
    Dim totalEmpleados As Long, totalPlantillas As Long
    Dim rutaSalida As String
    Dim generarPDF As Boolean
    Dim respuesta As VbMsgBoxResult

    On Error GoTo ErrorHandler

    Application.ScreenUpdating = False

    If Not HojaExiste(NOMBRE_HOJA) Then
        MsgBox "La hoja '" & NOMBRE_HOJA & "' no existe.", vbExclamation
        GoTo Limpiar
    End If

    ultFila = Sheets(NOMBRE_HOJA).Cells(Rows.Count, 1).End(xlUp).Row
    If ultFila < 2 Then
        MsgBox "No hay empleados en la hoja '" & NOMBRE_HOJA & "'.", vbExclamation
        GoTo Limpiar
    End If

    plantillas = SeleccionarPlantillas()
    If UBound(plantillas) = 0 Then GoTo Limpiar

    GuardarUltimaCarpeta plantillas(1)

    totalEmpleados = ultFila - 1
    totalPlantillas = UBound(plantillas)

    ' === ITEM 3: Vista previa / confirmaci�n ===
    respuesta = MsgBox( _
        "Resumen de generaci�n:" & vbCrLf & _
        "  Empleados encontrados: " & totalEmpleados & vbCrLf & _
        "  Plantillas seleccionadas: " & totalPlantillas & vbCrLf & _
        "  Documentos a generar: " & (totalEmpleados * totalPlantillas) & " por formato" & vbCrLf & vbCrLf & _
        "�Deseas generar tambi�n archivos PDF? (No = solo Word)", _
        vbYesNoCancel + vbQuestion, _
        "Confirmar generaci�n")

    If respuesta = vbCancel Then GoTo Limpiar
    generarPDF = (respuesta = vbYes)

    rutaSalida = ThisWorkbook.Path & "\" & CARPETA_SALIDA & "\"
    If Dir(rutaSalida, vbDirectory) = "" Then MkDir rutaSalida

    ultCol = Sheets(NOMBRE_HOJA).Cells(1, Columns.Count).End(xlToLeft).Column
    encabezados = ObtenerEncabezados(ultCol)

    Set wdApp = IniciarWord()

    For i = 2 To ultFila
        For k = 1 To totalPlantillas
            m_errorFila = i
            m_errorPlantilla = ExtraerNombre(plantillas(k))
            Application.StatusBar = "Generando " & (i - 1) & "/" & totalEmpleados & _
                                     " - Plantilla: " & ExtraerNombre(plantillas(k))
            GenerarContrato wdApp, plantillas(k), encabezados, i, rutaSalida, generarPDF
        Next k
    Next i

    CerrarWord wdApp

    Application.StatusBar = False
    Application.ScreenUpdating = True

    MsgBox "Contratos generados correctamente en: " & rutaSalida & vbCrLf & _
           "Empleados: " & totalEmpleados & " | Plantillas: " & totalPlantillas & _
           IIf(generarPDF, " | Incluye PDF", ""), vbInformation

    ' === ITEM 11: Abrir carpeta al final ===
    On Error Resume Next
    Shell "explorer.exe """ & rutaSalida & """", vbNormalFocus
    On Error GoTo 0

    Exit Sub

ErrorHandler:
    If Not wdApp Is Nothing Then CerrarWord wdApp
    Application.StatusBar = False
    Application.ScreenUpdating = True
    MsgBox "Error en fila " & m_errorFila & ", plantilla: " & m_errorPlantilla & vbCrLf & Err.Description, vbCritical

Limpiar:
    Application.ScreenUpdating = True

End Sub

Private Function SeleccionarPlantillas() As String()

    Dim fDialog As FileDialog
    Dim arr() As String
    Dim k As Long
    Dim ultimaCarpeta As String

    ' === ITEM 9: Usar carpeta persistente ===
    ultimaCarpeta = ObtenerUltimaCarpeta()
    If ultimaCarpeta = "" Then ultimaCarpeta = ThisWorkbook.Path & "\"

    Set fDialog = Application.FileDialog(msoFileDialogFilePicker)
    With fDialog
        .Title = "Selecciona una o m&aacute;s plantillas (.doc / .docx)"
        .Filters.Clear
        .Filters.Add "Documentos Word", "*.doc;*.docx"
        .AllowMultiSelect = True
        .InitialFileName = ultimaCarpeta

        If .Show = -1 Then
            ReDim arr(1 To .SelectedItems.Count)
            For k = 1 To .SelectedItems.Count
                arr(k) = .SelectedItems(k)
            Next k
        Else
            ReDim arr(0)
        End If
    End With
    Set fDialog = Nothing

    SeleccionarPlantillas = arr

End Function

Private Function IniciarWord() As Object

    Dim wdApp As Object
    Set wdApp = CreateObject("Word.Application")
    wdApp.Visible = False
    Set IniciarWord = wdApp

End Function

Private Sub CerrarWord(ByVal wdApp As Object)

    If wdApp Is Nothing Then Exit Sub
    wdApp.Quit
    Set wdApp = Nothing

End Sub

Private Function ObtenerEncabezados(ByVal ultCol As Long) As String()

    Dim arr() As String
    Dim j As Long
    Dim valorCell As Variant

    ReDim arr(1 To ultCol)
    For j = 1 To ultCol
        valorCell = Sheets(NOMBRE_HOJA).Cells(1, j).Value
        If IsError(valorCell) Then
            arr(j) = ""
        Else
            arr(j) = LimpiarCaracteres(Trim(CStr(valorCell)))
        End If
    Next j

    ObtenerEncabezados = arr

End Function

Private Sub GenerarContrato(ByVal wdApp As Object, _
                            ByVal rutaPlantilla As String, _
                            ByRef encabezados() As String, _
                            ByVal fila As Long, _
                            ByVal rutaSalida As String, _
                            ByVal generarPDF As Boolean)

    Dim wdDoc As Object
    Dim j As Long
    Dim valor As String
    Dim rutaDoc As String
    Dim docText As String
    Dim searchPos As Long, endPos As Long
    Dim leftover As String

    Set wdDoc = wdApp.Documents.Open(rutaPlantilla)

    For j = LBound(encabezados) To UBound(encabezados)
        If encabezados(j) <> "" Then
            valor = FormatearValor(encabezados(j), Sheets(NOMBRE_HOJA).Cells(fila, j).Value)
            If valor <> "" Then
                With wdDoc.Content.Find
                    .Text = "<" & encabezados(j) & ">"
                    .Replacement.Text = valor
                    .Execute Replace:=2
                End With
            End If
        End If
    Next j

    docText = wdDoc.Content.Text
    searchPos = InStr(docText, "<")
    If searchPos > 0 Then
        leftover = ""
        Do While searchPos > 0
            endPos = InStr(searchPos, docText, ">")
            If endPos > 0 Then
                leftover = leftover & Mid(docText, searchPos, endPos - searchPos + 1) & vbCrLf
                searchPos = InStr(endPos + 1, docText, "<")
            Else
                Exit Do
            End If
        Loop
        If leftover <> "" Then
            MsgBox "Placeholders sin reemplazar en " & ExtraerNombre(rutaPlantilla) & ":" & vbCrLf & vbCrLf & leftover & _
                   "Verifica que estén escritos correctamente en la hoja Datos.", vbExclamation
        End If
    End If

    rutaDoc = rutaSalida & NombreArchivoSalida(fila, ExtraerNombre(rutaPlantilla))
    wdDoc.SaveAs rutaDoc

    If generarPDF Then
        Dim rutaPDF As String
        rutaPDF = Left(rutaDoc, Len(rutaDoc) - 5) & ".pdf"
        On Error Resume Next
        wdDoc.SaveAs rutaPDF, 17
        If Err.Number <> 0 Then
            MsgBox "No se pudo generar el PDF para " & ExtraerNombre(rutaPlantilla) & ":" & vbCrLf & Err.Description, vbExclamation
            Err.Clear
        End If
        On Error GoTo 0
    End If

    wdDoc.Close False

End Sub

' === Helper: limpieza de caracteres especiales ===
Private Function LimpiarCaracteres(ByVal texto As String) As String

    Dim resultado As String
    resultado = texto
    resultado = Replace(resultado, "á", "a")
    resultado = Replace(resultado, "é", "e")
    resultado = Replace(resultado, "í", "i")
    resultado = Replace(resultado, "ó", "o")
    resultado = Replace(resultado, "ú", "u")
    resultado = Replace(resultado, "ü", "u")
    resultado = Replace(resultado, "ñ", "n")
    resultado = Replace(resultado, "Á", "A")
    resultado = Replace(resultado, "É", "E")
    resultado = Replace(resultado, "Í", "I")
    resultado = Replace(resultado, "Ó", "O")
    resultado = Replace(resultado, "Ú", "U")
    resultado = Replace(resultado, "Ü", "U")
    resultado = Replace(resultado, "Ñ", "N")
    LimpiarCaracteres = resultado

End Function

' === ITEM 6: Formateo de valores ===
Private Function FormatearValor(ByVal campo As String, ByVal valor As Variant) As String

    Dim v As String

    If IsError(valor) Then
        FormatearValor = ""
        Exit Function
    End If
    v = Trim(CStr(valor))
    If v = "" Then
        FormatearValor = ""
        Exit Function
    End If
    v = LimpiarCaracteres(v)

    Select Case UCase(campo)
        Case "RUT", "RUTEMPRESA"
            v = FormatearRUT(v)
        Case "FECHANACIMIENTO", "FECHAINGRESO", "FECHADEFIRMA"
            If IsDate(v) Then
                v = Format(CDate(v), "dd/mm/yyyy")
            End If
    End Select

    FormatearValor = v

End Function

Private Function FormatearRUT(ByVal valor As String) As String

    Dim parts() As String
    Dim num As String, dv As String
    Dim fmt As String
    Dim p As Long

    parts = Split(valor, "-")
    If UBound(parts) = 1 Then
        num = parts(0)
        dv = parts(1)
        fmt = ""
        For p = 1 To Len(num)
            fmt = Mid(num, Len(num) - p + 1, 1) & fmt
            If p Mod 3 = 0 And p < Len(num) Then
                fmt = "." & fmt
            End If
        Next p
        FormatearRUT = fmt & "-" & dv
    Else
        FormatearRUT = valor
    End If

End Function

Private Function ExtraerNombre(ByVal ruta As String) As String

    Dim nombre As String
    nombre = Mid(ruta, InStrRev(ruta, "\") + 1)
    nombre = Left(nombre, InStrRev(nombre, ".") - 1)
    ExtraerNombre = nombre

End Function

Private Function NombreArchivoSalida(ByVal fila As Long, ByVal nombrePlantilla As String) As String

    Dim valorCell As Variant
    Dim nombreEmpleado As String
    valorCell = Sheets(NOMBRE_HOJA).Cells(fila, 1).Value
    If IsError(valorCell) Then valorCell = "ERROR"
    nombreEmpleado = Replace(CStr(valorCell), " ", "_")
    NombreArchivoSalida = LimpiarCaracteres(nombreEmpleado) & "_" & nombrePlantilla & "_Contrato.docx"

End Function

Private Function HojaExiste(ByVal nombreHoja As String) As Boolean

    Dim hoja As Object
    On Error Resume Next
    Set hoja = Sheets(nombreHoja)
    On Error GoTo 0
    HojaExiste = Not hoja Is Nothing

End Function

' === ITEM 9: Configuraci�n persistente ===
Private Function ObtenerUltimaCarpeta() As String

    AsegurarHojaConfig
    On Error Resume Next
    ObtenerUltimaCarpeta = Trim(Sheets(NOMBRE_CONFIG).Range(CELDA_ULTIMA_CARPETA).Value)
    On Error GoTo 0

End Function

Private Sub GuardarUltimaCarpeta(ByVal rutaPlantilla As String)

    Dim folder As String
    folder = Mid(rutaPlantilla, 1, InStrRev(rutaPlantilla, "\"))
    AsegurarHojaConfig
    Sheets(NOMBRE_CONFIG).Range(CELDA_ULTIMA_CARPETA).Value = folder

End Sub

Private Sub AsegurarHojaConfig()

    Dim ws As Worksheet
    On Error Resume Next
    Set ws = Sheets(NOMBRE_CONFIG)
    On Error GoTo 0
    If ws Is Nothing Then
        Set ws = Worksheets.Add
        ws.Name = NOMBRE_CONFIG
        ws.Visible = xlSheetVeryHidden
    End If

End Sub
