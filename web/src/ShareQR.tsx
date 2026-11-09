import { useRef } from "react";
import { clickedOutside } from "./lib/dialogFit";
import "./dialogfit.css";

const URL_TEXT = "https://grace.effulgentpoint.com/";

// A quiet "Share this app" button. The QR is a static file (public/qr-grace.svg,
// generated once with error correction M), so no QR library ships. Native <dialog> with showModal(): inert background, Escape
// or a tap outside closes, focus returns to the button. It fits a short (landscape)
// phone: the body scrolls and Close stays pinned (see dialogfit.css).
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
        onClick={(e) => {
          // A tap on the dimmed backdrop closes it: phones have no Escape key.
          if (e.target === e.currentTarget && clickedOutside(e.currentTarget.getBoundingClientRect(), e.clientX, e.clientY))
            e.currentTarget.close();
        }}
        className="fit-dialog m-auto w-[min(24rem,calc(100vw-1.5rem))] rounded-2xl bg-[var(--gp-surface)] p-5 text-[var(--gp-ink)] shadow-[0_0_0_1px_var(--gp-line)] backdrop:bg-[rgb(24_24_27/0.45)]"
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
        <form method="dialog">
          <div className="dialog-actions">
            <button type="submit" className="btn-p">
              Close
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
