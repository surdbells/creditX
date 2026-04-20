import { ApplicationConfig, importProvidersFrom, provideBrowserGlobalErrorListeners, provideZoneChangeDetection } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { LucideAngularModule,
  LayoutDashboard, Users, Shield, MapPin, Settings, ScrollText, Database,
  FileText, UserCheck, UserX, Landmark, Building2, CreditCard, Banknote, BarChart3,
  ArrowLeftRight, Bell, MessageSquare, Menu, X, Moon, Sun, LogOut, ChevronDown,
  ChevronLeft, ChevronRight, FolderKanban, Gavel, Eye, EyeOff, LogIn, Plus,
  Pencil, Trash2, Search, Download, Upload, Filter, CheckCircle, XCircle,
  Clock, AlertTriangle, AlertCircle, TrendingUp, TrendingDown, Save, RefreshCw, MoreVertical, Copy,
  Calendar, Hash, DollarSign, Percent, Info, ArrowUp, ArrowDown, Loader2,
  Columns3, FileSpreadsheet, Home, ExternalLink, Check, Lock,
  ALargeSmall, ChevronsUpDown, Minus, Inbox,
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
        LayoutDashboard, Users, Shield, MapPin, Settings, ScrollText, Database,
        FileText, UserCheck, UserX, Landmark, Building2, CreditCard, Banknote, BarChart3,
        ArrowLeftRight, Bell, MessageSquare, Menu, X, Moon, Sun, LogOut, ChevronDown,
        ChevronLeft, ChevronRight, FolderKanban, Gavel, Eye, EyeOff, LogIn, Plus,
        Pencil, Trash2, Search, Download, Upload, Filter, CheckCircle, XCircle,
        Clock, AlertTriangle, AlertCircle, TrendingUp, TrendingDown, Save, RefreshCw, MoreVertical, Copy,
        Calendar, Hash, DollarSign, Percent, Info, ArrowUp, ArrowDown, Loader2,
        Columns3, FileSpreadsheet, Home, ExternalLink, Check, Lock,
        ALargeSmall, ChevronsUpDown, Minus, Inbox,
      })
    ),
  ],
};
