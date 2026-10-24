# NOVA OS Windows preparation helper — read-only inventory, user-space export ONLY.
# Run in Windows PowerShell as an ordinary user; it does not modify partitions,
# boot entries, encryption or system settings. Exports files locally to Desktop.
$ErrorActionPreference = 'Continue'
$dest = Join-Path ([Environment]::GetFolderPath('Desktop')) 'NOVA-Export'
New-Item -ItemType Directory -Path $dest -Force | Out-Null
$report = Join-Path $dest 'windows-readiness.txt'
$lines = @(
  'NOVA OS 0.4 — проверка Windows для Dual Boot'
  "Дата: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
  "Windows: $([Environment]::OSVersion.VersionString)"
  'Перед установкой: внешняя копия, BitLocker recovery key, Fast Startup off, свободное место.'
  "Система UEFI? Проверьте msinfo32: BIOS Mode / Режим BIOS"
  "BitLocker / шифрование (проверьте в Параметрах Windows):"
)
try { $lines += (Get-BitLockerVolume -MountPoint $env:SystemDrive | Out-String) } catch { $lines += 'Команда BitLocker недоступна; проверьте вручную.' }
try { $lines += "Windows-диск: $((Get-Volume -DriveLetter ($env:SystemDrive.Substring(0,1)) | Out-String))" } catch { }
try {
  $v = Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Power'
  $lines += "Fast Startup HiberbootEnabled (1 = on): $($v.HiberbootEnabled)"
} catch { $lines += 'Статус Fast Startup не определён.' }
$lines | Out-File -LiteralPath $report -Encoding utf8
if (Get-Command winget -ErrorAction SilentlyContinue) {
  & winget export -o (Join-Path $dest 'winget-apps.json') --accept-source-agreements
} else {
  'winget отсутствует. NOVA Migration сможет составить неполный каталог по ярлыкам.' |
    Out-File -LiteralPath (Join-Path $dest 'winget-help.txt') -Encoding utf8
}
Write-Host "Готово. Файлы только для просмотра и миграции: $dest"
Write-Host 'Этот скрипт НЕ отключает BitLocker и НЕ изменяет диск/загрузчик.'
