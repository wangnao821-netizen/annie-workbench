' ==============================================================================
' Ever Stones AI 工作台 - Outlook 邮件自动采集与归档宏 (VBA) V5
' ==============================================================================
'
' 【V5 变更】
' 1. 重构邮件保存逻辑为通用的 SaveMailToFolder 函数，支持将新邮件及其附件保存至任意指定文件夹下。
' 2. 导出邮件时，除 metadata.json 与附件外，同时将邮件本身另存为 .msg 格式。
' 3. 新增 SendToVera 宏，支持从 Outlook 中手动选中多封邮件，并弹窗让 Vera 关联选择 CLIENT_FILES_ROOT
'    下的具体案件文件夹，一键归档到该案件的 _Inbox 目录。
' 4. 新增 CLIENT_FILES_ROOT 常量，便于前端初始化设置时动态替换路径配置。
'
' 【V4 变更】
' 1. 去掉 CheckRules 过滤 — 所有邮件都处理（分类由 Python 后端接管）
' 2. metadata.json 新增 entry_id 和 account 字段
' 3. body 截取前 500 字作为 body_preview（后端匹配用）
'
' 【安装方法】
' 1. 在 Outlook 主界面，按下 ALT + F11 打开 VBA 编辑器。
' 2. 在左侧项目资源管理器中，展开 "Microsoft Outlook 对象"，双击打开 "ThisOutlookSession"。
' 3. 将本文件的全部代码复制粘贴到 "ThisOutlookSession" 的代码窗口中。
' 4. 点击保存，重启 Outlook 即可自动激活运行。
' 5. 如果宏未运行，请检查：文件 -> 选项 -> 信任中心 -> 信任中心设置 -> 宏设置，确保允许运行宏。
'
' ==============================================================================

' ------------------------------------------------------------------------------
' 顶部配置区：在此修改以适应您的环境
' ------------------------------------------------------------------------------
' 全局临时收件箱路径（VBA 自动采集的新邮件缓冲区）
Private Const SAVE_ROOT As String = "{{SAVE_ROOT}}"

' 案件档案根目录路径（用于手动搭桥归档时选择关联的具体案件）
' 首次环境初始化时，前端会将此路径动态替换为您配置的 CLIENT_FILES_ROOT 路径
Private Const CLIENT_FILES_ROOT As String = "{{CLIENT_FILES_ROOT}}"

' ==============================================================================
' V5: 去掉了 KEYWORDS 和 SENDERS 常量，并将处理子程序重构为模块化形式
' ==============================================================================
' ------------------------------------------------------------------------------


' Outlook 新邮件到达事件入口（监听新邮件 EntryID）
Private Sub Application_NewMailEx(ByVal EntryIDCollection As String)
    On Error Resume Next ' 容错处理，防止任何未预期错误导致宏中断崩溃
    
    Dim ids() As String
    Dim i As Long
    
    ' EntryIDCollection 可能是用逗号分隔的多个新邮件 ID
    ids = Split(EntryIDCollection, ",")
    For i = LBound(ids) To UBound(ids)
        ProcessMailItem ids(i)
    Next i
End Sub


' 自动处理单封新邮件的子程序（归档至全局临时收件箱）
Private Sub ProcessMailItem(ByVal entryID As String)
    On Error GoTo ErrHandler
    
    Dim mail As Object
    Set mail = Application.Session.GetItemFromID(entryID)
    
    ' 仅处理邮件对象 (MailItem 的 Class 值是 43)
    If mail Is Nothing Or mail.Class <> 43 Then Exit Sub
    
    ' 1. 去重校验：如果这封邮件已经处理过，直接跳过
    If IsAlreadyProcessed(entryID) Then
        Exit Sub
    End If
    
    ' 2. 调用通用的保存函数，将其保存到全局收件箱 SAVE_ROOT 中
    Dim fso As Object
    Set fso = CreateObject("Scripting.FileSystemObject")
    
    If SaveMailToFolder(mail, SAVE_ROOT, fso) Then
        ' 3. 写入去重数据库记录
        RecordProcessed entryID
    End If
    
    Exit Sub
    
ErrHandler:
    ' 发生错误时仅记录日志，不中断宏主进程
    Debug.Print "Error processing mail " & entryID & ": " & Err.Description
End Sub


' 通用保存邮件及其附件的函数 (同时生成 metadata.json 并将原邮件另存为 .msg)
Private Function SaveMailToFolder(ByVal mail As Object, ByVal destInboxRoot As String, ByVal fso As Object) As Boolean
    On Error GoTo ErrHandler
    SaveMailToFolder = False
    
    ' 1. 构建保存的子文件夹路径 (格式: 年月日_时分秒_发件人名字)
    Dim dateStr As String
    dateStr = Format(mail.ReceivedTime, "yyyyMMdd_HHmmss")
    
    Dim senderNameSafe As String
    senderNameSafe = SanitizeFilename(mail.SenderName)
    If senderNameSafe = "" Then senderNameSafe = "unknown_sender"
    
    Dim folderName As String
    folderName = dateStr & "_" & senderNameSafe
    
    Dim targetFolder As String
    targetFolder = destInboxRoot & "\" & folderName
    
    ' 创建目标子文件夹（支持级联创建）
    CreateFolderRecursive fso, targetFolder
    
    ' 2. 保存附件
    Dim attachmentCount As Integer
    Dim attachmentNames As String
    attachmentCount = 0
    attachmentNames = ""
    
    If mail.Attachments.Count > 0 Then
        Dim attach As Object
        For Each attach In mail.Attachments
            ' 排除无文件名的附件
            If attach.filename <> "" Then
                ' --- 过滤内嵌签名图片 ---
                Dim contentId As String
                contentId = ""
                On Error Resume Next
                contentId = attach.PropertyAccessor.GetProperty("http://schemas.microsoft.com/mapi/proptag/0x3712001F")
                On Error GoTo ErrHandler
                
                Dim isInlineImage As Boolean
                isInlineImage = False
                
                Dim lowerName As String
                lowerName = LCase(attach.filename)
                
                ' 有 Content-ID 说明是内嵌图片
                If contentId <> "" Then
                    isInlineImage = True
                End If
                
                ' 常见签名图片模式
                If Left(lowerName, 5) = "image" And (Right(lowerName, 4) = ".png" Or Right(lowerName, 4) = ".jpg" Or Right(lowerName, 5) = ".jpeg" Or Right(lowerName, 4) = ".gif") Then
                    If attach.Size < 30720 Then ' 小于 30KB
                        isInlineImage = True
                    End If
                End If
                
                ' 跳过内嵌签名图片
                If isInlineImage Then
                    GoTo NextAttachment
                End If
                
                Dim safeAttachName As String
                safeAttachName = SanitizeFilename(attach.filename)
                
                Dim savePath As String
                savePath = targetFolder & "\" & safeAttachName
                
                ' 保存到磁盘
                attach.SaveAsFile savePath
                attachmentCount = attachmentCount + 1
                
                ' 收集附件文件名列表
                If attachmentNames <> "" Then attachmentNames = attachmentNames & "|"
                attachmentNames = attachmentNames & attach.filename
            End If
NextAttachment:
        Next attach
    End If
    
    ' 3. 获取 SMTP 格式的发件人邮箱
    Dim senderEmail As String
    senderEmail = GetSmtpAddress(mail)
    
    ' 4. 获取收件账户邮箱（区分多账户）
    Dim accountEmail As String
    accountEmail = GetAccountEmail(mail)
    
    ' 5. 转发邮件提取真正发件人
    Dim originalSenderEmail As String
    Dim originalSenderName As String
    originalSenderEmail = ""
    originalSenderName = ""
    
    If Left(UCase(Trim(mail.Subject)), 3) = "FW:" Or Left(UCase(Trim(mail.Subject)), 4) = "FWD:" Then
        ' 从正文中解析 From: 行
        ExtractOriginalSender mail.body, originalSenderEmail, originalSenderName
    End If
    
    ' 6. 生成 metadata.json（使用 UTF-8 编码写入文件）
    Dim json As String
    json = BuildMetadataJson(mail.Subject, senderEmail, mail.SenderName, _
                             mail.ReceivedTime, mail.body, attachmentCount, _
                             attachmentNames, mail.EntryID, accountEmail, _
                             originalSenderEmail, originalSenderName)
    
    Dim jsonPath As String
    jsonPath = targetFolder & "\metadata.json"
    WriteUtf8File jsonPath, json
    
    ' 7. 同时另存为完整的 .msg 文件，以便后期深度重建或人工溯源
    Dim msgPath As String
    Dim safeSubject As String
    safeSubject = SanitizeFilename(mail.Subject)
    If safeSubject = "" Then safeSubject = "email"
    ' 截断过长的主题，防止超过 Windows 路径长度限制
    msgPath = targetFolder & "\" & Left(safeSubject, 120) & ".msg"
    mail.SaveAs msgPath, 3 ' 3 = olMSG
    
    SaveMailToFolder = True
    Exit Function
    
ErrHandler:
    ' 发生错误时仅记录日志，不中断主进程
    Debug.Print "Error saving mail to folder: " & Err.Description
    SaveMailToFolder = False
End Function


' 获取收件账户邮箱地址（V4 新增）
Private Function GetAccountEmail(ByVal mail As Object) As String
    On Error GoTo ErrHandler
    GetAccountEmail = ""
    
    ' 方法1：通过 mail 所在 Store 获取账户
    Dim store As Object
    Set store = mail.Parent.store
    
    If Not store Is Nothing Then
        ' 遍历 Accounts 找到对应 Store 的账户
        Dim acct As Object
        For Each acct In Application.Session.Accounts
            If acct.DeliveryStore.StoreID = store.StoreID Then
                GetAccountEmail = acct.SmtpAddress
                Exit Function
            End If
        Next acct
    End If
    
    ' 方法2：fallback 用第一个账户
    If Application.Session.Accounts.Count > 0 Then
        GetAccountEmail = Application.Session.Accounts(1).SmtpAddress
    End If
    Exit Function
    
ErrHandler:
    GetAccountEmail = "unknown"
End Function


' 获取真实发件人 SMTP 邮箱（解决 Exchange 内部地址格式问题）
Private Function GetSmtpAddress(ByVal mail As Object) As String
    On Error GoTo ErrHandler
    GetSmtpAddress = mail.SenderEmailAddress
    
    If mail.SenderEmailType = "EX" Then
        Dim exchangeUser As Object
        Set exchangeUser = mail.Sender.GetExchangeUser()
        If Not exchangeUser Is Nothing Then
            GetSmtpAddress = exchangeUser.PrimarySmtpAddress
        End If
    End If
    Exit Function
    
ErrHandler:
    GetSmtpAddress = mail.SenderEmailAddress
End Function


' V4.1: 从转发邮件正文中提取真正的发件人
' 解析格式: "From: Display Name <email@example.com>" 或 "From: email@example.com"
Private Sub ExtractOriginalSender(ByVal body As String, ByRef outEmail As String, ByRef outName As String)
    On Error Resume Next
    outEmail = ""
    outName = ""
    
    ' 找到第一个 "From:" 行
    Dim fromPos As Long
    fromPos = InStr(1, body, "From:", vbTextCompare)
    If fromPos = 0 Then Exit Sub
    
    ' 取从 "From:" 开始到行尾的文本
    Dim lineEnd As Long
    lineEnd = InStr(fromPos, body, vbCrLf)
    If lineEnd = 0 Then lineEnd = InStr(fromPos, body, vbLf)
    If lineEnd = 0 Then lineEnd = Len(body)
    
    Dim fromLine As String
    fromLine = Mid(body, fromPos + 5, lineEnd - fromPos - 5)
    fromLine = Trim(fromLine)
    
    ' 解析 "Name <email>" 格式
    Dim ltPos As Long, gtPos As Long
    ltPos = InStr(fromLine, "<")
    gtPos = InStr(fromLine, ">")
    
    If ltPos > 0 And gtPos > ltPos Then
        ' 有尖括号: "Display Name <email@example.com>"
        outEmail = Trim(Mid(fromLine, ltPos + 1, gtPos - ltPos - 1))
        outName = Trim(Left(fromLine, ltPos - 1))
    Else
        ' 没有尖括号，整行可能就是邮箱
        If InStr(fromLine, "@") > 0 Then
            ' 找第一个包含 @ 的 token
            Dim parts() As String
            parts = Split(fromLine, " ")
            Dim p As Long
            For p = LBound(parts) To UBound(parts)
                If InStr(parts(p), "@") > 0 Then
                    outEmail = Trim(parts(p))
                    Exit For
                End If
            Next p
        End If
    End If
End Sub


' 清洗并过滤文件名中的非法字符
Private Function SanitizeFilename(ByVal filename As String) As String
    On Error Resume Next
    Dim cleanName As String
    cleanName = filename
    
    ' 移除 Windows 下非法的路径字符
    cleanName = Replace(cleanName, "\", "")
    cleanName = Replace(cleanName, "/", "")
    cleanName = Replace(cleanName, ":", "")
    cleanName = Replace(cleanName, "*", "")
    cleanName = Replace(cleanName, "?", "")
    cleanName = Replace(cleanName, """", "")
    cleanName = Replace(cleanName, "<", "")
    cleanName = Replace(cleanName, ">", "")
    cleanName = Replace(cleanName, "|", "")
    cleanName = Replace(cleanName, "..", "")
    
    ' 去除头尾空格和英文句点
    cleanName = Trim(cleanName)
    Do While Left(cleanName, 1) = "."
        cleanName = Mid(cleanName, 2)
    Loop
    
    SanitizeFilename = cleanName
End Function


' 递归创建多级文件夹路径的辅助函数
Private Sub CreateFolderRecursive(ByVal fso As Object, ByVal folderPath As String)
    On Error Resume Next
    Dim parent As String
    parent = fso.GetParentFolderName(folderPath)
    
    If Not fso.FolderExists(parent) Then
        CreateFolderRecursive fso, parent
    End If
    
    If Not fso.FolderExists(folderPath) Then
        fso.CreateFolder folderPath
    End If
End Sub


' 构建 metadata.json 结构体内容（V4: 新增 entry_id, account, attachment_names, body_preview）
Private Function BuildMetadataJson(ByVal subject As String, ByVal senderEmail As String, _
    ByVal senderName As String, ByVal receivedTime As Date, ByVal body As String, _
    ByVal attachmentCount As Integer, ByVal attachmentNames As String, _
    ByVal entryID As String, ByVal account As String, _
    ByVal originalSenderEmail As String, ByVal originalSenderName As String) As String
    
    Dim timeStr As String
    timeStr = Format(receivedTime, "yyyy-mm-dd hh:nn:ss")
    
    ' body_preview: 截取前 500 字供后端匹配和分类使用
    Dim bodyPreview As String
    If Len(body) > 500 Then
        bodyPreview = Left(body, 500)
    Else
        bodyPreview = body
    End If
    
    ' 完整 body: 截断极长正文防止 JSON 过大
    Dim cleanBody As String
    cleanBody = body
    If Len(cleanBody) > 10000 Then
        cleanBody = Left(cleanBody, 10000) & vbCrLf & "...[正文过长被截断]"
    End If
    
    ' 构建附件名 JSON 数组
    Dim attachJson As String
    If attachmentNames = "" Then
        attachJson = "[]"
    Else
        Dim names() As String
        names = Split(attachmentNames, "|")
        attachJson = "["
        Dim k As Long
        For k = LBound(names) To UBound(names)
            If k > LBound(names) Then attachJson = attachJson & ", "
            attachJson = attachJson & """" & EscapeJson(names(k)) & """"
        Next k
        attachJson = attachJson & "]"
    End If
    
    Dim json As String
    json = "{" & vbCrLf & _
           "  ""subject"": """ & EscapeJson(subject) & """," & vbCrLf & _
           "  ""sender_email"": """ & EscapeJson(senderEmail) & """," & vbCrLf & _
           "  ""sender_name"": """ & EscapeJson(senderName) & """," & vbCrLf & _
           "  ""original_sender_email"": """ & EscapeJson(originalSenderEmail) & """," & vbCrLf & _
           "  ""original_sender_name"": """ & EscapeJson(originalSenderName) & """," & vbCrLf & _
           "  ""received_time"": """ & timeStr & """," & vbCrLf & _
           "  ""attachment_count"": " & attachmentCount & "," & vbCrLf & _
           "  ""attachments"": " & attachJson & "," & vbCrLf & _
           "  ""body_preview"": """ & EscapeJson(bodyPreview) & """," & vbCrLf & _
           "  ""body"": """ & EscapeJson(cleanBody) & """," & vbCrLf & _
           "  ""entry_id"": """ & EscapeJson(entryID) & """," & vbCrLf & _
           "  ""account"": """ & EscapeJson(account) & """" & vbCrLf & _
           "}"
           
    BuildMetadataJson = json
End Function


' JSON 字符串特殊字符转义转码
Private Function EscapeJson(ByVal text As String) As String
    Dim res As String
    res = text
    
    ' 必须优先替换反斜杠
    res = Replace(res, "\", "\\")
    res = Replace(res, """", "\""")
    res = Replace(res, vbCrLf, "\n")
    res = Replace(res, vbCr, "\n")
    res = Replace(res, vbLf, "\n")
    res = Replace(res, vbTab, "\t")
    
    EscapeJson = res
End Function


' 判断 EntryID 是否已经处理过的防重刷检测
Private Function IsAlreadyProcessed(ByVal entryID As String) As Boolean
    On Error GoTo ErrHandler
    IsAlreadyProcessed = False
    
    Dim fso As Object
    Set fso = CreateObject("Scripting.FileSystemObject")
    
    Dim filePath As String
    filePath = SAVE_ROOT & "\processed_ids.txt"
    
    If Not fso.FileExists(filePath) Then Exit Function
    
    Dim fileStream As Object
    Set fileStream = fso.OpenTextFile(filePath, 1) ' 1 = ForReading
    
    Dim content As String
    content = fileStream.ReadAll
    fileStream.Close
    
    If InStr(1, content, entryID) > 0 Then
        IsAlreadyProcessed = True
    End If
    Exit Function
    
ErrHandler:
    IsAlreadyProcessed = False
End Function


' 将处理完的邮件 EntryID 记录到本地文本文件中
Private Sub RecordProcessed(ByVal entryID As String)
    On Error Resume Next
    Dim fso As Object
    Set fso = CreateObject("Scripting.FileSystemObject")
    
    ' 自动确保保存根目录已存在
    CreateFolderRecursive fso, SAVE_ROOT
    
    Dim filePath As String
    filePath = SAVE_ROOT & "\processed_ids.txt"
    
    Dim fileStream As Object
    If Not fso.FileExists(filePath) Then
        Set fileStream = fso.CreateTextFile(filePath)
    Else
        Set fileStream = fso.OpenTextFile(filePath, 8) ' 8 = ForAppending
    End If
    
    fileStream.WriteLine entryID
    fileStream.Close
End Sub


' 使用 ADODB.Stream 写入标准的 UTF-8 编码文本文件
Private Sub WriteUtf8File(ByVal filePath As String, ByVal content As String)
    On Error GoTo ErrHandler
    Dim stream As Object
    Set stream = CreateObject("ADODB.Stream")
    
    stream.Type = 2 ' 2 = adTypeText (文本模式)
    stream.Charset = "utf-8"
    stream.Open
    stream.WriteText content
    
    ' 2 = adSaveCreateOverWrite (覆盖写入)
    stream.SaveToFile filePath, 2
    stream.Close
    Exit Sub
    
ErrHandler:
    Debug.Print "Failed to write UTF-8 file: " & Err.Description
End Sub


' ==============================================================================
' 手动运行：批量导出今日邮件
' ==============================================================================
' 使用方法：ALT+F8 → 选择 "ExportTodayEmails" → 运行
' 仅导出收件箱中今天零点以后收到的全部新邮件
' ==============================================================================

Public Sub ExportTodayEmails()
    Dim ns As Object
    Set ns = Application.GetNamespace("MAPI")
    
    Dim inbox As Object
    Set inbox = ns.GetDefaultFolder(6) ' 6 = olFolderInbox
    
    Dim cutoffDate As Date
    cutoffDate = Date ' 获取今天零点的日期值
    
    Dim processed As Long
    Dim skipped As Long
    processed = 0
    skipped = 0
    
    Dim todayCount As Long
    todayCount = 0
    Dim testItem As Object
    For Each testItem In inbox.Items
        If testItem.Class = 43 Then
            If testItem.ReceivedTime >= cutoffDate Then
                todayCount = todayCount + 1
            End If
        End If
    Next testItem
    
    Dim answer As VbMsgBoxResult
    answer = MsgBox("即将导出今天收到的全部邮件。" & vbCrLf & _
                    "符合条件的邮件共 " & todayCount & " 封。" & vbCrLf & vbCrLf & _
                    "导出目标: " & SAVE_ROOT & vbCrLf & vbCrLf & _
                    "是否继续？", vbYesNo + vbQuestion, "导出今日邮件")
    If answer = vbNo Then Exit Sub
    
    Dim item As Object
    For Each item In inbox.Items
        If item.Class = 43 Then
            If item.ReceivedTime >= cutoffDate Then
                If Not IsAlreadyProcessed(item.EntryID) Then
                    ProcessMailItem item.EntryID
                    processed = processed + 1
                Else
                    skipped = skipped + 1
                End If
            End If
        End If
    Next item
    
    MsgBox "今日邮件导出完成！" & vbCrLf & vbCrLf & _
           "成功导出: " & processed & " 封" & vbCrLf & _
           "跳过(已导出): " & skipped & " 封" & vbCrLf & _
           "保存位置: " & SAVE_ROOT, vbInformation, "导出今日邮件完成"
End Sub


' ==============================================================================
' 手动运行：批量导出历史邮件
' ==============================================================================
' 使用方法：ALT+F8 → 选择 "ExportHistoryEmails" → 运行
' 默认导出收件箱最近 30 天的邮件（可修改 DAYS_BACK 常量）
' ==============================================================================

Public Sub ExportHistoryEmails()
    Dim DAYS_BACK As Integer
    DAYS_BACK = 30  ' ← 修改这个数字控制导出天数范围
    
    Dim ns As Object
    Set ns = Application.GetNamespace("MAPI")
    
    ' 获取默认收件箱
    Dim inbox As Object
    Set inbox = ns.GetDefaultFolder(6) ' 6 = olFolderInbox
    
    Dim cutoffDate As Date
    cutoffDate = DateAdd("d", -DAYS_BACK, Now)
    
    Dim processed As Long
    Dim skipped As Long
    processed = 0
    skipped = 0
    
    Dim historyCount As Long
    historyCount = 0
    Dim testItem As Object
    For Each testItem In inbox.Items
        If testItem.Class = 43 Then
            If testItem.ReceivedTime >= cutoffDate Then
                historyCount = historyCount + 1
            End If
        End If
    Next testItem
    
    ' 提示用户确认
    Dim answer As VbMsgBoxResult
    answer = MsgBox("即将导出收件箱最近 " & DAYS_BACK & " 天的邮件。" & vbCrLf & _
                    "符合条件的邮件共 " & historyCount & " 封。" & vbCrLf & vbCrLf & _
                    "导出目标: " & SAVE_ROOT & vbCrLf & vbCrLf & _
                    "是否继续？", vbYesNo + vbQuestion, "批量导出历史邮件")
    If answer = vbNo Then Exit Sub
    
    ' 遍历收件箱
    Dim item As Object
    For Each item In inbox.Items
        ' 仅处理邮件对象
        If item.Class = 43 Then
            ' 仅处理日期范围内的
            If item.ReceivedTime >= cutoffDate Then
                ' 去重检查
                If Not IsAlreadyProcessed(item.EntryID) Then
                    ProcessMailItem item.EntryID
                    processed = processed + 1
                Else
                    skipped = skipped + 1
                End If
            End If
        End If
        
        ' 每处理100封更新状态栏
        If (processed + skipped) Mod 100 = 0 Then
            Application.StatusBar = "已处理: " & processed & " | 跳过(已导出): " & skipped
            DoEvents
        End If
    Next item
    
    Application.StatusBar = ""
    MsgBox "导出完成！" & vbCrLf & vbCrLf & _
           "成功导出: " & processed & " 封" & vbCrLf & _
           "跳过(已导出): " & skipped & " 封" & vbCrLf & _
           "保存位置: " & SAVE_ROOT, vbInformation, "批量导出完成"
End Sub


' ==============================================================================
' 手动运行：导出指定文件夹的邮件（可选子文件夹）
' ==============================================================================
' 使用方法：ALT+F8 → 选择 "ExportSelectedFolder" → 运行
' 会弹出文件夹选择器，你可以选任意邮件文件夹导出
' ==============================================================================

Public Sub ExportSelectedFolder()
    Dim ns As Object
    Set ns = Application.GetNamespace("MAPI")
    
    ' 弹出文件夹选择器
    Dim selectedFolder As Object
    Set selectedFolder = ns.PickFolder
    
    If selectedFolder Is Nothing Then
        MsgBox "未选择文件夹，操作取消。", vbExclamation
        Exit Sub
    End If
    
    Dim totalItems As Long
    totalItems = selectedFolder.Items.Count
    
    Dim answer As VbMsgBoxResult
    answer = MsgBox("即将导出文件夹: " & selectedFolder.Name & vbCrLf & _
                    "共 " & totalItems & " 封邮件。" & vbCrLf & vbCrLf & _
                    "导出目标: " & SAVE_ROOT & vbCrLf & vbCrLf & _
                    "是否继续？", vbYesNo + vbQuestion, "导出选定文件夹")
    If answer = vbNo Then Exit Sub
    
    Dim processed As Long
    Dim skipped As Long
    processed = 0
    skipped = 0
    
    Dim item As Object
    For Each item In selectedFolder.Items
        If item.Class = 43 Then
            If Not IsAlreadyProcessed(item.EntryID) Then
                ProcessMailItem item.EntryID
                processed = processed + 1
            Else
                skipped = skipped + 1
            End If
        End If
        
        If (processed + skipped) Mod 100 = 0 Then
            Application.StatusBar = "已处理: " & processed & " | 跳过: " & skipped
            DoEvents
        End If
    Next item
    
    Application.StatusBar = ""
    MsgBox "导出完成！" & vbCrLf & vbCrLf & _
           "成功导出: " & processed & " 封" & vbCrLf & _
           "跳过(已导出): " & skipped & " 封", vbInformation, "导出完成"
End Sub


' ==============================================================================
' 手动运行：归档选中的邮件到选定案件目录 (Send to VERA)
' ==============================================================================
' 使用方法：在收件箱中选中一封或多封邮件，按 ALT+F8 → 选择 "SendToVera" → 运行
' 它会弹窗让您选择关联的案件文件夹，并将选中的邮件归档存入该案件的 _Inbox 目录中
' ==============================================================================
Public Sub SendToVera()
    On Error GoTo ErrHandler
    
    ' 1. 检查是否有选中的邮件
    Dim selection As Object
    Set selection = Application.ActiveExplorer.Selection
    
    If selection Is Nothing Then
        MsgBox "没有选中的邮件，请先选择至少一封邮件！", vbExclamation, "VERA 提示"
        Exit Sub
    End If
    
    Dim mailCount As Long
    Dim i As Long
    mailCount = 0
    
    ' 预先统计合法的邮件对象数量
    For i = 1 To selection.Count
        If selection.Item(i).Class = 43 Then
            mailCount = mailCount + 1
        End If
    Next i
    
    If mailCount = 0 Then
        MsgBox "选中的项目中没有可导出的邮件！", vbExclamation, "VERA 提示"
        Exit Sub
    End If
    
    ' 2. 弹窗让用户选择目标案件文件夹
    Dim xlApp As Object
    Dim fd As Object
    Dim caseFolderPath As String
    
    On Error Resume Next
    Set xlApp = CreateObject("Excel.Application")
    If xlApp Is Nothing Then
        ' Fallback: 使用 Shell.Application
        Dim shell As Object
        Dim fld As Object
        Set shell = CreateObject("Shell.Application")
        Set fld = shell.BrowseForFolder(0, "选择要关联的案件文件夹:", &H10 Or &H40, CLIENT_FILES_ROOT)
        If Not fld Is Nothing Then
            caseFolderPath = fld.self.Path
        End If
    Else
        Set fd = xlApp.FileDialog(4) ' 4 = msoFileDialogFolderPicker
        fd.Title = "请选择此邮件要关联的案件文件夹 (共选中 " & mailCount & " 封邮件):"
        fd.InitialFileName = CLIENT_FILES_ROOT & "\"
        If fd.Show = -1 Then
            caseFolderPath = fd.SelectedItems(1)
        End If
        xlApp.Quit
        Set xlApp = Nothing
        Set fd = Nothing
    End If
    
    ' 恢复默认的错误处理
    On Error GoTo ErrHandler
    
    If caseFolderPath = "" Then
        ' 用户取消了选择
        Exit Sub
    End If
    
    ' 3. 确定目标 _Inbox 路径并开始写入
    Dim fso As Object
    Set fso = CreateObject("Scripting.FileSystemObject")
    
    Dim caseInboxPath As String
    caseInboxPath = caseFolderPath & "\_Inbox"
    
    ' 确保目标 _Inbox 文件夹存在
    CreateFolderRecursive fso, caseInboxPath
    
    Dim successCount As Long
    successCount = 0
    
    Dim item As Object
    For i = 1 To selection.Count
        Set item = selection.Item(i)
        If Not item Is Nothing And item.Class = 43 Then
            If SaveMailToFolder(item, caseInboxPath, fso) Then
                successCount = successCount + 1
            End If
        End If
    Next i
    
    MsgBox "邮件关联归档完成！" & vbCrLf & vbCrLf & _
           "成功归档: " & successCount & " / " & mailCount & " 封邮件" & vbCrLf & _
           "保存位置: " & caseInboxPath, vbInformation, "VERA 归档完成"
    Exit Sub
    
ErrHandler:
    MsgBox "归档过程中发生错误: " & Err.Description, vbCritical, "VERA 错误"
End Sub
