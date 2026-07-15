import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Home, BarChart3, Bell, Plus, Calendar } from "lucide-react";

interface TabBarProps {
  unreadCount?: number;
  scheduleIncomplete?: boolean;
}

const TabBar = ({ unreadCount = 0, scheduleIncomplete = false }: TabBarProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation('pwa');

  const isActive = (path: string) => location.pathname === path;

  const go = (path: string) => {
    if (location.pathname !== path) navigate(path);
  };

  return (
    <nav className="app-refonte tabbar fixed bottom-0 left-0 right-0 z-50">
      <button
        className={"tab" + (isActive("/pwa/dashboard") ? " active" : "")}
        onClick={() => go("/pwa/dashboard")}
      >
        <Home size={21} strokeWidth={isActive("/pwa/dashboard") ? 2.4 : 1.7} />
        {t('tabs.home')}
      </button>

      <button
        className={"tab" + (isActive("/pwa/bookings") ? " active" : "")}
        onClick={() => go("/pwa/bookings")}
      >
        <span className="relative">
          <Calendar size={21} strokeWidth={isActive("/pwa/bookings") ? 2.4 : 1.7} />
          {scheduleIncomplete && <span className="dot-badge" />}
        </span>
        {t('tabs.agenda')}
      </button>

      <button className="tab-plus" onClick={() => go("/pwa/new-booking")} title={t('tabs.newBooking')}>
        <span className="disc"><Plus size={20} strokeWidth={2.4} /></span>
      </button>

      <button
        className={"tab" + (isActive("/pwa/statistics") ? " active" : "")}
        onClick={() => go("/pwa/statistics")}
      >
        <BarChart3 size={21} strokeWidth={isActive("/pwa/statistics") ? 2.4 : 1.7} />
        {t('tabs.stats')}
      </button>

      <button
        className={"tab" + (isActive("/pwa/notifications") ? " active" : "")}
        onClick={() => go("/pwa/notifications")}
      >
        <span className={unreadCount > 0 ? "bdg" : ""} data-n={unreadCount > 99 ? "99+" : unreadCount}>
          <Bell size={21} strokeWidth={isActive("/pwa/notifications") ? 2.4 : 1.7} />
        </span>
        {t('tabs.notifications')}
      </button>
    </nav>
  );
};

export default TabBar;
