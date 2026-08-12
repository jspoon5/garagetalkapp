import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { Globe, Check } from 'lucide-react';
import { languages, globalLanguages, nigerianLanguages, kenyanLanguages, southAfricanLanguages } from '@/lib/i18n';
import { setUserLanguagePreference } from '@/hooks/useLanguageDetection';

export function LanguageSelector() {
  const { i18n, t } = useTranslation();

  const currentLanguage = languages.find((lang) => lang.code === i18n.language) || languages[0];

  const changeLanguage = (code: string) => {
    setUserLanguagePreference(code);
    i18n.changeLanguage(code);
  };

  const renderLanguageItem = (lang: typeof languages[0]) => (
    <DropdownMenuItem
      key={lang.code}
      onClick={() => changeLanguage(lang.code)}
      className={lang.code === currentLanguage.code ? 'bg-accent' : ''}
      data-testid={`menu-language-${lang.code}`}
    >
      {lang.code === currentLanguage.code && (
        <Check className="h-4 w-4 mr-2" />
      )}
      <span className={lang.code !== currentLanguage.code ? 'ml-6' : ''}>{lang.name}</span>
    </DropdownMenuItem>
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" data-testid="button-language-selector">
          <span>Translate</span>
          <Globe className="h-4 w-4" />
          <span>{t('common.language')}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
        {globalLanguages.map(renderLanguageItem)}
        
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
          🇳🇬 Nigerian Languages
        </DropdownMenuLabel>
        {nigerianLanguages.map(renderLanguageItem)}
        
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
          🇰🇪 Kenyan Languages
        </DropdownMenuLabel>
        {kenyanLanguages.map(renderLanguageItem)}
        
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
          🇿🇦 South African Languages
        </DropdownMenuLabel>
        {southAfricanLanguages.map(renderLanguageItem)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
