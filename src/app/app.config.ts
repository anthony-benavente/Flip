import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { routes } from './app.routes';
import { LocalPlanRepository } from './persistence/local-plan.repository';
import { PLAN_REPOSITORY } from './persistence/plan-repository';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    // Swap for a server-backed repository when user accounts arrive.
    { provide: PLAN_REPOSITORY, useFactory: () => new LocalPlanRepository() },
  ],
};
