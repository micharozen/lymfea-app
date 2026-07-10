/**
 * Opt-out landing page for the checkout reminder emails (`?token=<opt-out token>`).
 *
 * The confirmation button is deliberate, not a formality: mailbox security
 * scanners pre-fetch every link in an email, and a page that unsubscribed on
 * load would silently opt out guests who never clicked. The one-click path
 * mandated by Gmail/Yahoo lives in the `unsubscribe-email` edge function, which
 * only acts on POST.
 */
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';

type Status = 'asking' | 'saving' | 'done' | 'error';

export default function Unsubscribe() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  // Set when the guest arrives from a reminder that carried a live cart.
  const resumeUrl = searchParams.get('resume');
  const { t } = useTranslation('common');
  const [status, setStatus] = useState<Status>('asking');

  const confirm = async () => {
    if (!token) {
      setStatus('error');
      return;
    }
    setStatus('saving');

    // An unknown token resolves to `false`, not an error. We show the same
    // confirmation either way — the page must never reveal whether an address
    // is known to us.
    const { error } = await supabase.rpc('unsubscribe_email', { _token: token });
    setStatus(error ? 'error' : 'done');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 py-16 text-foreground">
      <div className="w-full max-w-md text-center">
        {status === 'done' ? (
          <>
            <h1 className="font-serif text-3xl">{t('unsubscribe.done.title')}</h1>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              {t('unsubscribe.done.body')}
            </p>
          </>
        ) : (
          <>
            <h1 className="font-serif text-3xl">{t('unsubscribe.ask.title')}</h1>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              {t('unsubscribe.ask.body')}
            </p>

            <div className="mt-10 flex flex-col items-center gap-4">
              <Button
                onClick={confirm}
                disabled={status === 'saving' || !token}
                className="w-full tracking-widest"
              >
                {t(status === 'saving' ? 'unsubscribe.ask.saving' : 'unsubscribe.ask.confirm')}
              </Button>

              {resumeUrl && (
                <a
                  href={resumeUrl}
                  className="text-xs text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
                >
                  {t('unsubscribe.ask.stay')}
                </a>
              )}
            </div>

            {(status === 'error' || !token) && (
              <p className="mt-6 text-xs text-destructive">{t('unsubscribe.error')}</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
