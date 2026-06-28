import { ApplicationConfig, importProvidersFrom, provideAppInitializer, provideBrowserGlobalErrorListeners, provideZoneChangeDetection, inject } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { LucideAngularModule,
  LayoutDashboard, Users, Shield, MapPin, Settings, ScrollText, Database,
  FileText, UserCheck, UserX, Landmark, Building, Building2, CreditCard, Banknote, BarChart3,
  ArrowLeftRight, Bell, MessageSquare, Menu, X, Moon, Sun, LogOut, ChevronDown,
  ChevronLeft, ChevronRight, FolderKanban, Gavel, Eye, EyeOff, LogIn, Plus,
  Pencil, Trash2, Search, Download, Upload, Filter, CheckCircle, XCircle,
  Clock, AlertTriangle, AlertCircle, TrendingUp, TrendingDown, Save, RefreshCw, MoreVertical, Copy,
  Calendar, Hash, DollarSign, Percent, Info, ArrowUp, ArrowDown, Loader2,
  Columns3, FileSpreadsheet, Home, ExternalLink, Check, Lock,
  ALargeSmall, ChevronsUpDown, Minus, Inbox, Target, PlusCircle, Edit3,
  Scale, History, ShieldAlert, Link, UserRound, Package, ShieldCheck,
  PiggyBank, ArrowLeft, ArrowDownCircle, ArrowUpCircle, Play, Undo2,
} from 'lucide-angular';
import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { SettingsService } from './core/services/settings.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideAnimations(),
    // Hydrate user-facing settings (currency symbol, company name, etc.)
    // before the first component renders. Failures inside SettingsService
    // are swallowed and fall back to hardcoded defaults — the app boots
    // regardless of whether the settings endpoint is reachable.
    provideAppInitializer(() => inject(SettingsService).load()),
    importProvidersFrom(
      LucideAngularModule.pick({
        LayoutDashboard, Users, Shield, MapPin, Settings, ScrollText, Database,
        FileText, UserCheck, UserX, Landmark, Building, Building2, CreditCard, Banknote, BarChart3,
        ArrowLeftRight, Bell, MessageSquare, Menu, X, Moon, Sun, LogOut, ChevronDown,
        ChevronLeft, ChevronRight, FolderKanban, Gavel, Eye, EyeOff, LogIn, Plus,
        Pencil, Trash2, Search, Download, Upload, Filter, CheckCircle, XCircle,
        Clock, AlertTriangle, AlertCircle, TrendingUp, TrendingDown, Save, RefreshCw, MoreVertical, Copy,
        Calendar, Hash, DollarSign, Percent, Info, ArrowUp, ArrowDown, Loader2,
        Columns3, FileSpreadsheet, Home, ExternalLink, Check, Lock,
        ALargeSmall, ChevronsUpDown, Minus, Inbox, Target, PlusCircle, Edit3,
        Scale, History, ShieldAlert, Link, UserRound, Package, ShieldCheck,
        PiggyBank, ArrowLeft, ArrowDownCircle, ArrowUpCircle, Play, Undo2,
      })
    ),
  ],
};
