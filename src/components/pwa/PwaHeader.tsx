import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";

interface PwaHeaderProps {
  title?: string;
  showBack?: boolean;
  backPath?: string;
  onBack?: () => void;
  leftSlot?: ReactNode;
  rightSlot?: ReactNode;
  centerSlot?: ReactNode;
}

const PwaHeader = ({
  title,
  showBack = false,
  backPath,
  onBack,
  leftSlot,
  rightSlot,
  centerSlot,
}: PwaHeaderProps) => {
  const navigate = useNavigate();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else if (backPath) {
      navigate(backPath);
    } else {
      navigate(-1);
    }
  };

  return (
    <header className="h-14 bg-background border-b border-border px-4 flex items-center justify-between flex-shrink-0 sticky top-0 z-50">
      {/* Left Slot */}
      <div className="w-10 flex items-center justify-start">
        {leftSlot ? (
          leftSlot
        ) : showBack ? (
          <button
            onClick={handleBack}
            className="p-1.5 -ml-1.5 hover:bg-muted rounded-lg transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-foreground" />
          </button>
        ) : null}
      </div>

      {/* Center Slot */}
      <div className="flex-1 flex items-center justify-center min-w-0">
        {centerSlot ? (
          centerSlot
        ) : title ? (
          <h1 className="text-base font-semibold text-foreground truncate">
            {title}
          </h1>
        ) : null}
      </div>

      {/* Right Slot */}
      <div className="w-10 flex items-center justify-end">
        {rightSlot}
      </div>
    </header>
  );
};

export default PwaHeader;
