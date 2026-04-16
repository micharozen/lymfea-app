import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LayoutDashboard, Gift, CalendarDays, LogOut } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { brand, brandLogos } from '@/config/brand';
import { cn } from '@/lib/utils';

const navItems = [
  { path: '/portal/dashboard', icon: LayoutDashboard, labelKey: 'portal.nav.dashboard' },
  { path: '/portal/gift-cards', icon: Gift, labelKey: 'portal.nav.giftCards' },
  { path: '/portal/bookings', icon: CalendarDays, labelKey: 'portal.nav.bookings' },
] as const;

export default function PortalLayout() {
  const { t } = useTranslation('client');
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/portal/login');
  };

  return (
    <div className="min-h-dvh bg-gray-50 flex flex-col pb-safe">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <img src={brandLogos.monogramBlack} alt={brand.name} className="h-6 w-6" />
          <span className="font-serif text-gray-900 text-sm tracking-wide">{t('portal.title')}</span>
        </div>
        <button
          onClick={handleLogout}
          className="text-gray-400 hover:text-gray-600 transition-colors p-2"
          aria-label={t('portal.logout')}
        >
          <LogOut className="w-4 h-4" />
        </button>
      </header>

      {/* Content */}
      <main className="flex-1 p-4 max-w-lg mx-auto w-full">
        <Outlet />
      </main>

      {/* Bottom nav */}
      <nav className="bg-white border-t border-gray-100 flex items-center justify-around py-2 px-4 sticky bottom-0">
        {navItems.map(({ path, icon: Icon, labelKey }) => (
          <NavLink
            key={path}
            to={path}
            className={({ isActive }) => cn(
              "flex flex-col items-center gap-1 py-1 px-3 rounded-lg transition-colors min-w-[64px]",
              isActive
                ? "text-gray-900"
                : "text-gray-400 hover:text-gray-600"
            )}
          >
            <Icon className="w-5 h-5" />
            <span className="text-[10px] font-medium">{t(labelKey)}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
