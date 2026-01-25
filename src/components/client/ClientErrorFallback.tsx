import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

interface ClientErrorFallbackProps {
  error: Error;
  reset: () => void;
}

/**
 * ClientErrorFallback displays a user-friendly error message
 * when something goes wrong in the client booking flow.
 */
export function ClientErrorFallback({ error, reset }: ClientErrorFallbackProps) {
  const { hotelId } = useParams<{ hotelId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation('common');

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-6">
      <div className="text-center space-y-6 max-w-sm">
        <div className="flex justify-center">
          <div className="bg-red-500/10 rounded-full p-4">
            <AlertTriangle className="h-12 w-12 text-red-400" />
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-xl font-serif text-white">
            {t('errors.title', 'Something went wrong')}
          </h1>
          <p className="text-white/60 text-sm">
            {t('errors.description', 'We encountered an unexpected error. Please try again.')}
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <Button
            onClick={reset}
            className="w-full h-12 bg-white text-black hover:bg-gold-50"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            {t('tryAgain', 'Try Again')}
          </Button>
          <Button
            variant="ghost"
            onClick={() => navigate(`/client/${hotelId}`)}
            className="text-white/60 hover:text-white hover:bg-white/5"
          >
            <Home className="mr-2 h-4 w-4" />
            {t('backToHome', 'Back to Home')}
          </Button>
        </div>

        {process.env.NODE_ENV === 'development' && (
          <details className="text-left mt-4">
            <summary className="text-white/40 text-xs cursor-pointer">
              Error details (dev only)
            </summary>
            <pre className="mt-2 text-[10px] text-red-400/70 overflow-auto max-h-32 bg-white/5 p-2 rounded">
              {error.message}
              {error.stack}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}
