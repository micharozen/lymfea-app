import PwaHeader from "./PwaHeader";

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
      
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="relative w-8 h-8">
            <div className="absolute inset-0 rounded-full border-2 border-muted" />
            <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-foreground animate-spin" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default PwaPageLoader;
