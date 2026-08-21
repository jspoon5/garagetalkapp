import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function isIosDevice() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/i.test(ua)) return true;
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

function isAndroidDevice() {
  if (typeof navigator === "undefined") return false;
  return /Android/i.test(navigator.userAgent);
}

export function AndroidInstallPrompt() {
  const { t } = useTranslation();
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    function onPrompt(event: Event) {
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
    }
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  async function install() {
    if (!promptEvent) return;
    await promptEvent.prompt();
    await promptEvent.userChoice;
    setPromptEvent(null);
  }

  return (
    <section className="pwa-card">
      <h2>{t("pwa.androidTitle")}</h2>
      <p>{promptEvent ? t("pwa.androidBody") : t("pwa.androidUnavailable")}</p>
      {promptEvent ? (
        <button type="button" onClick={() => void install()}>
          {t("pwa.androidInstall")}
        </button>
      ) : null}
    </section>
  );
}

export function IosAddToHomeScreenInstructions() {
  const { t } = useTranslation();
  return (
    <section className="pwa-card">
      <h2>{t("pwa.iosTitle")}</h2>
      <p>{t("pwa.iosSteps")}</p>
    </section>
  );
}

/** Shows only the install path that matches this device. */
export function PlatformInstallGuidance() {
  if (isIosDevice()) return <IosAddToHomeScreenInstructions />;
  if (isAndroidDevice()) return <AndroidInstallPrompt />;
  // Desktop / unknown: prefer install prompt when available, otherwise nothing noisy.
  return <AndroidInstallPrompt />;
}
