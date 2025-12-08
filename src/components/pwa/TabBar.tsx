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
    <div className="flex-shrink-0 bg-white border-t border-gray-200 pb-safe">
      <div className="flex items-center justify-around h-16">
        <button 
          onClick={() => handleNavigation("/pwa/dashboard")}
          className="flex flex-col items-center justify-center gap-1 flex-1 transition-colors relative"
        >
          {isActive("/pwa/dashboard") && (
            <div className="absolute -top-0.5 w-8 h-1 bg-black rounded-full" />
          )}
          <div className={`p-2 rounded-xl transition-colors ${isActive("/pwa/dashboard") ? "bg-black/10" : ""}`}>
            <Home 
              className={`w-6 h-6 transition-colors ${isActive("/pwa/dashboard") ? "text-black" : "text-gray-400"}`} 
              strokeWidth={isActive("/pwa/dashboard") ? 2 : 1.5}
              fill={isActive("/pwa/dashboard") ? "currentColor" : "none"}
            />
          </div>
          <span className={`text-[10px] transition-colors ${isActive("/pwa/dashboard") ? "text-black font-bold" : "text-gray-400 font-medium"}`}>
            {t('tabs.home')}
          </span>
        </button>
        <button 
          onClick={() => handleNavigation("/pwa/wallet")}
          className="flex flex-col items-center justify-center gap-1 flex-1 transition-colors relative"
        >
          {isActive("/pwa/wallet") && (
            <div className="absolute -top-0.5 w-8 h-1 bg-black rounded-full" />
          )}
          <div className={`p-2 rounded-xl transition-colors ${isActive("/pwa/wallet") ? "bg-black/10" : ""}`}>
            <Wallet 
              className={`w-6 h-6 transition-colors ${isActive("/pwa/wallet") ? "text-black" : "text-gray-400"}`} 
              strokeWidth={isActive("/pwa/wallet") ? 2 : 1.5}
              fill={isActive("/pwa/wallet") ? "currentColor" : "none"}
            />
          </div>
          <span className={`text-[10px] transition-colors ${isActive("/pwa/wallet") ? "text-black font-bold" : "text-gray-400 font-medium"}`}>
            Wallet
          </span>
        </button>
        <button 
          onClick={() => handleNavigation("/pwa/notifications")}
          className="flex flex-col items-center justify-center gap-1 flex-1 relative transition-colors"
        >
          {isActive("/pwa/notifications") && (
            <div className="absolute -top-0.5 w-8 h-1 bg-black rounded-full" />
          )}
          <div className={`p-2 rounded-xl transition-colors relative ${isActive("/pwa/notifications") ? "bg-black/10" : ""}`}>
            <Bell 
              className={`w-6 h-6 transition-colors ${isActive("/pwa/notifications") ? "text-black" : "text-gray-400"}`} 
              strokeWidth={isActive("/pwa/notifications") ? 2 : 1.5}
              fill={isActive("/pwa/notifications") ? "currentColor" : "none"}
            />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </div>
          <span className={`text-[10px] transition-colors ${isActive("/pwa/notifications") ? "text-black font-bold" : "text-gray-400 font-medium"}`}>
            {t('tabs.notifications')}
          </span>
        </button>
      </div>
      <div className="h-1 w-32 bg-black rounded-full mx-auto mb-1" />
    </div>
  );
};

export default TabBar;
