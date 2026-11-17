import { z } from 'zod';
export const HealthResponse = z.object({
  status: z.literal('ok'),
  application: z.literal('inkling'),
  apiVersion: z.literal(1),
});
export type HealthResponse = z.infer<typeof HealthResponse>;

export const AuthSession = z.object({
  csrfToken: z.string().regex(/^[a-f0-9]{64}$/),
  expiresAt: z.number().int().positive(),
});
export * from './article';
export * from './revision';
