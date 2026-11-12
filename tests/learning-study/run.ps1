param([string]$OutputDirectory='')
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
if(!$OutputDirectory){$OutputDirectory=Join-Path $root 'output/learning-analysis'}
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$profile=Join-Path ([IO.Path]::GetTempPath()) ('balance-learning-analysis-'+[guid]::NewGuid().ToString('N'))
$domPath=Join-Path $OutputDirectory 'analysis-dom.html'
$uri=([Uri](Join-Path $PSScriptRoot 'analysis.html')).AbsoluteUri+'?isolated=1'
Start-Process -FilePath 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' -ArgumentList @('--headless','--disable-gpu','--allow-file-access-from-files','--disable-background-timer-throttling','--no-first-run','--no-default-browser-check','--virtual-time-budget=30000','--dump-dom',('--user-data-dir='+$profile),$uri) -WindowStyle Hidden -Wait -RedirectStandardOutput $domPath -RedirectStandardError (Join-Path $OutputDirectory 'analysis-edge.log')
$dom=[IO.File]::ReadAllText($domPath)
$result=[Net.WebUtility]::HtmlDecode([regex]::Match($dom,'(?s)<pre id="results">(.*?)</pre>').Groups[1].Value)
$result | Set-Content -Encoding UTF8 -LiteralPath (Join-Path $OutputDirectory 'analysis-result.txt')
if(!$result.StartsWith('PASS:')){throw $result}
$json=[Net.WebUtility]::HtmlDecode([regex]::Match($dom,'(?s)<pre id="report">(.*?)</pre>').Groups[1].Value)
$data=$json | ConvertFrom-Json
$json | Set-Content -Encoding UTF8 -LiteralPath (Join-Path $OutputDirectory 'analysis-results.json')
$data.synthetic.summary | Select-Object scenario,name,n,coverage,angleMAE,distanceMAE,endpointMAE,endpointRMSE,endpointP90,ipsMAE,alongMAE,crossMAE | Export-Csv -NoTypeInformation -Encoding UTF8 -LiteralPath (Join-Path $OutputDirectory 'synthetic-errors.csv')
Write-Output $result
Write-Output ('Real distance records: '+$data.realInventory.n+'; real forward accuracy comparisons: '+$data.realInventory.knownChronology.comparableFutureVectors)
$data.synthetic.summary | Select-Object scenario,name,n,angleMAE,distanceMAE,endpointMAE,ipsMAE | Format-Table -AutoSize
