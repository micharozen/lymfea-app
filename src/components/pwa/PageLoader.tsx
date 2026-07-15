import PwaHeader from "./Header";
import { AppLoader } from "@/components/AppLoader";

interface PwaPageLoaderProps {
  title?: string;
  showBack?: boolean;
  backPath?: string;
}

const PwaPageLoader = ({ title, showBack, backPath }: PwaPageLoaderProps) => {
  return (
    <div className="h-full flex flex-col bg-background">
      {title && (
        <PwaHeader
          title={title}
          showBack={showBack}
          backPath={backPath}
        />
      )}
      
      <AppLoader fullScreen={false} className="flex-1" />
    </div>
  );
};

export default PwaPageLoader;
