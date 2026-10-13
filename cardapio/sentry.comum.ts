// Opções do Sentry iguais em client, server e edge. Sem NEXT_PUBLIC_SENTRY_DSN (dev) o Sentry fica desligado.
export const opcoesSentry = {
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  sendDefaultPii: false, // sem IP, cookies nem dados do usuário
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
};
