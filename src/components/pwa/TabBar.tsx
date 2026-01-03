import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Home, Wallet, Bell } from "lucide-react";

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
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border pt-3 pb-[env(safe-area-inset-bottom,12px)]"
    >
      <div className="flex items-center justify-around">
        <button 
          onClick={() => handleNavigation("/pwa/dashboard")}
          className="flex flex-col items-center justify-center gap-1 flex-1 py-2 transition-all"
        >
          <Home
            className={`w-6 h-6 transition-colors ${isActive("/pwa/dashboard") ? "text-foreground" : "text-muted-foreground"}`} 
            strokeWidth={isActive("/pwa/dashboard") ? 2.5 : 1.5}
          />
          <span className={`text-[10px] transition-colors ${isActive("/pwa/dashboard") ? "text-foreground font-semibold" : "text-muted-foreground font-medium"}`}>
            {t('tabs.home')}
          </span>
        </button>
        <button 
          onClick={() => handleNavigation("/pwa/wallet")}
          className="flex flex-col items-center justify-center gap-1 flex-1 py-2 transition-all"
        >
          <Wallet 
            className={`w-6 h-6 transition-colors ${isActive("/pwa/wallet") ? "text-foreground" : "text-muted-foreground"}`} 
            strokeWidth={isActive("/pwa/wallet") ? 2.5 : 1.5}
          />
          <span className={`text-[10px] transition-colors ${isActive("/pwa/wallet") ? "text-foreground font-semibold" : "text-muted-foreground font-medium"}`}>
            Wallet
          </span>
        </button>
        <button 
          onClick={() => handleNavigation("/pwa/notifications")}
          className="flex flex-col items-center justify-center gap-1 flex-1 py-2 transition-all relative"
        >
          <div className="relative">
            <Bell 
              className={`w-6 h-6 transition-colors ${isActive("/pwa/notifications") ? "text-foreground" : "text-muted-foreground"}`} 
              strokeWidth={isActive("/pwa/notifications") ? 2.5 : 1.5}
            />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </div>
          <span className={`text-[10px] transition-colors ${isActive("/pwa/notifications") ? "text-foreground font-semibold" : "text-muted-foreground font-medium"}`}>
            {t('tabs.notifications')}
          </span>
        </button>
      </div>
    </nav>
  );
};

export default TabBar;