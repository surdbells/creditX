import { ApplicationConfig } from '@angular/core';
import { provideRouter, RouteReuseStrategy, withComponentInputBinding } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideIonicAngular, IonicRouteStrategy } from '@ionic/angular/standalone';
import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { errorInterceptor } from './core/interceptors/error.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    // withComponentInputBinding() binds route params directly to
    // @Input() properties on the routed component. Without this, all
    // our thread / detail pages that read `@Input() id = ''` silently
    // get an empty string — the pages render a loading spinner and
    // never fire an API call. This was the root cause of the 'loan
    // details page loads forever' bug.
    provideRouter(routes, withComponentInputBinding()),
    // Error interceptor runs AFTER auth so 401s get refresh-handled
    // first. Order matters: the array runs top-down on request,
    // bottom-up on response.
    provideHttpClient(withInterceptors([authInterceptor, errorInterceptor])),
    provideIonicAngular({ mode: 'md' }),
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
  ],
};
