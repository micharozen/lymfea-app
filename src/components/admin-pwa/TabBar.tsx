import { useNavigate, useLocation } from "react-router-dom";
import { CalendarDays, Plus, Bell } from "lucide-react";

interface AdminTabBarProps {
  unreadCount?: number;
}

const AdminTabBar = ({ unreadCount = 0 }: AdminTabBarProps) => {
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  const handleNavigation = (path: string) => {
    if (location.pathname !== path) {
      navigate(path);
    }
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 backdrop-blur-md bg-black/30 border-t border-white/10 w-full">
      <div className="flex items-center justify-around pt-3 pb-[max(env(safe-area-inset-bottom),16px)]">
        <button
          onClick={() => handleNavigation("/admin-pwa/dashboard")}
          className="flex flex-col items-center justify-center gap-1 flex-1 transition-all"
        >
          <CalendarDays
            className={`w-6 h-6 transition-colors ${isActive("/admin-pwa/dashboard") ? "text-white" : "text-white/50"}`}
            strokeWidth={isActive("/admin-pwa/dashboard") ? 2.5 : 1.5}
          />
          <span className={`text-[10px] transition-colors ${isActive("/admin-pwa/dashboard") ? "text-white font-semibold" : "text-white/50 font-medium"}`}>
            Réservations
          </span>
        </button>
        <button
          onClick={() => handleNavigation("/admin-pwa/create")}
          className="flex flex-col items-center justify-center gap-1 flex-1 transition-all"
        >
          <Plus
            className={`w-6 h-6 transition-colors ${isActive("/admin-pwa/create") ? "text-white" : "text-white/50"}`}
            strokeWidth={isActive("/admin-pwa/create") ? 2.5 : 1.5}
          />
          <span className={`text-[10px] transition-colors ${isActive("/admin-pwa/create") ? "text-white font-semibold" : "text-white/50 font-medium"}`}>
            Créer
          </span>
        </button>
        <button
          onClick={() => handleNavigation("/admin-pwa/notifications")}
          className="flex flex-col items-center justify-center gap-1 flex-1 transition-all relative"
        >
          <div className="relative">
            <Bell
              className={`w-6 h-6 transition-colors ${isActive("/admin-pwa/notifications") ? "text-white" : "text-white/50"}`}
              strokeWidth={isActive("/admin-pwa/notifications") ? 2.5 : 1.5}
            />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-gold-400 text-black text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </div>
          <span className={`text-[10px] transition-colors ${isActive("/admin-pwa/notifications") ? "text-white font-semibold" : "text-white/50 font-medium"}`}>
            Notifications
          </span>
        </button>
      </div>
    </nav>
  );
};

export default AdminTabBar;
