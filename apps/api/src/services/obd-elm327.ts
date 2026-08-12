export const elm327InitCommands = ["ATZ", "ATE0", "ATSP0"] as const;
export const dtcModeCommands = { stored: "03", pending: "07" } as const;
export const livePidCommands = {
  rpm: "010C",
  coolantC: "0105",
  mafGps: "0110",
  shortFuelTrim1Pct: "0106",
  longFuelTrim1Pct: "0107",
} as const;

const dtcTypes = ["P", "C", "B", "U"] as const;

function bytes(transcript: string) {
  return transcript
    .replace(/SEARCHING\.\.\./gi, "")
    .replace(/[>\r\n]/g, " ")
    .split(/\s+/)
    .filter((part) => /^[0-9a-f]{2}$/i.test(part))
    .map((part) => Number.parseInt(part, 16));
}

export function parseElm327Dtcs(transcript: string, mode: "03" | "07" = "03") {
  const data = bytes(transcript);
  const requested = mode === "03" ? 0x43 : 0x47;
  const header = data.includes(requested) ? requested : data.includes(0x47) ? 0x47 : 0x43;
  const start = data.indexOf(header);
  const payload = start >= 0 ? data.slice(start + 1) : data;
  const codes: string[] = [];
  for (let i = 0; i + 1 < payload.length; i += 2) {
    const a = payload[i]!;
    const b = payload[i + 1]!;
    if (a === 0 && b === 0) continue;
    codes.push(`${dtcTypes[(a & 0xc0) >> 6]}${(a & 0x3f).toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`.toUpperCase());
  }
  return codes;
}

export function parseElm327LivePid(transcript: string) {
  const data = bytes(transcript);
  const out: Record<string, number> = {};
  for (let i = 0; i + 2 < data.length; i++) {
    if (data[i] !== 0x41) continue;
    const pid = data[i + 1]!;
    const a = data[i + 2]!;
    const b = data[i + 3] ?? 0;
    if (pid === 0x0c) out.rpm = ((a * 256 + b) / 4);
    if (pid === 0x05) out.coolantC = a - 40;
    if (pid === 0x10) out.mafGps = (a * 256 + b) / 100;
    if (pid === 0x06) out.shortFuelTrim1Pct = ((a - 128) * 100) / 128;
    if (pid === 0x07) out.longFuelTrim1Pct = ((a - 128) * 100) / 128;
  }
  return out;
}

export function webBluetoothSupport(nav: { bluetooth?: unknown; userAgent?: string } | undefined) {
  const ua = nav?.userAgent ?? "";
  const ios = /\b(iPad|iPhone|iPod)\b/.test(ua) || (/\bMacintosh\b/.test(ua) && /\bMobile\//.test(ua));
  return {
    supported: Boolean(nav?.bluetooth) && !ios,
    fallback: ios ? "ios-web-bluetooth-unavailable" : "unsupported-browser",
  };
}
