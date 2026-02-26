import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Mail } from 'lucide-react';
import { brand, brandLogos } from '@/config/brand';

export function DashboardFooter() {
  const { t } = useTranslation('client');

  return (
    <div className="mt-auto">
      {/* CTA Section */}
      <div className="bg-gradient-to-b from-white via-gold-50/30 to-gold-50/50 px-6 py-10 sm:py-14 text-center">
        <div className="max-w-md mx-auto">
          <p className="font-serif text-xl sm:text-2xl text-gray-900 mb-6 leading-relaxed">
            {t('enterpriseDashboard.footer.cta')}
          </p>
          <Button
            asChild
            className="h-12 px-8 text-sm font-medium tracking-wide uppercase bg-gold-400 text-black hover:bg-gold-300 transition-all duration-300"
          >
            <a href={`mailto:${brand.legal.contactEmail}`}>
              <Mail className="h-4 w-4 mr-2" />
              {t('enterpriseDashboard.footer.contact')}
            </a>
          </Button>
        </div>
      </div>

      {/* Powered by Lymfea */}
      <div className="bg-gray-900 px-6 py-6 flex items-center justify-center gap-2">
        <span className="text-[10px] uppercase tracking-[0.2em] text-gray-500 font-light">
          {t('enterpriseDashboard.footer.poweredBy')}
        </span>
        <img src={brandLogos.monogramWhiteClient} alt={brand.name} className="h-5 w-5 opacity-50" />
      </div>
    </div>
  );
}
