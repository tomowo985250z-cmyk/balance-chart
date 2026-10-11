param([string[]]$Tests = @('link-ranking-production'))
$ErrorActionPreference = 'Stop'
$edgePath = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
$hasFailure = $false
if ($Tests.Count -eq 1 -and $Tests[0] -eq 'all') {
  $Tests = @(Get-ChildItem -LiteralPath $PSScriptRoot -Filter '*.html' |
    Where-Object { [IO.File]::ReadAllText($_.FullName) -match '\.test\.js' } |
    Select-Object -ExpandProperty BaseName)
  if (-not $Tests.Count) { throw 'No regression suites found' }
}
foreach ($testName in $Tests) {
  if ($testName -notmatch '^[a-z-]+(\.test)?$') { throw 'Invalid test name' }
  $testPath = Join-Path $PSScriptRoot ($testName + '.html')
  $profilePath = Join-Path ([IO.Path]::GetTempPath()) ('balance-regression-' + [guid]::NewGuid().ToString('N'))
  $outputPath = Join-Path ([IO.Path]::GetTempPath()) ('balance-' + $testName + '-dom.txt')
  $errorPath = Join-Path ([IO.Path]::GetTempPath()) ('balance-' + $testName + '-edge.log')
  $testUri = ([System.Uri]$testPath).AbsoluteUri + '?isolated=1'
  $edgeArgs = @('--headless','--disable-gpu','--disable-background-timer-throttling','--disable-renderer-backgrounding',
    '--allow-file-access-from-files','--no-first-run','--no-default-browser-check',
    '--virtual-time-budget=30000','--dump-dom',('--user-data-dir=' + $profilePath),$testUri)
  Start-Process -FilePath $edgePath -ArgumentList $edgeArgs -WindowStyle Hidden -Wait -RedirectStandardOutput $outputPath -RedirectStandardError $errorPath
  $dom = Get-Content -Raw -Encoding utf8 $outputPath
  $match = [regex]::Match($dom, '(?s)<pre id="results">(.*?)</pre>')
  $result = [System.Net.WebUtility]::HtmlDecode($match.Groups[1].Value)
  if ($result.StartsWith('PASS:')) { Write-Output ($testName + ': ' + ($result -split "`n")[0]) }
  else {
    $hasFailure = $true
    Write-Output ($testName + ': ' + $result.Substring(0,[Math]::Min(1200,$result.Length)))
    Write-Output ('DOM: ' + $outputPath)
  }
}
if ($hasFailure) { exit 1 }
