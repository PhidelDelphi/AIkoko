# AFR 本地服务器 (PowerShell 版, 免 Python, 向下兼容 Win7/8/10/11)
# 用法: 双击 启动服务器-免Python.bat 调用本脚本
# 原理: System.Net.HttpListener (.NET 内置, 所有 Windows 都有)

param(
    [int]$Port = 8766
)

$ErrorActionPreference = 'Stop'

# 根目录 = 脚本所在目录
$Root = $MyInvocation.MyCommand.Path | Split-Path
$Root = (Get-Item $Root).FullName

# MIME 类型表
function Get-MimeType($ext) {
    switch ($ext.ToLower()) {
        '.html' { return 'text/html; charset=utf-8' }
        '.htm'  { return 'text/html; charset=utf-8' }
        '.js'   { return 'application/javascript; charset=utf-8' }
        '.mjs'  { return 'application/javascript; charset=utf-8' }
        '.css'  { return 'text/css; charset=utf-8' }
        '.json' { return 'application/json; charset=utf-8' }
        '.png'  { return 'image/png' }
        '.jpg'  { return 'image/jpeg' }
        '.jpeg' { return 'image/jpeg' }
        '.gif'  { return 'image/gif' }
        '.svg'  { return 'image/svg+xml' }
        '.ico'  { return 'image/x-icon' }
        '.mp3'  { return 'audio/mpeg' }
        '.wav'  { return 'audio/wav' }
        '.m4a'  { return 'audio/mp4' }
        '.pdf'  { return 'application/pdf' }
        '.woff' { return 'font/woff' }
        '.woff2'{ return 'font/woff2' }
        '.ttf'  { return 'font/ttf' }
        '.txt'  { return 'text/plain; charset=utf-8' }
        default { return 'application/octet-stream' }
    }
}

# 判断文件是否文本类(需 UTF8 编码读出), 二进制类(直接传字节)
function Is-TextFile($ext) {
    switch ($ext.ToLower()) {
        '.html' { return $true }
        '.htm'  { return $true }
        '.js'   { return $true }
        '.mjs'  { return $true }
        '.css'  { return $true }
        '.json' { return $true }
        '.lrc'  { return $true }
        '.svg'  { return $true }
        '.txt'  { return $true }
        default { return $false }
    }
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
try {
    $listener.Start()
} catch {
    # 端口被占：先检测是不是已有服务器在跑（能访问就直接用）
    $alreadyRunning = $false
    try {
        $test = Invoke-WebRequest -Uri "http://localhost:$Port/" -UseBasicParsing -TimeoutSec 3
        if ($test.StatusCode -eq 200) { $alreadyRunning = $true }
    } catch {}
    if ($alreadyRunning) {
        Write-Host ""
        Write-Host "  检测到服务器已经在运行 (http://localhost:$Port)" -ForegroundColor Green
        Write-Host "  直接打开浏览器使用即可。" -ForegroundColor Cyan
        Start-Process "http://localhost:$Port"
        Start-Sleep -Seconds 2
        exit 0
    }
    Write-Host "端口 $Port 启动失败: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "可能是端口被其他程序占用, 或权限不足。" -ForegroundColor Yellow
    Read-Host "按回车退出"
    exit 1
}

Write-Host ""
Write-Host "  AFR 服务器已启动 (PowerShell 版, 免 Python)" -ForegroundColor Green
Write-Host "  浏览器访问: http://localhost:$Port" -ForegroundColor Cyan
Write-Host "  关闭此窗口 = 关闭服务器" -ForegroundColor Gray
Write-Host ""

# 自动打开浏览器
try {
    Start-Process "http://localhost:$Port"
} catch {}

# 服务循环
while ($listener.IsListening) {
    try {
        $context = $listener.GetContext()
    } catch {
        break
    }

    # 外层保护：任何单次请求的处理错误都不能杀死服务器进程
    try {
    $req = $context.Request
    $res = $context.Response

    # 解析请求路径: / 或 /index.html -> index.html; 其他去掉开头的 /
    $rawUrl = $req.Url.AbsolutePath
    if ($rawUrl -eq '/' -or $rawUrl -eq '') {
        $relPath = 'index.html'
    } else {
        $relPath = $rawUrl.TrimStart('/')
        # URL 解码 (%20 等)
        $relPath = [System.Uri]::UnescapeDataString($relPath)
    }

    # /list-songs：列出 Song of the Day 文件夹里的 mp3，返回 JSON 清单（供前端自动发现歌曲）
    if ($relPath -eq 'list-songs' -and $req.HttpMethod -eq 'GET') {
        try {
            $songDir = Join-Path $Root 'Song of the Day'
            $songs = @()
            if (Test-Path $songDir -PathType Container) {
                $songs = Get-ChildItem -Path $songDir -Filter *.mp3 -File | ForEach-Object {
                    $base = [System.IO.Path]::GetFileNameWithoutExtension($_.Name)
                    @{ name = $base; file = $_.Name }
                } | ForEach-Object { $_.name }
            }
            $json = '{"songs":' + (ConvertTo-Json $songs -Compress) + '}'
            $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
            $res.StatusCode = 200
            $res.ContentType = 'application/json; charset=utf-8'
            $res.ContentLength64 = $bytes.Length
            $res.OutputStream.Write($bytes, 0, $bytes.Length)
        } catch {
            $res.StatusCode = 500
        }
        try { $res.Close() } catch {}
        continue
    }

    $filePath = Join-Path $Root $relPath

    # 安全: 防止路径穿越(确保文件在 Root 下)
    # 用 Test-Path + Resolve-Path 替代 Get-Item（后者对含中文/特殊字符路径解析不稳定）
    $fullPath = $null
    if (Test-Path $filePath -PathType Leaf) {
        try {
            $resolved = (Resolve-Path $filePath -ErrorAction Stop).Path
            # 确保解析后的路径仍在 Root 下（防穿越）
            if ($resolved.StartsWith($Root)) { $fullPath = $resolved }
        } catch {}
    }

    if ($fullPath -and (Test-Path $fullPath -PathType Leaf)) {
        $ext = [System.IO.Path]::GetExtension($fullPath)
        $mime = Get-MimeType $ext
        $fileSize = (Get-Item $fullPath).Length
        try {
            # 状态码必须最先设(HttpListener要求)，再设头，最后写体
            $res.StatusCode = 200
            $res.ContentType = $mime
            $res.ContentLength64 = $fileSize
            if ($req.HttpMethod -eq 'HEAD') {
                # HEAD: 只返回头，不写体（用于探测文件存在/大小，避免读大文件）
            } elseif (Is-TextFile $ext) {
                # 文本类: UTF8 读出再写(保证中文不乱码)
                $content = [System.IO.File]::ReadAllText($fullPath, [System.Text.Encoding]::UTF8)
                $bytes = [System.Text.Encoding]::UTF8.GetBytes($content)
                $res.OutputStream.Write($bytes, 0, $bytes.Length)
            } else {
                # 二进制类: 直接传字节(图片/音频/PDF)
                $bytes = [System.IO.File]::ReadAllBytes($fullPath)
                $res.OutputStream.Write($bytes, 0, $bytes.Length)
            }
        } catch {
            # 单次请求出错不影响服务器存活
            try { $res.StatusCode = 500 } catch {}
        }
    } else {
        # 文件不存在
        # 对数据/API类请求(.json/.lrc等)直接返回404，不走SPA回退(避免探测请求拿到html或500)
        # 仅对无后缀的页面路由回退 index.html
        $ext2 = [System.IO.Path]::GetExtension($relPath)
        if ($ext2 -eq '' -or $ext2 -eq '.html') {
            # 页面路由 -> 回退 index.html (SPA 风格)
            try {
                $indexPath = Join-Path $Root 'index.html'
                if (Test-Path $indexPath) {
                    $content = [System.IO.File]::ReadAllText($indexPath, [System.Text.Encoding]::UTF8)
                    $bytes = [System.Text.Encoding]::UTF8.GetBytes($content)
                    $res.StatusCode = 200
                    $res.ContentType = 'text/html; charset=utf-8'
                    $res.ContentLength64 = $bytes.Length
                    $res.OutputStream.Write($bytes, 0, $bytes.Length)
                } else {
                    $res.StatusCode = 404
                }
            } catch {
                try { $res.StatusCode = 500 } catch {}
            }
        } else {
            # 带后缀的文件(.json/.lrc/.mp3等)不存在 -> 干脆404
            $res.StatusCode = 404
            $res.ContentLength64 = 0
        }
    }
    try { $res.Close() } catch {}
    } catch {
        # 外层兜底：内层未捕获的错误，确保服务器存活
        try { $res.StatusCode = 500; $res.Close() } catch {}
    }
}
