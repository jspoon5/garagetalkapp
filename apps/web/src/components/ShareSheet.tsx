import { useCallback, useEffect, useMemo, useState } from "react";
import { apiGet, apiSend } from "../api";

export type ShareObjectType = "live" | "video" | "profile" | "post";

type Suggestion = {
  id: string;
  username: string;
  avatarValue?: string | null;
};

const PUBLIC_ORIGIN = "https://garagetalk.app";

export function sharePublicUrl(objectType: ShareObjectType, objectId: string): string {
  return `${PUBLIC_ORIGIN}/s/${objectType}/${objectId}`;
}

export function ShareSheet({
  objectType,
  objectId,
  title,
  onClose,
  signedIn,
}: {
  objectType: ShareObjectType;
  objectId: string;
  title?: string;
  onClose: () => void;
  signedIn: boolean;
}) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const url = useMemo(() => sharePublicUrl(objectType, objectId), [objectType, objectId]);
  const shareTitle = title ?? "Check this out on GarageTalk";

  useEffect(() => {
    if (!signedIn) return;
    void apiGet<{ suggestions: Suggestion[] }>("/shares/suggestions")
      .then((data) => setSuggestions(data.suggestions ?? []))
      .catch(() => setSuggestions([]));
  }, [signedIn]);

  const toggle = useCallback((id: string) => {
    setSelected((current) =>
      current.includes(id) ? current.filter((row) => row !== id) : [...current, id],
    );
  }, []);

  async function recordShare(shareType: "internal_dm" | "copy_link" | "external", recipientUserIds?: string[]) {
    if (!signedIn) return;
    try {
      await apiSend("/shares", "POST", {
        objectType,
        objectId,
        shareType,
        recipientUserIds,
      });
    } catch {
      // Sharing still succeeds client-side even if telemetry fails.
    }
  }

  async function copyLink() {
    setBusy(true);
    try {
      await navigator.clipboard.writeText(url);
      await recordShare("copy_link");
      setNotice("Link copied.");
    } catch {
      setNotice(url);
    } finally {
      setBusy(false);
    }
  }

  async function nativeShare() {
    if (!navigator.share) {
      setNotice("Native share isn’t available here — copy the link instead.");
      return;
    }
    setBusy(true);
    try {
      await navigator.share({ title: shareTitle, text: shareTitle, url });
      await recordShare("external");
      setNotice("Shared.");
    } catch {
      // user cancelled
    } finally {
      setBusy(false);
    }
  }

  async function sendToFriends() {
    if (selected.length === 0) {
      setNotice("Pick at least one friend.");
      return;
    }
    setBusy(true);
    try {
      await recordShare("internal_dm", selected);
      setNotice(`Shared with ${selected.length} friend${selected.length === 1 ? "" : "s"}.`);
      setSelected([]);
    } finally {
      setBusy(false);
    }
  }

  const smsHref = `sms:?&body=${encodeURIComponent(`${shareTitle} ${url}`)}`;
  const mailtoHref = `mailto:?subject=${encodeURIComponent(shareTitle)}&body=${encodeURIComponent(url)}`;

  return (
    <div className="sheet-scrim" role="presentation" onClick={onClose}>
      <div className="sheet share-sheet" role="dialog" aria-label="Share" onClick={(e) => e.stopPropagation()}>
        <h2>Share</h2>
        <p className="empty-state">{shareTitle}</p>
        <code className="share-url">{url}</code>

        {signedIn && suggestions.length > 0 ? (
          <div className="share-friends">
            <span>Friends</span>
            <ul>
              {suggestions.map((friend) => (
                <li key={friend.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={selected.includes(friend.id)}
                      onChange={() => toggle(friend.id)}
                    />
                    {friend.username}
                  </label>
                </li>
              ))}
            </ul>
            <button type="button" className="sell-button" disabled={busy} onClick={() => void sendToFriends()}>
              Send to friends
            </button>
          </div>
        ) : null}

        <div className="profile-actions">
          <button type="button" disabled={busy} onClick={() => void copyLink()}>
            Copy link
          </button>
          <button type="button" disabled={busy} onClick={() => void nativeShare()}>
            Share…
          </button>
          <a className="sell-button" href={smsHref}>
            SMS
          </a>
          <a className="sell-button" href={mailtoHref}>
            Email
          </a>
        </div>
        {notice ? <p className="empty-state">{notice}</p> : null}
        <button type="button" className="sheet-close" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
