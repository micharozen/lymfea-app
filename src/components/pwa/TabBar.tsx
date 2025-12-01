import { useNavigate, useLocation } from "react-router-dom";
import { Home, Wallet, Bell } from "lucide-react";

interface TabBarProps {
  unreadCount?: number;
}

const TabBar = ({ unreadCount = 0 }: TabBarProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  
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
          className="flex flex-col items-center justify-center gap-1 flex-1 transition-colors"
        >
          <Home 
            className={`w-6 h-6 transition-colors ${isActive("/pwa/dashboard") ? "text-black" : "text-gray-400"}`} 
            strokeWidth={1.5} 
          />
          <span className={`text-[10px] font-medium transition-colors ${isActive("/pwa/dashboard") ? "text-black" : "text-gray-400"}`}>
            Home
          </span>
        </button>
        <button className="flex flex-col items-center justify-center gap-1 flex-1 transition-colors">
          <Wallet className="w-6 h-6 text-gray-400" strokeWidth={1.5} />
          <span className="text-[10px] font-medium text-gray-400">Wallet</span>
        </button>
        <button 
          onClick={() => handleNavigation("/pwa/notifications")}
          className="flex flex-col items-center justify-center gap-1 flex-1 relative transition-colors"
        >
          <div className="relative">
            <Bell 
              className={`w-6 h-6 transition-colors ${isActive("/pwa/notifications") ? "text-black" : "text-gray-400"}`} 
              strokeWidth={1.5} 
            />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </div>
          <span className={`text-[10px] font-medium transition-colors ${isActive("/pwa/notifications") ? "text-black" : "text-gray-400"}`}>
            Notifications
          </span>
        </button>
      </div>
      <div className="h-1 w-32 bg-black rounded-full mx-auto mb-1" />
    </div>
  );
};

export default TabBar;
