# K-Mail-MCP (Naver/Daum fork) - 계정 설정
# 원본: K-Mail-MCP by youngsooco (MIT) - https://github.com/youngsooco/k-mail-mcp
# 포크 변경: 네이버/다음/카카오만 지원, AI 스팸 필터(API 키) 메뉴 제거
[Console]::InputEncoding  = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding            = [System.Text.Encoding]::UTF8
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

function Show-Header {
    Write-Host ""
    Write-Host "============================================" -ForegroundColor Cyan
    Write-Host "   K-Mail-MCP (네이버/다음) - 계정 설정" -ForegroundColor Cyan
    Write-Host "============================================" -ForegroundColor Cyan
}

function Show-Menu {
    Write-Host ""
    Write-Host "  1) 계정 추가 / 수정"
    Write-Host "  2) 계정 목록"
    Write-Host "  3) 계정 삭제"
    Write-Host "  4) 종료"
    Write-Host ""
}

function Get-PlainText($secureString) {
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureString)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringAuto($ptr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

function Invoke-Worker($action, $data) {
    $env:KMAIL_INPUT = ($data | ConvertTo-Json -Compress)
    try { $result = & node "$ScriptDir\setup-worker.js" $action }
    finally { $env:KMAIL_INPUT = $null }
    return $result
}

function Add-Account {
    Write-Host ""
    Write-Host "-- 계정 추가 / 수정 --" -ForegroundColor Yellow
    Write-Host "  1) 네이버   2) 다음(daum.net / hanmail.net)   3) 카카오메일(kakao.com)"
    $svc = (Read-Host "  서비스 번호").Trim()
    if ($svc -notin @("1", "2", "3")) {
        Write-Host "  [ERROR] 1, 2, 3 중에서 골라 주세요." -ForegroundColor Red
        return
    }

    $email = (Read-Host "  이메일 주소").Trim()
    if (-not ($email -match "^[^@\s]+@[^@\s]+\.[^@\s]+$")) {
        Write-Host "  [ERROR] 이메일 형식이 올바르지 않습니다." -ForegroundColor Red
        return
    }

    Write-Host "  [안내] 일반 로그인 비밀번호가 아니라 '앱 비밀번호'를 입력하세요." -ForegroundColor DarkGray
    Write-Host "         네이버: nid.naver.com > 보안설정 > 2단계 인증 > 애플리케이션 비밀번호" -ForegroundColor DarkGray
    Write-Host "         다음/카카오: accounts.kakao.com > 계정 보안 > 2단계 인증 > 앱 비밀번호" -ForegroundColor DarkGray
    $pass = ""
    while ($true) {
        $p1 = Get-PlainText (Read-Host "  앱 비밀번호" -AsSecureString)
        $p2 = Get-PlainText (Read-Host "  앱 비밀번호 확인" -AsSecureString)
        if ($p1 -ne $p2)          { Write-Host "  [ERROR] 비밀번호가 일치하지 않습니다." -ForegroundColor Red }
        elseif ($p1.Length -lt 4) { Write-Host "  [ERROR] 비밀번호가 너무 짧습니다." -ForegroundColor Red }
        else { $pass = $p1; $p1 = $null; $p2 = $null; break }
        $p1 = $null; $p2 = $null
    }

    $label = (Read-Host "  라벨 (예: 네이버개인, 비우면 아이디 사용)").Trim()
    if (-not $label) { $label = $email.Split("@")[0] }

    $result = Invoke-Worker "add" @{ service = $svc; email = $email; pass = $pass; label = $label }
    $pass = $null
    [GC]::Collect()
    $color = if ($result -match "\[OK\]") { "Green" } else { "Red" }
    Write-Host $result -ForegroundColor $color
}

function List-Accounts {
    Write-Host ""
    Write-Host "-- 등록된 계정 --" -ForegroundColor Yellow
    Write-Host (Invoke-Worker "list" @{} | Out-String)
}

function Remove-Account {
    List-Accounts
    $idx = (Read-Host "  삭제할 번호").Trim()
    if (-not ($idx -match "^\d+$")) { Write-Host "  [ERROR] 숫자를 입력하세요." -ForegroundColor Red; return }
    Write-Host (Invoke-Worker "delete" @{ index = [int]$idx }) -ForegroundColor Yellow
}

# ── Main ──
Show-Header
while ($true) {
    Show-Menu
    $choice = (Read-Host "  선택").Trim()
    if     ($choice -eq "1") { Add-Account }
    elseif ($choice -eq "2") { List-Accounts }
    elseif ($choice -eq "3") { Remove-Account }
    elseif ($choice -eq "4") { break }
    else { Write-Host "  잘못된 선택입니다." -ForegroundColor Red }
}
Write-Host ""
Write-Host "  종료합니다. 계정을 바꿨다면 Claude 데스크톱 앱을 다시 시작할 필요는 없습니다." -ForegroundColor Cyan
Write-Host ""
