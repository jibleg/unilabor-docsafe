/** Instante timestamptz como texto ISO UTC (evita conversiones de zona del driver). */
export const isoTs = (column: string): string =>
  `to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

/** Cuantos minutos sin latido se considera fuera de linea (parametro agent_offline_min). */
export const isFresh = (column: string, offlineMinutesParam: string): string =>
  `(${column} IS NOT NULL AND ${column} > NOW() - make_interval(mins => ${offlineMinutesParam}::int))`;
