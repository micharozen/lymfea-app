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
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 backdrop-blur-md bg-black/30 border-t border-white/10 w-full"
    >
      <div className="flex items-center justify-around pt-3 pb-[max(env(safe-area-inset-bottom),16px)]">
        <button 
          onClick={() => handleNavigation("/pwa/dashboard")}
          className="flex flex-col items-center justify-center gap-1 flex-1 transition-all"
        >
          <Home
            className={`w-6 h-6 transition-colors ${isActive("/pwa/dashboard") ? "text-white" : "text-white/50"}`} 
            strokeWidth={isActive("/pwa/dashboard") ? 2.5 : 1.5}
          />
          <span className={`text-[10px] transition-colors ${isActive("/pwa/dashboard") ? "text-white font-semibold" : "text-white/50 font-medium"}`}>
            {t('tabs.home')}
          </span>
        </button>
        <button 
          onClick={() => handleNavigation("/pwa/wallet")}
          className="flex flex-col items-center justify-center gap-1 flex-1 transition-all"
        >
          <Wallet 
            className={`w-6 h-6 transition-colors ${isActive("/pwa/wallet") ? "text-white" : "text-white/50"}`} 
            strokeWidth={isActive("/pwa/wallet") ? 2.5 : 1.5}
          />
          <span className={`text-[10px] transition-colors ${isActive("/pwa/wallet") ? "text-white font-semibold" : "text-white/50 font-medium"}`}>
            Wallet
          </span>
        </button>
        <button
          onClick={() => handleNavigation("/pwa/new-booking")}
          className="flex items-center justify-center flex-1 -mt-4"
        >
          <div className="w-12 h-12 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/30">
            <Plus className="w-6 h-6 text-white" strokeWidth={2.5} />
          </div>
        </button>
        <button
          onClick={() => handleNavigation("/pwa/notifications")}
          className="flex flex-col items-center justify-center gap-1 flex-1 transition-all relative"
        >
          <div className="relative">
            <Bell 
              className={`w-6 h-6 transition-colors ${isActive("/pwa/notifications") ? "text-white" : "text-white/50"}`} 
              strokeWidth={isActive("/pwa/notifications") ? 2.5 : 1.5}
            />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-gold-400 text-black text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </div>
          <span className={`text-[10px] transition-colors ${isActive("/pwa/notifications") ? "text-white font-semibold" : "text-white/50 font-medium"}`}>
            {t('tabs.notifications')}
          </span>
        </button>
      </div>
    </nav>
  );
};

export default TabBar;
