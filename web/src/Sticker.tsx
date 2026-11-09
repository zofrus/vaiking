import { useRef, useState } from "react";
import {
  STICKER_OPTIONS,
  STICKER_PICKUP_LINE,
  STICKER_SOURCE_LINE,
  loadSticker,
  saveSticker,
  type StickerId,
} from "./lib/sticker";

// Every card pairs a pale tint with near-black text (well over 4.5:1), and says
// the colour as a word, so nothing depends on seeing the colour.
const TINT: Record<StickerId, string> = {
  green: "bg-[#dcfce7] text-[#052e16] border-[#052e16]",
  yellow: "bg-[#fef9c3] text-[#422006] border-[#422006]",
  red: "bg-[#fee2e2] text-[#450a0a] border-[#450a0a]",
};

const btn =
  "inline-flex min-h-11 items-center justify-center rounded-xl border-2 border-deep px-5 py-2 font-semibold text-deep";

// A native <dialog> opened with showModal(): the page behind goes inert, Escape
// closes it, and focus goes back to the button that opened it.
export function Sticker() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [choice, setChoice] = useState<StickerId | null>(loadSticker);
  const chosen = STICKER_OPTIONS.find((o) => o.id === choice);

  const pick = (id: StickerId) => {
    setChoice(id);
    saveSticker(id);
  };

  return (
    <div className="panel">
      <h3 className="text-2xl font-semibold">My communication sticker</h3>
      <p className="mt-2">
        {chosen
          ? `Your choice: ${chosen.word}. ${chosen.meaning}`
          : "Not chosen yet."}
      </p>
      <button
        type="button"
        className={`${btn} mt-4`}
        onClick={() => dialog.current?.showModal()}
      >
        {chosen ? "Change or show my sticker" : "Choose my sticker"}
      </button>
      <dialog
        ref={dialog}
        aria-labelledby="sticker-h"
        className="m-auto w-[min(32rem,calc(100vw-1.5rem))] rounded-2xl bg-white p-5 text-[#0f2328] backdrop:bg-black/70"
      >
        <h2 id="sticker-h" className="text-2xl font-semibold">
          My communication sticker
        </h2>
        <p className="mt-2">
          This matches the stickers KubeCon hands out. Your choice stays on this
          phone.
        </p>
        <form method="dialog" className="mt-4">
          <fieldset className="space-y-3">
            <legend className="mb-2 text-lg font-semibold">
              Pick the one you want people to see
            </legend>
            {STICKER_OPTIONS.map((o) => (
              <label
                key={o.id}
                className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border-2 p-4 has-[:checked]:border-4 has-[:focus-visible]:outline-4 has-[:focus-visible]:outline-offset-2 ${TINT[o.id]}`}
              >
                <input
                  type="radio"
                  name="sticker"
                  value={o.id}
                  checked={choice === o.id}
                  onChange={() => pick(o.id)}
                  className="mt-1 size-6 shrink-0 accent-current"
                />
                <span>
                  <span className="block text-xl font-bold">
                    {o.word}
                    {choice === o.id && " (chosen)"}
                  </span>
                  <span className="block text-lg">{o.meaning}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <p className="mt-4">{STICKER_PICKUP_LINE}</p>
          <p className="mt-1 text-sm text-[#3b5057]">{STICKER_SOURCE_LINE}</p>
          <button type="submit" className={`${btn} mt-5 w-full`}>
            Close
          </button>
        </form>
      </dialog>
    </div>
  );
}
