import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Home, Wallet, Bell, Plus } from "lucide-react";

interface TabBarProps {
  unreadCount?: number;
}

const TabBar = ({ unreadCount = 0 }: TabBarProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation('pwa');
  
  const isActive = (path: string) => location.pathname === path;

  const handleNavigation = (path: string) => {
    if (location.pathname !== path) {
      navigate(path);
    }
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 w-full">
      {/* Floating center button — protrudes above the bar like Uber */}
      <div className="absolute left-1/2 -translate-x-1/2 -top-7 z-10">
        <button
          onClick={() => handleNavigation("/pwa/new-booking")}
          className="w-14 h-14 rounded-full bg-gold-400 flex items-center justify-center shadow-lg shadow-gold-400/30 active:scale-95 transition-transform"
        >
          <Plus className="w-7 h-7 text-black" strokeWidth={2.5} />
        </button>
      </div>

      {/* Bar */}
      <div className="bg-white dark:bg-neutral-900 border-t border-border/40 shadow-[0_-1px_12px_rgba(0,0,0,0.04)]">
        <div className="flex items-center justify-around pt-2.5 pb-[max(env(safe-area-inset-bottom),12px)]">
          <button
            onClick={() => handleNavigation("/pwa/dashboard")}
            className="flex flex-col items-center justify-center gap-0.5 flex-1 transition-all"
          >
            <Home
              className={`w-[22px] h-[22px] transition-colors ${isActive("/pwa/dashboard") ? "text-gold-400" : "text-muted-foreground"}`}
              strokeWidth={isActive("/pwa/dashboard") ? 2.5 : 1.5}
            />
            <span className={`text-[10px] transition-colors ${isActive("/pwa/dashboard") ? "text-gold-400 font-semibold" : "text-muted-foreground font-medium"}`}>
              {t('tabs.home')}
            </span>
          </button>

          <button
            onClick={() => handleNavigation("/pwa/wallet")}
            className="flex flex-col items-center justify-center gap-0.5 flex-1 transition-all"
          >
            <Wallet
              className={`w-[22px] h-[22px] transition-colors ${isActive("/pwa/wallet") ? "text-gold-400" : "text-muted-foreground"}`}
              strokeWidth={isActive("/pwa/wallet") ? 2.5 : 1.5}
            />
            <span className={`text-[10px] transition-colors ${isActive("/pwa/wallet") ? "text-gold-400 font-semibold" : "text-muted-foreground font-medium"}`}>
              {t('tabs.wallet')}
            </span>
          </button>

          {/* Center spacer for the FAB */}
          <div className="flex-1" />

          <button
            onClick={() => handleNavigation("/pwa/notifications")}
            className="flex flex-col items-center justify-center gap-0.5 flex-1 transition-all relative"
          >
            <div className="relative">
              <Bell
                className={`w-[22px] h-[22px] transition-colors ${isActive("/pwa/notifications") ? "text-gold-400" : "text-muted-foreground"}`}
                strokeWidth={isActive("/pwa/notifications") ? 2.5 : 1.5}
              />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1.5 bg-gold-400 text-black text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </div>
            <span className={`text-[10px] transition-colors ${isActive("/pwa/notifications") ? "text-gold-400 font-semibold" : "text-muted-foreground font-medium"}`}>
              {t('tabs.notifications')}
            </span>
          </button>
        </div>
      </div>
    </nav>
  );
};

export default TabBar;
