// What a person chooses to put on their emergency card and "about me" cards.
// It lives in this phone's localStorage and nowhere else: it is never sent, never
// put in a URL, and never handed to any analytics. Nothing here logs a value.

export interface MedicalInfo {
  callMe: string;
  conditions: string;
  meds: string;
  contactName: string;
  contactPhone: string;
  bracelet: boolean;
}

export const EMPTY_INFO: MedicalInfo = {
  callMe: "",
  conditions: "",
  meds: "",
  contactName: "",
  contactPhone: "",
  bracelet: false,
};

const INFO_KEY = "grace-medical-v1";
const ABOUT_KEY = "grace-aboutme-v1";
const SHORT = 120;
const LONG = 600;

const text = (v: unknown, max: number): string =>
  typeof v === "string" ? v.slice(0, max) : "";

export function loadMedicalInfo(): MedicalInfo {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(INFO_KEY) ?? "null");
    if (!raw || typeof raw !== "object") return { ...EMPTY_INFO };
    const r = raw as Record<string, unknown>;
    return {
      callMe: text(r.callMe, SHORT),
      conditions: text(r.conditions, LONG),
      meds: text(r.meds, LONG),
      contactName: text(r.contactName, SHORT),
      contactPhone: text(r.contactPhone, 40),
      bracelet: r.bracelet === true,
    };
  } catch {
    return { ...EMPTY_INFO };
  }
}

export function saveMedicalInfo(info: MedicalInfo): void {
  try {
    localStorage.setItem(INFO_KEY, JSON.stringify(info));
  } catch {
    console.warn("Medical info could not be saved on this phone");
  }
}

export const hasAnyInfo = (i: MedicalInfo): boolean =>
  Boolean(
    i.callMe.trim() ||
    i.conditions.trim() ||
    i.meds.trim() ||
    i.contactName.trim() ||
    i.contactPhone.trim() ||
    i.bracelet,
  );

// ---- links ---------------------------------------------------------------------

export const CALL_911 = "tel:911";

// Digits, with one leading plus kept. Anything else makes it invalid, so a number
// can never carry extra link syntax. Real numbers are 7 to 15 digits.
export function cleanPhone(raw: string): string | null {
  const t = raw.trim();
  // Only digits, spaces and ( ) . - are allowed, with one leading plus. Letters
  // (such as "ext 12") are rejected rather than having their digits joined on.
  if (!/^\+?[\d\s().-]*$/.test(t)) return null;
  const digits = t.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  return (t.startsWith("+") ? "+" : "") + digits;
}

export const telLink = (phone: string): string | null => {
  const p = cleanPhone(phone);
  return p ? `tel:${p}` : null;
};

export const smsBody = (name: string): string => {
  const n = name.trim();
  return `${n ? `This is ${n}. ` : ""}I need help at KubeCon, Salt Palace. Please call me.`;
};

// "?&body=" is the form both iPhone and Android open with the text filled in.
export const smsLink = (phone: string, name: string): string | null => {
  const p = cleanPhone(phone);
  return p ? `sms:${p}?&body=${encodeURIComponent(smsBody(name))}` : null;
};

// ---- about me cards (not an emergency) -------------------------------------------

export interface AboutPreset {
  id: string;
  label: string;
  text: string;
}

export const ABOUT_PRESETS: readonly AboutPreset[] = [
  {
    id: "tourette",
    label: "Tourette syndrome",
    text: "I have Tourette syndrome. My tics are involuntary. I'm OK and don't need help.",
  },
  {
    id: "no-talk",
    label: "I can't talk right now",
    text: "I can't talk right now. I'm OK, and I'm not ignoring you.",
  },
  {
    id: "moment",
    label: "Give me a moment",
    text: "Please give me a moment. I'm OK and don't need help.",
  },
];

export interface AboutMe {
  // A preset id, "custom" for the person's own words, or null for no card.
  pick: string | null;
  custom: string;
}

export function loadAboutMe(): AboutMe {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(ABOUT_KEY) ?? "null");
    if (!raw || typeof raw !== "object") return { pick: null, custom: "" };
    const r = raw as Record<string, unknown>;
    const ok =
      r.pick === "custom" || ABOUT_PRESETS.some((p) => p.id === r.pick);
    return {
      pick: ok ? (r.pick as string) : null,
      custom: text(r.custom, LONG),
    };
  } catch {
    return { pick: null, custom: "" };
  }
}

export function saveAboutMe(a: AboutMe): void {
  try {
    localStorage.setItem(ABOUT_KEY, JSON.stringify(a));
  } catch {
    console.warn("About-me card could not be saved on this phone");
  }
}

// One button deletes everything this module keeps.
export function deleteMedicalInfo(): void {
  for (const key of [INFO_KEY, ABOUT_KEY]) {
    try {
      localStorage.removeItem(key);
    } catch {
      console.warn("Saved info could not be deleted");
    }
  }
}
