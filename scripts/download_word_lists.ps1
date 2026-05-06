# One-time setup: download the answer list (curated ~2,309 Wordle answers)
# and the combined valid-guess list (~14,855 words used for player-input
# validation). Idempotent — overwrites existing files. Source mirrors are
# public-domain word lists; see README for licensing notes.

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$root = Split-Path -Parent $PSScriptRoot

function Get-WordList {
  param([string]$Url, [string]$OutPath)
  Write-Host "  · downloading $Url"
  $dir = Split-Path -Parent $OutPath
  if (!(Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
  Invoke-WebRequest -Uri $Url -OutFile $OutPath -UseBasicParsing

  # Normalize to lowercase, one 5-letter word per line, sorted, deduped.
  $words = Get-Content $OutPath `
    | ForEach-Object { $_.Trim().ToLower() } `
    | Where-Object { $_ -match '^[a-z]{5}$' } `
    | Sort-Object -Unique
  Set-Content -Path $OutPath -Value $words -Encoding ascii
  Write-Host ("    {0,5} words -> {1}" -f $words.Count, ($OutPath -replace [regex]::Escape($root), '.'))
}

# Curated answers (the puzzle solution can only be drawn from here).
Get-WordList `
  -Url 'https://gist.githubusercontent.com/cfreshman/a03ef2cba789d8cf00c08f767e0fad7b/raw/wordle-answers-alphabetical.txt' `
  -OutPath (Join-Path $root 'scripts\answer_list.txt')

# Combined valid-guess dictionary (player input is validated against this).
Get-WordList `
  -Url 'https://raw.githubusercontent.com/tabatkins/wordle-list/main/words' `
  -OutPath (Join-Path $root 'public\words\valid-guesses.txt')

Write-Host "`nDone."
