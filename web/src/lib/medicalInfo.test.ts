import alarmSrc from "./alarm.ts?raw";
import cardSrc from "../EmergencyCard.tsx?raw";
import infoSrc from "./medicalInfo.ts?raw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { countPress } from "./grace";
import {
  ABOUT_PRESETS,
  CALL_911,
  EMPTY_INFO,
  cleanPhone,
  deleteMedicalInfo,
  hasAnyInfo,
  loadAboutMe,
  loadMedicalInfo,
  saveAboutMe,
  saveMedicalInfo,
  smsBody,
  smsLink,
  telLink,
} from "./medicalInfo";

function fakeStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    keys: () => [...m.keys()],
  };
}
afterEach(() => vi.unstubAllGlobals());

const info = {
  callMe: "Sam",
  conditions: "Epilepsy",
  meds: "Levetiracetam. Allergic to penicillin.",
  contactName: "Alex",
  contactPhone: "(801) 555-0134",
  bracelet: true,
};

describe("medical info storage", () => {
  it("starts empty and round-trips on this phone", () => {
    vi.stubGlobal("localStorage", fakeStorage());
    expect(loadMedicalInfo()).toEqual(EMPTY_INFO);
    expect(hasAnyInfo(EMPTY_INFO)).toBe(false);
    saveMedicalInfo(info);
    expect(loadMedicalInfo()).toEqual(info);
    expect(hasAnyInfo(info)).toBe(true);
  });

  it("delete removes the info and the about-me card", () => {
    const s = fakeStorage();
    vi.stubGlobal("localStorage", s);
    saveMedicalInfo(info);
    saveAboutMe({ pick: "custom", custom: "Please be patient with me." });
    expect(s.keys().length).toBe(2);
    deleteMedicalInfo();
    expect(s.keys()).toEqual([]);
    expect(loadMedicalInfo()).toEqual(EMPTY_INFO);
    expect(loadAboutMe()).toEqual({ pick: null, custom: "" });
  });

  it("keeps a damaged or wrong-shaped value from breaking anything", () => {
    const s = fakeStorage();
    s.setItem("grace-medical-v1", "{not json");
    vi.stubGlobal("localStorage", s);
    expect(loadMedicalInfo()).toEqual(EMPTY_INFO);
    s.setItem(
      "grace-medical-v1",
      JSON.stringify({ callMe: 5, bracelet: "yes", conditions: "ok" }),
    );
    expect(loadMedicalInfo()).toEqual({ ...EMPTY_INFO, conditions: "ok" });
  });

  it("never throws, and never logs the values, when storage is blocked", () => {
    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    vi.stubGlobal("localStorage", blocked);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(loadMedicalInfo()).toEqual(EMPTY_INFO);
    expect(() => saveMedicalInfo(info)).not.toThrow();
    expect(() => deleteMedicalInfo()).not.toThrow();
    for (const call of warn.mock.calls)
      expect(JSON.stringify(call)).not.toMatch(/Sam|Epilepsy|555/);
    warn.mockRestore();
  });

  it("stores only in localStorage: no network, location, history or telemetry in the code", () => {
    const sources: [string, string][] = [
      ["medicalInfo.ts", infoSrc],
      ["EmergencyCard.tsx", cardSrc],
      ["alarm.ts", alarmSrc],
    ];
    for (const [f, src] of sources) {
      expect(src, f).not.toMatch(
        /\bfetch\(|sendBeacon|XMLHttpRequest|WebSocket|telemetry|@dash0\/|location\.|history\.|sessionStorage|document\.cookie/i,
      );
    }
  });
});

describe("links", () => {
  it("calls 911 with a plain tel link", () => {
    expect(CALL_911).toBe("tel:911");
  });

  it("cleans a phone number to digits and an optional leading plus", () => {
    expect(cleanPhone("(801) 555-0134")).toBe("8015550134");
    expect(cleanPhone("+1 801-555-0134")).toBe("+18015550134");
    expect(cleanPhone("  ")).toBeNull();
    expect(cleanPhone("12")).toBeNull();
    expect(cleanPhone("1234567890123456")).toBeNull();
    expect(cleanPhone("8015550134;abc&x=1")).toBeNull();
    expect(cleanPhone("801 555 0134 ext 12")).toBeNull();
    expect(cleanPhone("801-555-0134 x12")).toBeNull();
    expect(cleanPhone("+1 (801) 555.0134")).toBe("+18015550134");
  });

  it("builds tel and sms links from the person's own contact number only", () => {
    expect(telLink("(801) 555-0134")).toBe("tel:8015550134");
    expect(telLink("")).toBeNull();
    const link = smsLink("(801) 555-0134", "Sam")!;
    expect(link.startsWith("sms:8015550134?&body=")).toBe(true);
    expect(decodeURIComponent(link.split("body=")[1])).toBe(
      "This is Sam. I need help at KubeCon, Salt Palace. Please call me.",
    );
    expect(smsLink("", "Sam")).toBeNull();
  });

  it("encodes a name with odd characters so it cannot change the link", () => {
    const link = smsLink("8015550134", "Sam & Co?#=")!;
    expect(link.split("body=").length).toBe(2);
    expect(link).not.toMatch(/#/);
    expect(decodeURIComponent(link.split("body=")[1])).toContain("Sam & Co?#=");
  });

  it("leaves out the name sentence when there is no name", () => {
    expect(smsBody("  ")).toBe(
      "I need help at KubeCon, Salt Palace. Please call me.",
    );
  });
});

describe("about me cards", () => {
  it("offers short, plain presets including Tourette syndrome", () => {
    expect(ABOUT_PRESETS.map((p) => p.id)).toContain("tourette");
    expect(ABOUT_PRESETS.find((p) => p.id === "tourette")!.text).toBe(
      "I have Tourette syndrome. My tics are involuntary. I'm OK and don't need help.",
    );
    for (const p of ABOUT_PRESETS) expect(p.text.length).toBeLessThan(120);
  });

  it("remembers the pick and the person's own words, locally", () => {
    vi.stubGlobal("localStorage", fakeStorage());
    saveAboutMe({ pick: "tourette", custom: "I use a communication app." });
    expect(loadAboutMe()).toEqual({
      pick: "tourette",
      custom: "I use a communication app.",
    });
  });

  it("forgets a pick that is not a real card", () => {
    const s = fakeStorage();
    s.setItem(
      "grace-aboutme-v1",
      JSON.stringify({ pick: "nope", custom: "x" }),
    );
    vi.stubGlobal("localStorage", s);
    expect(loadAboutMe()).toEqual({ pick: null, custom: "x" });
  });
});

describe("the press count", () => {
  it("still sends exactly scheduled_floor and mode, and none of the saved info", async () => {
    vi.stubGlobal("localStorage", fakeStorage());
    saveMedicalInfo(info);
    const sendBeacon = vi.fn<(url: string, body: Blob) => boolean>(() => true);
    vi.stubGlobal("navigator", { sendBeacon });
    countPress("live", [], new Date("2026-11-10T15:25:00-07:00"));
    const text = await sendBeacon.mock.calls[0][1].text();
    expect(Object.keys(JSON.parse(text)).sort()).toEqual([
      "mode",
      "scheduled_floor",
    ]);
    expect(text).not.toMatch(/Sam|Epilepsy|555|Alex/);
  });
});
