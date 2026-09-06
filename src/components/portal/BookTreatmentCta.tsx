import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Sparkles } from 'lucide-react';
import type { PortalVenue } from '@/hooks/portal/usePortalData';

interface BookTreatmentCtaProps {
  venues: PortalVenue[];
}

/**
 * Renvoie le client vers le parcours de réservation du lieu.
 * Un seul lieu → redirection directe ; plusieurs → feuille de choix.
 * La session Supabase n'est pas touchée : le parcours client la conserve et
 * l'étape « Vos informations » se pré-remplit toute seule.
 */
export function BookTreatmentCta({ venues }: BookTreatmentCtaProps) {
  const { t } = useTranslation('client');
  const navigate = useNavigate();
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  if (venues.length === 0) return null;

  const goToVenue = (venue: PortalVenue) => navigate(`/client/${venue.slug}/treatments`);

  const handleClick = () => {
    if (venues.length === 1) {
      goToVenue(venues[0]);
      return;
    }
    setIsPickerOpen(true);
  };

  return (
    <>
      <div style={{ margin: '0 16px' }}>
        <button type="button" className="btn-primary-lg" onClick={handleClick}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Sparkles size={17} />
            {t('portal.bookTreatment')}
          </span>
        </button>
        {venues.length === 1 && (
          <p style={{ fontSize: 12, color: 'var(--ink-mute)', textAlign: 'center', marginTop: 8 }}>
            {venues[0].name}
          </p>
        )}
      </div>

      {isPickerOpen && (
        <div
          className="sheet-veil"
          onClick={() => setIsPickerOpen(false)}
          role="presentation"
        >
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h3>{t('portal.chooseVenueTitle')}</h3>
            <p>{t('portal.chooseVenueSubtitle')}</p>
            <div className="info-list" style={{ margin: 0 }}>
              {venues.map((venue) => (
                <button
                  key={venue.id}
                  type="button"
                  className="info-row"
                  onClick={() => goToVenue(venue)}
                >
                  <span className="val">{venue.name}</span>
                  <ChevronRight size={16} style={{ color: 'var(--ink-mute)' }} />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
