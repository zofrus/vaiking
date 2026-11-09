import { useRef } from "react";

const URL_TEXT = "https://grace.effulgentpoint.com/";

// A quiet "Share this app" button. The QR is a static file (public/qr-grace.svg,
// generated once with error correction M), so no QR library ships. Native <dialog> with showModal(): inert background, Escape
// closes, focus returns to the button.
export function ShareQR() {
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button
        type="button"
        className="mt-3 inline-block underline"
        onClick={() => dialog.current?.showModal()}
      >
        Share this app
      </button>
      <dialog
        ref={dialog}
        aria-labelledby="share-h"
        className="m-auto w-[min(24rem,calc(100vw-1.5rem))] rounded-2xl bg-white p-5 text-[#18181b] backdrop:bg-black/70"
      >
        <h2 id="share-h" className="text-xl font-semibold">
          Share this app
        </h2>
        <img
          src="/qr-grace.svg"
          alt="QR code for grace.effulgentpoint.com"
          width={264}
          height={264}
          className="mx-auto mt-3 block h-auto w-full max-w-[16.5rem]"
        />
        <p className="mt-3 break-all text-center font-semibold">{URL_TEXT}</p>
        <p className="mt-2">
          Scan to open Grace Period. Then use Add to Home Screen to install it.
        </p>
        <form method="dialog" className="mt-4">
          <button
            type="submit"
            className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border-2 border-[#18181b] px-5 py-2 font-semibold"
          >
            Close
          </button>
        </form>
      </dialog>
    </>
  );
}
