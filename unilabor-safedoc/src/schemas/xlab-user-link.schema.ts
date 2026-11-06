import { z } from 'zod';

export const xlabUserLinkSchema = z.object({
  cve_usuario: z.number({ error: 'Elige un usuario de XLab' }).int('Clave de XLab invalida').positive('Clave de XLab invalida'),
});

export type XlabUserLinkBody = z.infer<typeof xlabUserLinkSchema>;
