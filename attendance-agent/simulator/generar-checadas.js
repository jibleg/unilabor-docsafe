/**
 * Genera checadas de prueba en el reloj simulado.
 *   node simulator/generar-checadas.js --empleados=T001,T002 [--desconocido=9999] [--url=http://127.0.0.1:8800]
 *        [--sin-push] [--desfase=-30] [--entradas-y-salidas] [--repetir]
 * - Cada empleado checa entrada (y salida con --entradas-y-salidas).
 * - --desconocido=N: numero que existe en el reloj pero no en DocSafe (queda en revision).
 * - --desfase=MIN: mueve la hora del evento MIN minutos (para probar desfase de reloj).
 * - --sin-push: solo queda en la memoria del reloj; el agente lo trae en la recuperacion.
 */
const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const flag = (name) => process.argv.includes(`--${name}`);

const base = arg('url', 'http://127.0.0.1:8800');
const employees = arg('empleados', 'T001').split(',').map((s) => s.trim()).filter(Boolean);
const unknown = arg('desconocido', null);
const offsetMinutes = Number(arg('desfase', 0));
const push = !flag('sin-push');

async function check(employeeNo, attendanceStatus, create) {
  const r = await fetch(`${base}/sim/checar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ employeeNo, attendanceStatus, push, create, offsetMinutes }),
  });
  const data = await r.json();
  console.log(`${employeeNo} ${attendanceStatus} -> ${r.status} ${JSON.stringify(data)}`);
}

for (const n of employees) {
  await check(n, 'checkIn', false);
  if (flag('entradas-y-salidas')) await check(n, 'checkOut', false);
}
if (unknown) await check(unknown, 'checkIn', true);
