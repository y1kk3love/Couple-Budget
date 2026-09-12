# tools/serve.ps1 — 의존성 없는 로컬 정적 서버 (Node·Python 없이 PowerShell만으로 실행)
#
# 사용: powershell -ExecutionPolicy Bypass -File tools/serve.ps1 [-Port 8000]
# 브라우저에서 http://localhost:8000 접속. Ctrl+C로 종료.
#
# ES 모듈은 file:// 로 열면 CORS로 막히므로 반드시 HTTP로 서빙해야 한다.
# .NET HttpListener는 localhost 프리픽스라면 관리자 권한 없이 동작한다.

param([int]$Port = 8000)

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$mime = @{
  '.html' = 'text/html; charset=utf-8'
  '.js'   = 'text/javascript; charset=utf-8'
  '.mjs'  = 'text/javascript; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.svg'  = 'image/svg+xml'
  '.png'  = 'image/png'
  '.ico'  = 'image/x-icon'
  '.md'   = 'text/plain; charset=utf-8'
  '.csv'  = 'text/csv; charset=utf-8'
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Serving $root at http://localhost:$Port/  (Ctrl+C to stop)"

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $req = $ctx.Request; $res = $ctx.Response
    $rel = ''
    try {
      $rel = [Uri]::UnescapeDataString($req.Url.AbsolutePath).TrimStart('/')
      if ($rel -eq '') { $rel = 'index.html' }
      $path = [IO.Path]::GetFullPath((Join-Path $root $rel))

      # 루트 밖 경로 탐색 차단
      if (-not $path.StartsWith($root.Path, [StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path $path -PathType Leaf)) {
        $res.StatusCode = 404
        $body = [Text.Encoding]::UTF8.GetBytes('404 Not Found')
      } else {
        $ext = [IO.Path]::GetExtension($path).ToLower()
        $res.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
        $res.Headers['Cache-Control'] = 'no-store'   # 수정 즉시 반영
        $body = [IO.File]::ReadAllBytes($path)
      }
      $res.ContentLength64 = $body.Length
      # HEAD(도구·브라우저의 생존 확인)에는 본문을 쓰면 안 된다 — 쓰면 ProtocolViolation으로 죽는다
      if ($req.HttpMethod -ne 'HEAD') { $res.OutputStream.Write($body, 0, $body.Length) }
      Write-Host "$($res.StatusCode) $($req.HttpMethod) /$rel"
    } catch {
      # 요청 하나가 실패해도 서버는 계속 살아 있어야 한다
      Write-Host "ERR $($req.HttpMethod) /$rel : $($_.Exception.Message)"
    } finally {
      try { $res.Close() } catch {}
    }
  }
} finally {
  $listener.Stop()
}
