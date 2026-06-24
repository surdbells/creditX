import { ApplicationConfig, importProvidersFrom, provideBrowserGlobalErrorListeners, provideZoneChangeDetection } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { LucideAngularModule,
  LayoutDashboard, Wallet, FileText, PlusCircle, LogOut, User, Mail, Lock,
  Eye, EyeOff, Loader2, CheckCircle, XCircle, AlertTriangle, AlertCircle, Info,
  ArrowLeft, ArrowRight, Calendar, Banknote, ClipboardList, ShieldCheck,
  ChevronRight, Clock, Menu, X, RefreshCw, Phone, KeyRound,
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
    importProvidersFrom(
      LucideAngularModule.pick({
        LayoutDashboard, Wallet, FileText, PlusCircle, LogOut, User, Mail, Lock,
        Eye, EyeOff, Loader2, CheckCircle, XCircle, AlertTriangle, AlertCircle, Info,
        ArrowLeft, ArrowRight, Calendar, Banknote, ClipboardList, ShieldCheck,
        ChevronRight, Clock, Menu, X, RefreshCw, Phone, KeyRound,
      }),
    ),
  ],
};
