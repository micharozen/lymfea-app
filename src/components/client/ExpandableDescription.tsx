import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ExpandableDescriptionProps {
  text: string;
  clampLines?: number;
  className?: string;
}

export function ExpandableDescription({
  text,
  clampLines = 3,
  className,
}: ExpandableDescriptionProps) {
  const { t } = useTranslation('client');
  const paragraphRef = useRef<HTMLParagraphElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  useLayoutEffect(() => {
    const el = paragraphRef.current;
    if (!el) return;
    const measure = () => {
      const overflowing = el.scrollHeight - el.clientHeight > 1;
      setIsOverflowing(overflowing);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [text, clampLines]);

  useEffect(() => {
    if (!isOverflowing) setIsExpanded(false);
  }, [isOverflowing]);

  const clampClass =
    clampLines === 1 ? 'line-clamp-1'
    : clampLines === 2 ? 'line-clamp-2'
    : clampLines === 3 ? 'line-clamp-3'
    : clampLines === 4 ? 'line-clamp-4'
    : 'line-clamp-3';

  return (
    <div className={cn('flex items-end gap-1.5', className)}>
      <p
        ref={paragraphRef}
        className={cn(
          'text-xs text-gray-400 leading-relaxed font-light flex-1',
          !isExpanded && clampClass,
        )}
      >
        {text}
      </p>
      {isOverflowing && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsExpanded((v) => !v);
          }}
          aria-label={isExpanded ? t('menu.readLess', 'Voir moins') : t('menu.readMore', 'Voir plus')}
          aria-expanded={isExpanded}
          className="shrink-0 p-0.5 -m-0.5 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <ChevronDown
            className={cn(
              'h-4 w-4 transition-transform duration-200',
              isExpanded && 'rotate-180',
            )}
          />
        </button>
      )}
    </div>
  );
}
