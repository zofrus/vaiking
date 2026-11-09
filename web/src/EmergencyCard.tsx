import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { venueFacts, VENUE_SOURCE_LINE } from "./data/facilities";
import { SEIZURE_BLOCKS, SEIZURE_SOURCE_LINE } from "./data/seizureFirstAid";
import { createAlarm } from "./lib/alarm";
import "./emergency.css";
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
  smsLink,
  telLink,
  type AboutMe,
  type MedicalInfo,
} from "./lib/medicalInfo";

// Colours are fixed on purpose, not taken from the page's theme: the card must
// read the same in the calm theme, Focus mode and dark mode. White on #B00020 is
// about 7:1; black on white is 21:1.
const RED = "#B00020";
const focusRing =
  "focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-black";
const big = `flex min-h-14 w-full items-center justify-center rounded-xl px-5 py-3 text-center text-2xl font-bold no-underline ${focusRing}`;
const solid = `${big} bg-[#B00020] text-white`;
const outline = `${big} border-4 border-black bg-white text-black`;
const field = `block w-full rounded-lg border-2 border-black bg-white px-3 py-2 text-xl text-black ${focusRing}`;

const sectionHead = "text-2xl font-bold";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 border-t-4 border-black pt-5">
      <h3 className={sectionHead}>{title}</h3>
      {children}
    </section>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xl font-bold">{label}</dt>
      <dd className="whitespace-pre-wrap text-2xl">{children}</dd>
    </div>
  );
}

// The "Medical help" button and the full-screen card it opens. It is a native
// <dialog> opened with showModal(): the page behind goes inert, Escape closes it
// and focus returns to this button. Nothing here calls, texts or sends anything:
// the links open the phone's own dialer and messages app, and only when tapped.
export function EmergencyButton() {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [info, setInfo] = useState<MedicalInfo>(loadMedicalInfo);
  const [about, setAbout] = useState<AboutMe>(loadAboutMe);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [alarm] = useState(createAlarm);
  const [ringing, setRinging] = useState(false);
  const [alarmFailed, setAlarmFailed] = useState(false);

  useEffect(() => () => alarm.stop(), [alarm]);

  const open = () => {
    setInfo(loadMedicalInfo());
    setAbout(loadAboutMe());
    setDeleted(false);
    dialog.current?.showModal();
    heading.current?.focus();
  };
  const closed = () => {
    alarm.stop();
    setRinging(false);
    setAlarmFailed(false);
    setEditing(false);
    setConfirmDelete(false);
  };

  const change = (patch: Partial<MedicalInfo>) => {
    const next = { ...info, ...patch };
    setInfo(next);
    saveMedicalInfo(next);
    setDeleted(false);
  };
  const changeAbout = (patch: Partial<AboutMe>) => {
    const next = { ...about, ...patch };
    setAbout(next);
    saveAboutMe(next);
    setDeleted(false);
  };
  const wipe = () => {
    deleteMedicalInfo();
    setInfo({ ...EMPTY_INFO });
    setAbout({ pick: null, custom: "" });
    setConfirmDelete(false);
    setDeleted(true);
  };
  const toggleAlarm = async () => {
    if (ringing) {
      alarm.stop();
      setRinging(false);
      return;
    }
    const ok = await alarm.start();
    setRinging(ok);
    setAlarmFailed(!ok);
  };

  const sms = smsLink(info.contactPhone, info.callMe);
  const callContact = telLink(info.contactPhone);
  const aid = venueFacts.find((f) => f.id === "first-aid");
  const aboutText =
    about.pick === "custom"
      ? about.custom.trim()
      : (ABOUT_PRESETS.find((p) => p.id === about.pick)?.text ?? "");
  const contactLabel = info.contactName.trim() || "my contact";

  return (
    <>
      <button
        type="button"
        onClick={open}
        className={`inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-[#B00020] bg-white px-5 py-3 text-lg font-bold text-[#B00020] ${focusRing}`}
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9.5" />
          <path d="M12 7.5v9M7.5 12h9" />
        </svg>
        Medical help
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={`${id}-h`}
        onClose={closed}
        onKeyDown={(e) => {
          // Escape closes only this card, not the staff card underneath it.
          if (e.key === "Escape") e.stopPropagation();
        }}
        className="emergency-dialog m-0 h-[100dvh] max-h-none w-full max-w-none border-0 bg-white p-0 text-black backdrop:bg-black/80 open:flex open:flex-col"
      >
        <header
          className="shrink-0 px-5 py-5 text-white"
          style={{ backgroundColor: RED }}
        >
          <h2
            id={`${id}-h`}
            ref={heading}
            tabIndex={-1}
            className="text-3xl font-bold leading-tight outline-none"
          >
            I need medical help. I may not be able to speak.
          </h2>
        </header>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <div className="space-y-3">
            <a href={CALL_911} className={solid}>
              Call 911
            </a>
            {sms && (
              <a href={sms} className={outline}>
                Text {contactLabel}
              </a>
            )}
            {callContact && (
              <a href={callContact} className={outline}>
                Call {contactLabel}
              </a>
            )}
            <button
              type="button"
              onClick={() => void toggleAlarm()}
              className={outline}
            >
              {ringing ? "Stop sound alert" : "Sound alert (loud)"}
            </button>
            <p role="status" className="text-xl font-semibold">
              {ringing
                ? "The sound alert is on."
                : alarmFailed
                  ? "Sound could not start on this phone."
                  : ""}
            </p>
            <p className="text-xl font-semibold">
              This app does not call or text anyone by itself.
            </p>
          </div>

          {hasAnyInfo(info) ? (
            <Section title="About me">
              <dl className="space-y-3">
                {info.callMe.trim() && (
                  <Fact label="Call me">{info.callMe}</Fact>
                )}
                {info.conditions.trim() && (
                  <Fact label="Conditions">{info.conditions}</Fact>
                )}
                {info.meds.trim() && (
                  <Fact label="Medications and allergies">{info.meds}</Fact>
                )}
                {(info.contactName.trim() || info.contactPhone.trim()) && (
                  <Fact label="Emergency contact">
                    {[info.contactName.trim(), info.contactPhone.trim()]
                      .filter(Boolean)
                      .join(", ")}
                  </Fact>
                )}
              </dl>
              {info.bracelet && (
                <p className="text-2xl font-bold">
                  Please check my medical ID bracelet.
                </p>
              )}
            </Section>
          ) : (
            <p className="text-xl">
              No personal info is saved. You can add yours ahead of time under
              Edit my info. It stays on this phone.
            </p>
          )}

          {aid && (
            <Section title="First aid at the venue">
              <p className="text-2xl">{aid.text}</p>
              <p className="text-base">{VENUE_SOURCE_LINE}</p>
            </Section>
          )}

          <Section title="If someone is having a seizure">
            <p className="text-xl">
              For the person helping. Quoted from the CDC page "First Aid for
              Seizures".
            </p>
            {SEIZURE_BLOCKS.map((b) => (
              <div key={b.heading}>
                <h4 className="text-2xl font-bold">{b.heading}</h4>
                <ul className="mt-2 list-disc space-y-2 pl-7 text-2xl">
                  {b.items.map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
              </div>
            ))}
            <p className="text-base">{SEIZURE_SOURCE_LINE}</p>
          </Section>

          <Section title="Not an emergency? Show a card">
            <fieldset className="space-y-2">
              <legend className="text-xl font-semibold">
                Pick one to show someone
              </legend>
              {[
                { id: null, label: "No card" },
                ...ABOUT_PRESETS,
                { id: "custom", label: "Write my own" },
              ].map((o) => (
                <label
                  key={o.id ?? "none"}
                  className="flex min-h-11 items-center gap-3 text-xl"
                >
                  <input
                    type="radio"
                    name={`${id}-about`}
                    checked={about.pick === o.id}
                    onChange={() => changeAbout({ pick: o.id })}
                    className="size-6 shrink-0 accent-black"
                  />
                  {o.label}
                </label>
              ))}
            </fieldset>
            {about.pick === "custom" && (
              <div>
                <label
                  htmlFor={`${id}-custom`}
                  className="text-xl font-semibold"
                >
                  Your words
                </label>
                <textarea
                  id={`${id}-custom`}
                  rows={3}
                  maxLength={600}
                  value={about.custom}
                  onChange={(e) => changeAbout({ custom: e.target.value })}
                  className={field}
                />
              </div>
            )}
            {aboutText && (
              <p
                role="region"
                aria-label="Card to show"
                className="rounded-xl border-4 border-black p-4 text-3xl font-bold leading-snug"
              >
                {aboutText}
              </p>
            )}
          </Section>

          <Section title="My info">
            <p className="text-xl">
              Saved only on this phone. It is never sent anywhere.
            </p>
            <button
              type="button"
              aria-expanded={editing}
              onClick={() => setEditing(!editing)}
              className={outline}
            >
              {editing ? "Hide editing" : "Edit my info"}
            </button>
            {editing && (
              <div className="space-y-4">
                <div>
                  <label
                    htmlFor={`${id}-name`}
                    className="text-xl font-semibold"
                  >
                    Name to call me
                  </label>
                  <input
                    id={`${id}-name`}
                    type="text"
                    autoComplete="off"
                    maxLength={120}
                    value={info.callMe}
                    onChange={(e) => change({ callMe: e.target.value })}
                    className={field}
                  />
                </div>
                <div>
                  <label
                    htmlFor={`${id}-cond`}
                    className="text-xl font-semibold"
                  >
                    Conditions
                  </label>
                  <textarea
                    id={`${id}-cond`}
                    rows={3}
                    maxLength={600}
                    value={info.conditions}
                    onChange={(e) => change({ conditions: e.target.value })}
                    className={field}
                  />
                </div>
                <div>
                  <label
                    htmlFor={`${id}-meds`}
                    className="text-xl font-semibold"
                  >
                    Medications and allergies
                  </label>
                  <textarea
                    id={`${id}-meds`}
                    rows={3}
                    maxLength={600}
                    value={info.meds}
                    onChange={(e) => change({ meds: e.target.value })}
                    className={field}
                  />
                </div>
                <div>
                  <label
                    htmlFor={`${id}-cname`}
                    className="text-xl font-semibold"
                  >
                    Emergency contact name
                  </label>
                  <input
                    id={`${id}-cname`}
                    type="text"
                    autoComplete="off"
                    maxLength={120}
                    value={info.contactName}
                    onChange={(e) => change({ contactName: e.target.value })}
                    className={field}
                  />
                </div>
                <div>
                  <label
                    htmlFor={`${id}-cphone`}
                    className="text-xl font-semibold"
                  >
                    Emergency contact phone
                  </label>
                  <input
                    id={`${id}-cphone`}
                    type="tel"
                    inputMode="tel"
                    autoComplete="off"
                    maxLength={40}
                    aria-describedby={`${id}-cphone-hint`}
                    value={info.contactPhone}
                    onChange={(e) => change({ contactPhone: e.target.value })}
                    className={field}
                  />
                  <p id={`${id}-cphone-hint`} className="mt-1 text-lg">
                    {info.contactPhone.trim() && !cleanPhone(info.contactPhone)
                      ? "That does not look like a full phone number, so the call and text buttons are off."
                      : "Used for the Call and Text buttons. Include the area code."}
                  </p>
                </div>
                <label className="flex min-h-11 items-center gap-3 text-xl">
                  <input
                    type="checkbox"
                    checked={info.bracelet}
                    onChange={(e) => change({ bracelet: e.target.checked })}
                    className="size-6 shrink-0 accent-black"
                  />
                  I wear a medical ID bracelet
                </label>
              </div>
            )}
            {confirmDelete ? (
              <div className="space-y-3 rounded-xl border-4 border-black p-4">
                <p className="text-xl font-bold">
                  Delete everything saved on this phone?
                </p>
                <button type="button" onClick={wipe} className={solid}>
                  Yes, delete it
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className={outline}
                >
                  Keep it
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className={outline}
              >
                Delete my info
              </button>
            )}
            <p role="status" className="text-xl font-semibold">
              {deleted ? "Deleted. Nothing is saved on this phone." : ""}
            </p>
          </Section>
        </div>

        <footer className="shrink-0 space-y-3 border-t-4 border-black bg-white px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
          {/* Stop is always on screen while the alert is ringing. */}
          {ringing && (
            <button type="button" onClick={() => void toggleAlarm()} className={solid}>
              Stop sound alert
            </button>
          )}
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            className={outline}
          >
            Close
          </button>
        </footer>
      </dialog>
    </>
  );
}
