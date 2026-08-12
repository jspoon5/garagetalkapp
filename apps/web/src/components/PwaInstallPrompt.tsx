import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

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
    <section className="rounded-xl bg-slate-900/80 p-5">
      <h2 className="text-lg font-semibold">{t("pwa.androidTitle")}</h2>
      <p className="mt-2 text-sm text-slate-300">
        {promptEvent ? t("pwa.androidBody") : t("pwa.androidUnavailable")}
      </p>
      {promptEvent ? (
        <button
          type="button"
          className="mt-3 rounded bg-amber-500 px-4 py-2 font-medium text-slate-950"
          onClick={() => void install()}
        >
          {t("pwa.androidInstall")}
        </button>
      ) : null}
    </section>
  );
}

export function IosAddToHomeScreenInstructions() {
  const { t } = useTranslation();
  return (
    <section className="rounded-xl bg-slate-900/80 p-5">
      <h2 className="text-lg font-semibold">{t("pwa.iosTitle")}</h2>
      <p className="mt-2 text-sm text-slate-300">{t("pwa.iosSteps")}</p>
    </section>
  );
}
