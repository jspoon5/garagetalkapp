import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

const IP_LANGUAGE_DETECTED_KEY = 'garagetalk_ip_language_detected';
const USER_LANGUAGE_PREFERENCE_KEY = 'garagetalk_user_language_choice';

export function useLanguageDetection() {
  const { i18n } = useTranslation();

  useEffect(() => {
    const detectLanguageFromIP = async () => {
      // If user has manually selected a language, respect their choice
      const userManualChoice = localStorage.getItem(USER_LANGUAGE_PREFERENCE_KEY);
      if (userManualChoice) {
        console.log(`[Language] User has manually selected: ${userManualChoice}, skipping IP detection`);
        return;
      }

      // Check if we've already done IP detection for this session
      const hasIPDetected = localStorage.getItem(IP_LANGUAGE_DETECTED_KEY);
      if (hasIPDetected) {
        console.log('[Language] IP detection already performed');
        return;
      }

      try {
        console.log('[Language] Detecting language from IP address...');
        const response = await fetch('/api/detect-language');
        if (response.ok) {
          const data = await response.json();
          
          if (data.detected && data.language) {
            const supportedLngs = i18n.options.supportedLngs;
            if (Array.isArray(supportedLngs) && supportedLngs.includes(data.language)) {
              // Change to the detected language
              await i18n.changeLanguage(data.language);
              // Store in localStorage so i18n remembers it
              localStorage.setItem('i18nextLng', data.language);
              console.log(`[Language] Auto-detected from IP: ${data.language} (Country: ${data.countryCode})`);
            } else {
              console.log(`[Language] Detected ${data.language} but not supported, using default`);
            }
          } else {
            console.log('[Language] No country detected from IP, using browser/system language');
          }
          
          // Mark IP detection as complete
          localStorage.setItem(IP_LANGUAGE_DETECTED_KEY, 'true');
        }
      } catch (error) {
        console.warn('[Language] Failed to detect language from IP:', error);
        // Still mark as attempted to prevent repeated API calls
        localStorage.setItem(IP_LANGUAGE_DETECTED_KEY, 'true');
      }
    };

    detectLanguageFromIP();
  }, [i18n]);
}

// Call this when user manually selects a language in the UI
export function setUserLanguagePreference(languageCode: string) {
  localStorage.setItem(USER_LANGUAGE_PREFERENCE_KEY, languageCode);
  localStorage.setItem('i18nextLng', languageCode);
}

// Call this to reset detection (useful for testing or when user wants to re-detect)
export function resetLanguageDetection() {
  localStorage.removeItem(IP_LANGUAGE_DETECTED_KEY);
  localStorage.removeItem(USER_LANGUAGE_PREFERENCE_KEY);
  localStorage.removeItem('i18nextLng');
}
