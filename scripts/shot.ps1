$ErrorActionPreference = 'Continue'
Set-Location 'J:\DSH-workspace\J-Workspace\ai-principles-web'
$chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
$out = 'J:\DSH-workspace\J-Workspace\_shots'
New-Item -ItemType Directory -Force -Path $out | Out-Null
$url = 'http://127.0.0.1:8765/index.html'

function Take-Shot {
  param($name, $hash, $w, $h)
  $target = $url + $hash
  $a = @(
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-sandbox',
    '--force-device-scale-factor=1', '--virtual-time-budget=7000',
    '--run-all-compositor-stages-before-draw',
    ("--window-size={0},{1}" -f $w, $h),
    ("--screenshot={0}\{1}.png" -f $out, $name),
    $target
  )
  & $chrome @a 2>$null | Out-Null
  if (Test-Path ("{0}\{1}.png" -f $out, $name)) { "OK   $name" } else { "FAIL $name" }
}

Take-Shot 'home-top' '' 1500 1100
Take-Shot 'home-modmap' '#modmap' 1500 1400
Take-Shot 'm07-mech' '#m07--mechanism' 1500 1300
Take-Shot 'm07-demo' '#m07--demo' 1500 1200

$dom = "$out\dom-m07.html"
$target = 'http://127.0.0.1:8765/index.html#m07--demo'
& $chrome --headless=new --disable-gpu --no-sandbox --virtual-time-budget=6000 --dump-dom $target 2>$null | Out-File -Encoding utf8 $dom
Write-Output ("dom size: " + (Get-Item $dom).Length)
$d = Get-Content $dom -Raw
foreach ($probe in @('is-live', 'demo-svg', 'data-i=', 'takeaway__line', 'demo__readout', 'demo__legend', 'demos/m07-attn-map.js', 'data-demo="m07-attn-map"')) {
  $n = ([regex]::Matches($d, [regex]::Escape($probe))).Count
  Write-Output ("{0,-28} {1}" -f $probe, $n)
}

