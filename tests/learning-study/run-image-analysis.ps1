param([string]$OutputDirectory='')
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
if(!$OutputDirectory){$OutputDirectory=Join-Path $root 'output/learning-analysis'}
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$profile=Join-Path ([IO.Path]::GetTempPath()) ('balance-image-analysis-'+[guid]::NewGuid().ToString('N'))
$domPath=Join-Path $OutputDirectory 'image-analysis-dom.html'
$uri=([Uri](Join-Path $PSScriptRoot 'image-analysis.html')).AbsoluteUri+'?isolated=1'
Start-Process -FilePath 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' -ArgumentList @('--headless','--disable-gpu','--allow-file-access-from-files','--no-first-run','--no-default-browser-check','--virtual-time-budget=30000','--dump-dom',('--user-data-dir='+$profile),$uri) -WindowStyle Hidden -Wait -RedirectStandardOutput $domPath -RedirectStandardError (Join-Path $OutputDirectory 'image-analysis-edge.log')
$dom=[IO.File]::ReadAllText($domPath)
$result=[Net.WebUtility]::HtmlDecode([regex]::Match($dom,'(?s)<pre id="results">(.*?)</pre>').Groups[1].Value)
if(!$result.StartsWith('PASS:')){throw $result}
$json=[Net.WebUtility]::HtmlDecode([regex]::Match($dom,'(?s)<pre id="report">(.*?)</pre>').Groups[1].Value)
$json | Set-Content -Encoding UTF8 -LiteralPath (Join-Path $OutputDirectory 'image-analysis-results.json')
$data=$json | ConvertFrom-Json
$data.measuredVectors | Select-Object beforeResult,afterResult,type,color,blade,direction,amount,@{n='distanceIPS';e={$_.actualVector.distance}},@{n='screenAngleDeg';e={$_.actualVector.angle}} | Export-Csv -NoTypeInformation -Encoding UTF8 -LiteralPath (Join-Path $OutputDirectory 'confirmed-vectors.csv')
$data.residuals | Export-Csv -NoTypeInformation -Encoding UTF8 -LiteralPath (Join-Path $OutputDirectory 'scalar-residuals.csv')
Write-Output $result
$data.radialMetrics | ConvertTo-Json -Depth 4
