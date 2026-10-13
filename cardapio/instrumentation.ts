import * as Sentry from "@sentry/nextjs";
import { opcoesSentry } from "./sentry.comum";

// Erros do server (Server Components, Route Handlers, proxy).
export function register() {
  Sentry.init(opcoesSentry);
}

// Erro não tratado em qualquer requisição (route handlers como /api/cadastro e /api/garcom/login incluídos).
export const onRequestError = Sentry.captureRequestError;
