import { ApplicationConfig, importProvidersFrom, provideAppInitializer, provideBrowserGlobalErrorListeners, provideZoneChangeDetection, inject } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { SettingsService } from './core/services/settings.service';
import { LucideAngularModule,
  LayoutDashboard, Wallet, FileText, PlusCircle, LogOut, User, Mail, Lock,
  Eye, EyeOff, Loader2, CheckCircle, XCircle, AlertTriangle, AlertCircle, Info,
  ArrowLeft, ArrowRight, Calendar, Banknote, ClipboardList, ShieldCheck,
  ChevronRight, Clock, Menu, X, RefreshCw, Phone, KeyRound, Calculator, BadgeCheck,
} from 'lucide-angular';
import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideAnimations(),
    // Hydrate branding (colours, logo, company name) before first render so the
    // login screen is themed pre-auth. Failures fall back to CreditX defaults.
    provideAppInitializer(() => inject(SettingsService).load()),
    importProvidersFrom(
      LucideAngularModule.pick({
        LayoutDashboard, Wallet, FileText, PlusCircle, LogOut, User, Mail, Lock,
        Eye, EyeOff, Loader2, CheckCircle, XCircle, AlertTriangle, AlertCircle, Info,
        ArrowLeft, ArrowRight, Calendar, Banknote, ClipboardList, ShieldCheck,
        ChevronRight, Clock, Menu, X, RefreshCw, Phone, KeyRound, Calculator, BadgeCheck,
      }),
    ),
  ],
};
