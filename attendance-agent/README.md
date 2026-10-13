# Agente de asistencias DocSafe

Programa que corre en una PC de cada sucursal y hace de pasarela entre el reloj HikVision (red local, ISAPI) y DocSafe (solo conexiones de salida por HTTPS).

- Latido cada 60 s (estado del reloj: serie, modelo, hora, personas).
- Ordenes cada 15 s: alta/baja de personas, captura de huella/rostro, consulta de estado y de eventos.
- Checadas: el reloj las empuja al agente (push HTTP en la LAN) y cada 10 min se recuperan las ultimas 24 h por si se perdio alguna.
- Cola local SQLite: sin internet las checadas se acumulan y se entregan despues (lotes de 100 cada 5 s, se purga lo entregado a los 30 dias).

Requisitos: Node.js 22.5 o superior (usa `node:sqlite`, sin dependencias npm), una PC encendida en horario laboral en la misma red que el reloj.

## Instalacion

1. En DocSafe (Asistencias > Relojes) crea el agente de la sucursal. Se muestra **una sola vez** la clave y el JSON de configuracion.
2. Copia esta carpeta a la PC (ej. `C:\docsafe-agente`).
3. Copia `agent.config.example.json` a `agent.config.json` y pega la clave:

```json
{
  "docsafeUrl": "https://sgc.unilabor-app.com",
  "agentKey": "<64 caracteres>",
  "listenPort": 8085,
  "terminals": [{ "name": "Recepcion", "ip": "192.168.1.50", "port": 80, "username": "admin", "password": "..." }],
  "intervals": { "heartbeat": 60, "orders": 15, "recovery": 600 },
  "recoveryHours": 24,
  "queuePath": "./queue.sqlite"
}
```

`recoveryHours` (24 por defecto) es cuantas horas hacia atras le pide el agente al reloj en cada recuperacion (al arrancar y cada 10 min): subelo (p. ej. a 48 o 72) si quieres poder recuperar checadas tras un apagado largo de la PC del agente; el JSON no admite comentarios, por eso la nota vive aqui.

Las credenciales del reloj solo viven en este archivo; protegelo (acceso solo para el usuario del servicio). `pushHost` (opcional) fuerza la IP a la que el reloj enviara el push si la PC tiene varias tarjetas de red.

4. Prueba a mano: `node src/agent.js`. Debe mostrar "push configurado" y en DocSafe el reloj aparece en linea. Ajusta el firewall de Windows para permitir el puerto `listenPort` (8085) entrante desde la LAN.

## Instalar como servicio

### Windows con NSSM
```
nssm install DocSafeAgente "C:\Program Files\nodejs\node.exe" "C:\docsafe-agente\src\agent.js"
nssm set DocSafeAgente AppDirectory C:\docsafe-agente
nssm set DocSafeAgente AppStdout C:\docsafe-agente\agente.log
nssm set DocSafeAgente AppStderr C:\docsafe-agente\agente.log
nssm set DocSafeAgente Start SERVICE_AUTO_START
nssm start DocSafeAgente
```

### pm2
```
npm i -g pm2
pm2 start src/agent.js --name docsafe-agente
pm2 save
pm2 startup        # sigue las instrucciones (en Windows: pm2-installer)
```

## Variables
`AGENT_CONFIG`: ruta alterna del archivo de configuracion.

## Log
El agente imprime su log en la terminal y lo guarda en `agente.log` (opcion `logPath` del archivo de configuracion; vacio = solo terminal), con la **hora local** y su desfase (`2026-10-13T12:29:33-06:00`). Rota a 5 MB y conserva 5 archivos (`agente.log.1` ... `.5`). Un fallo al escribir el archivo no detiene al agente.

## Solucion de problemas
| Sintoma | Causa probable |
|---|---|
| "DocSafe sin respuesta al latido: 401" | Clave incorrecta o rotada; pega la nueva. |
| "... 403" | El agente esta desactivado en DocSafe. |
| "<reloj> fuera de linea" | IP/puerto/usuario/contrasena del reloj, o la PC no esta en su red. Abre `http://IP-del-reloj` en el navegador. |
| "push no configurable" | El equipo no acepto el host HTTP; las checadas llegan igual por la recuperacion (cada 10 min). |
| Checadas llegan con retraso | El push no llega: revisa firewall del puerto 8085 o la IP (`pushHost`). |
| "DocSafe aun no conoce la terminal" (404) | Aun no hay latido valido; se reintenta solo. |
| Checadas en "revision" | Numero de reloj sin colaborador, o la hora del reloj esta desfasada. |
| Huella/rostro remoto falla | Depende del modelo; enrola directamente en el equipo. |

Hora del reloj: si el desfase supera el parametro de DocSafe las checadas pasan a revision; ajusta la hora del equipo o activa NTP.

## Simulador (QA sin hardware)
```
node simulator/terminal-simulada.js 8800        # reloj HikVision simulado (admin / Sim12345)
# agent.config.json con ip 127.0.0.1, port 8800, username admin, password Sim12345
node src/agent.js
node simulator/generar-checadas.js --empleados=T001,T002 --entradas-y-salidas --desconocido=9999
node simulator/generar-checadas.js --empleados=T001 --desfase=30     # reloj desfasado
node simulator/generar-checadas.js --empleados=T002 --sin-push       # llega por recuperacion
```

## Pruebas
`npm test` (node:test: mapeo de eventos, cola, digest, push, configuracion).
