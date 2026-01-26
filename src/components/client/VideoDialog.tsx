import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface VideoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  videoId: string;
  hotelId: string;
}

export function VideoDialog({ open, onOpenChange, videoId, hotelId }: VideoDialogProps) {
  const navigate = useNavigate();
  const { t } = useTranslation('client');

  const handleBookSession = () => {
    onOpenChange(false);
    navigate(`/client/${hotelId}/treatments`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-sm w-[90vw] p-0 bg-black border-white/10 overflow-hidden rounded-sm [&>button]:text-white/60 [&>button]:hover:text-white"
      >
        <DialogTitle className="sr-only">How it works</DialogTitle>
        {/* Aspect ratio 9:16 pour YouTube Shorts (vertical) */}
        <div className="aspect-[9/16] w-full">
          <iframe
            src={`https://www.youtube.com/embed/${videoId}`}
            title="How it works"
            className="w-full h-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
        <div className="p-4">
          <Button
            onClick={handleBookSession}
            className="w-full bg-white text-black hover:bg-gold-50 font-medium tracking-widest text-xs rounded-none"
          >
            {t('welcome.bookSession')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
