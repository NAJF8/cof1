@echo off
chcp 65001 > nul
title 101 COFFEE Server
echo ====================================================
echo        ☕ جاري تشغيل سيرفر 101 COFFEE المحلي ☕
echo ====================================================
echo.
echo الموقع يعمل الآن على الرابط:
echo 👉 http://localhost:5000/
echo.
echo سيتم فتح لوحة الإدارة في المتصفح تلقائياً...
echo (لا تغلق هذه النافذة طالما أنك تستخدم الموقع)
echo ====================================================

start http://localhost:5000/admin.html
powershell -NoProfile -Command "$listener = New-Object System.Net.HttpListener; $listener.Prefixes.Add('http://localhost:5000/'); $listener.Start(); while ($listener.IsListening) { $ctx = $listener.GetContext(); $req = $ctx.Request; $res = $ctx.Response; $path = $req.Url.LocalPath.TrimStart('/'); if ([string]::IsNullOrEmpty($path)) { $path = 'index.html' }; $full = Join-Path (Get-Location) $path; if (Test-Path $full -PathType Leaf) { $bytes = [System.IO.File]::ReadAllBytes($full); $ext = [System.IO.Path]::GetExtension($full).ToLower(); $mime = switch ($ext) { '.html' {'text/html; charset=utf-8'} '.css' {'text/css'} '.js' {'application/javascript'} '.jpg' {'image/jpeg'} '.png' {'image/png'} '.svg' {'image/svg+xml'} default {'application/octet-stream'} }; $res.ContentType = $mime; $res.ContentLength64 = $bytes.Length; $res.OutputStream.Write($bytes, 0, $bytes.Length); } else { $res.StatusCode = 404; $err = [System.Text.Encoding]::UTF8.GetBytes('File not found'); $res.OutputStream.Write($err, 0, $err.Length); } $res.OutputStream.Close(); }"
pause