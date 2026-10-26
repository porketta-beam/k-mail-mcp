# K-Mail-MCP (Naver/Daum fork) - 설치 (Windows PowerShell)
# 원본: K-Mail-MCP by youngsooco (MIT) - https://github.com/youngsooco/k-mail-mcp
# 포크 변경: 한국어 전용 안내, MSIX 경로 자동 탐색, 기존 설정 파일 백업 후 수정
[Console]::InputEncoding  = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding            = [System.Text.Encoding]::UTF8
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "   K-Mail-MCP (네이버/다음) 설치" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

# 1. Node.js 확인
try {
    $nodeVer = & node --version 2>&1
    $verNum  = [int]($nodeVer -replace "v(\d+)\..*", '$1')
    if ($verNum -lt 18) {
        Write-Host "[ERROR] Node.js $nodeVer 은(는) 너무 오래됐습니다. v18 이상 필요: https://nodejs.org" -ForegroundColor Red
        Read-Host "Enter 키를 눌러 종료"; exit 1
    }
    Write-Host "[OK] Node.js $nodeVer" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] Node.js가 없습니다. https://nodejs.org 에서 LTS 버전을 설치하세요." -ForegroundColor Red
    Read-Host "Enter 키를 눌러 종료"; exit 1
}

# 2. 패키지 설치
Write-Host "[1/3] 패키지 설치 중..."
Set-Location $ScriptDir
& npm install --omit=dev --silent
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] npm install 실패" -ForegroundColor Red
    Read-Host "Enter 키를 눌러 종료"; exit 1
}
Write-Host "[OK] 패키지 설치 완료" -ForegroundColor Green

# 3. Claude 데스크톱 설정 파일 찾기
Write-Host "[2/3] Claude 데스크톱 설정 파일 찾는 중..."
$configPath = Get-Item "$env:LOCALAPPDATA\Packages\Claude_*\LocalCache\Roaming\Claude\claude_desktop_config.json" -ErrorAction SilentlyContinue |
              Select-Object -First 1 -ExpandProperty FullName
if (-not $configPath) {
    $configPath = @(
        "$env:APPDATA\Claude\claude_desktop_config.json",
        "$env:LOCALAPPDATA\Claude\claude_desktop_config.json"
    ) | Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $configPath) {
    $configPath = "$env:APPDATA\Claude\claude_desktop_config.json"
    $configDir  = Split-Path $configPath
    if (-not (Test-Path $configDir)) { New-Item -ItemType Directory -Path $configDir | Out-Null }
}
Write-Host "[OK] 설정 파일: $configPath" -ForegroundColor Green

# 4. 설정 등록 (기존 파일은 .bak 으로 백업)
Write-Host "[3/3] Claude 데스크톱 설정에 k-mail-mcp 등록 중..."
$indexPath = Join-Path $ScriptDir "index.js"
if (Test-Path $configPath) {
    Copy-Item $configPath "$configPath.bak" -Force
    $cfg = Get-Content $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if (-not $cfg) { $cfg = [PSCustomObject]@{} }
} else {
    $cfg = [PSCustomObject]@{}
}
if (-not $cfg.PSObject.Properties["mcpServers"]) {
    $cfg | Add-Member -MemberType NoteProperty -Name "mcpServers" -Value ([PSCustomObject]@{})
}
$entry = [PSCustomObject]@{ command = "node"; args = [object[]]@($indexPath) }
$cfg.mcpServers | Add-Member -MemberType NoteProperty -Name "k-mail-mcp" -Value $entry -Force
$jsonText = $cfg | ConvertTo-Json -Depth 20
[System.IO.File]::WriteAllText($configPath, $jsonText, (New-Object System.Text.UTF8Encoding $false))
Write-Host "[OK] 등록 완료 (이전 설정은 claude_desktop_config.json.bak 에 백업)" -ForegroundColor Green

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "   설치 완료!" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  다음 단계:"
Write-Host "  1. setup.bat 실행 -> 네이버/다음 계정과 앱 비밀번호 등록" -ForegroundColor Yellow
Write-Host "  2. Claude 데스크톱 앱을 완전히 종료(트레이 아이콘까지) 후 다시 실행"
Write-Host '  3. Claude에게: "네이버 다음 메일 최근 24시간 확인해줘"' -ForegroundColor Yellow
Write-Host ""
Read-Host "Enter 키를 눌러 종료"
