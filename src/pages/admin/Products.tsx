import { useTranslation } from 'react-i18next';
import { brand } from '@/config/brand';

export default function Products() {
  const { t } = useTranslation(['admin', 'common']);

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-4 md:mb-6">
          <h1 className="text-lg font-medium text-foreground mb-4 md:mb-8 flex items-center gap-2">
            {t('productsPage.title', { brand: brand.name })}
          </h1>
        </div>
        <div className="bg-card p-4 md:p-8 rounded-lg border border-border">
          <p className="text-card-foreground">{t('productsPage.underDevelopment')}</p>
        </div>
      </div>
    </div>
  );
}
