import { z } from 'zod';
export const HealthResponse = z.object({
  status: z.literal('ok'),
  application: z.literal('inkling'),
  apiVersion: z.literal(1),
});
export type HealthResponse = z.infer<typeof HealthResponse>;
