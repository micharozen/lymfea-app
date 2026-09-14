import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Home, Gift, CalendarDays, LogOut } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { brand } from '@/config/brand';
import { usePortalData } from '@/hooks/portal/usePortalData';

const navItems = [
  { path: '/portal/dashboard', icon: Home, labelKey: 'portal.nav.dashboard' },
  { path: '/portal/gift-cards', icon: Gift, labelKey: 'portal.nav.giftCards' },
  { path: '/portal/bookings', icon: CalendarDays, labelKey: 'portal.nav.bookings' },
] as const;

export default function PortalLayout() {
  const { t } = useTranslation('client');
  const navigate = useNavigate();
  const { data } = usePortalData();

  const initials = [data?.customer.first_name?.[0], data?.customer.last_name?.[0]]
    .filter(Boolean)
    .join('')
    .toUpperCase();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/portal/login');
  };

  return (
    <div className="app-refonte flex flex-col min-h-dvh">
      <header className="hdr" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 14px)' }}>
        <span className="wordmark">{brand.name}</span>
        <div className="spacer" />
        <button
          type="button"
          className="hdr-icon-btn"
          onClick={handleLogout}
          aria-label={t('portal.logout')}
        >
          <LogOut className="h-[15px] w-[15px]" />
        </button>
        {initials && <span className="avatar">{initials}</span>}
      </header>

      <main className="app-scroll">
        <div className="mx-auto w-full max-w-lg">
          <Outlet />
        </div>
      </main>

      <nav className="app-refonte tabbar">
        {navItems.map(({ path, icon: Icon, labelKey }) => (
          <NavLink key={path} to={path} className={({ isActive }) => 'tab' + (isActive ? ' active' : '')}>
            {({ isActive }) => (
              <>
                <Icon size={21} strokeWidth={isActive ? 2.4 : 1.7} />
                {t(labelKey)}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
