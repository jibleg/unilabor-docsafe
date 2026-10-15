<#
  DocSafe Agente de asistencias - arranque automatico en Windows (PM2)

  Registra una tarea programada que ejecuta `pm2 resurrect` al iniciar Windows,
  para que el agente se levante solo cuando la PC de la sucursal se enciende.

  REQUISITOS
    - Correr en PowerShell COMO ADMINISTRADOR.
    - Correr con el MISMO usuario de Windows con el que se hizo `pm2 save`
      (PM2 guarda su lista de procesos por usuario en %USERPROFILE%\.pm2).
    - Antes, en C:\docsafe-agente:  pm2 start ecosystem.config.cjs ; pm2 save

  USO
    .\instalar-arranque.ps1                 # al iniciar el sistema (pide la contraseña de Windows)
    .\instalar-arranque.ps1 -AlIniciarSesion  # al iniciar sesion (si la cuenta no tiene contraseña)
    .\instalar-arranque.ps1 -Desinstalar
#>
param(
  [string]$Usuario = "$env:USERDOMAIN\$env:USERNAME",
  [string]$NombreTarea = 'DocSafe Agente',
  [int]$RetrasoMinutos = 1,
  [switch]$AlIniciarSesion,
  [switch]$Desinstalar
)
$ErrorActionPreference = 'Stop'

if ($Desinstalar) {
  Unregister-ScheduledTask -TaskName $NombreTarea -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host "Tarea '$NombreTarea' eliminada."
  exit 0
}

$pm2 = Join-Path $env:APPDATA 'npm\pm2.cmd'
if (-not (Test-Path $pm2)) { throw "No se encontro pm2 en $pm2. Instala con: npm i -g pm2" }

$dump = Join-Path $env:USERPROFILE '.pm2\dump.pm2'
if (-not (Test-Path $dump)) {
  Write-Warning "No existe $dump. Corre primero 'pm2 start ecosystem.config.cjs' y 'pm2 save' en C:\docsafe-agente; sin eso 'pm2 resurrect' no levanta nada."
}

$accion = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c `"$pm2`" resurrect"

if ($AlIniciarSesion) {
  $disparo = New-ScheduledTaskTrigger -AtLogOn -User $Usuario
} else {
  $disparo = New-ScheduledTaskTrigger -AtStartup
}
$disparo.Delay = "PT${RetrasoMinutos}M"   # da tiempo a que la red este lista

$ajustes = New-ScheduledTaskSettingsSet -StartWhenAvailable `
  -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$ajustes.ExecutionTimeLimit = 'PT0S'      # sin limite de tiempo

Unregister-ScheduledTask -TaskName $NombreTarea -Confirm:$false -ErrorAction SilentlyContinue

if ($AlIniciarSesion) {
  Register-ScheduledTask -TaskName $NombreTarea -Action $accion -Trigger $disparo -Settings $ajustes `
    -User $Usuario -RunLevel Highest | Out-Null
} else {
  $cred = Get-Credential -UserName $Usuario -Message 'Contraseña de Windows del usuario (necesaria para correr sin sesion iniciada)'
  Register-ScheduledTask -TaskName $NombreTarea -Action $accion -Trigger $disparo -Settings $ajustes `
    -User $cred.UserName -Password $cred.GetNetworkCredential().Password -RunLevel Highest | Out-Null
}

Get-ScheduledTask -TaskName $NombreTarea | Format-List TaskName, State
Write-Host "Listo. Prueba sin reiniciar:  pm2 kill ; Start-ScheduledTask -TaskName '$NombreTarea' ; Start-Sleep 15 ; pm2 list"
Write-Host "Luego reinicia la PC y confirma que el reloj aparece 'En linea' en DocSafe."
