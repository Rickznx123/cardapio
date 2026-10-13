import * as Sentry from "@sentry/nextjs";
import { opcoesSentry } from "./sentry.comum";

// Erros do navegador. Sem session replay (não adicionamos replayIntegration).
Sentry.init(opcoesSentry);

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
