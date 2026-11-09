// QR code for the public app URL, pre-generated once (segno, error correction M,
// version 3, 29x29 modules) so no QR library ships in the bundle. The URL is
// fixed, so the code never changes. The URL is also printed next to it.
export const APP_URL = "https://grace.effulgentpoint.com";
const MODULES =
  "M0 0h7v1h-7zM12 0h2v1h-2zM15 0h2v1h-2zM19 0h2v1h-2zM22 0h7v1h-7zM0 1h1v1h-1zM6 1h1v1h-1zM8 1h1v1h-1zM15 1h1v1h-1zM17 1h1v1h-1zM20 1h1v1h-1zM22 1h1v1h-1zM28 1h1v1h-1zM0 2h1v1h-1zM2 2h3v1h-3zM6 2h1v1h-1zM8 2h1v1h-1zM12 2h1v1h-1zM16 2h1v1h-1zM18 2h1v1h-1zM20 2h1v1h-1zM22 2h1v1h-1zM24 2h3v1h-3zM28 2h1v1h-1zM0 3h1v1h-1zM2 3h3v1h-3zM6 3h1v1h-1zM9 3h1v1h-1zM11 3h2v1h-2zM17 3h1v1h-1zM19 3h1v1h-1zM22 3h1v1h-1zM24 3h3v1h-3zM28 3h1v1h-1zM0 4h1v1h-1zM2 4h3v1h-3zM6 4h1v1h-1zM10 4h1v1h-1zM14 4h4v1h-4zM19 4h1v1h-1zM22 4h1v1h-1zM24 4h3v1h-3zM28 4h1v1h-1zM0 5h1v1h-1zM6 5h1v1h-1zM9 5h2v1h-2zM12 5h3v1h-3zM16 5h1v1h-1zM18 5h2v1h-2zM22 5h1v1h-1zM28 5h1v1h-1zM0 6h7v1h-7zM8 6h1v1h-1zM10 6h1v1h-1zM12 6h1v1h-1zM14 6h1v1h-1zM16 6h1v1h-1zM18 6h1v1h-1zM20 6h1v1h-1zM22 6h7v1h-7zM10 7h1v1h-1zM16 7h2v1h-2zM19 7h2v1h-2zM1 8h3v1h-3zM5 8h2v1h-2zM9 8h1v1h-1zM11 8h5v1h-5zM17 8h1v1h-1zM19 8h1v1h-1zM26 8h2v1h-2zM0 9h2v1h-2zM3 9h3v1h-3zM7 9h1v1h-1zM10 9h1v1h-1zM12 9h2v1h-2zM15 9h1v1h-1zM18 9h3v1h-3zM22 9h4v1h-4zM28 9h1v1h-1zM0 10h1v1h-1zM4 10h3v1h-3zM10 10h5v1h-5zM16 10h1v1h-1zM22 10h6v1h-6zM0 11h1v1h-1zM2 11h1v1h-1zM4 11h2v1h-2zM7 11h2v1h-2zM11 11h2v1h-2zM14 11h2v1h-2zM18 11h2v1h-2zM23 11h2v1h-2zM28 11h1v1h-1zM1 12h3v1h-3zM5 12h2v1h-2zM9 12h6v1h-6zM17 12h1v1h-1zM19 12h3v1h-3zM23 12h1v1h-1zM26 12h3v1h-3zM2 13h3v1h-3zM7 13h4v1h-4zM14 13h3v1h-3zM19 13h1v1h-1zM22 13h2v1h-2zM25 13h4v1h-4zM1 14h1v1h-1zM3 14h4v1h-4zM8 14h2v1h-2zM11 14h1v1h-1zM14 14h1v1h-1zM17 14h9v1h-9zM27 14h2v1h-2zM0 15h4v1h-4zM5 15h1v1h-1zM10 15h5v1h-5zM16 15h1v1h-1zM18 15h4v1h-4zM24 15h2v1h-2zM27 15h2v1h-2zM1 16h2v1h-2zM4 16h6v1h-6zM11 16h5v1h-5zM18 16h1v1h-1zM20 16h2v1h-2zM23 16h3v1h-3zM27 16h1v1h-1zM1 17h5v1h-5zM11 17h1v1h-1zM13 17h1v1h-1zM16 17h1v1h-1zM20 17h2v1h-2zM23 17h1v1h-1zM26 17h1v1h-1zM0 18h1v1h-1zM4 18h1v1h-1zM6 18h3v1h-3zM10 18h3v1h-3zM14 18h3v1h-3zM20 18h1v1h-1zM22 18h3v1h-3zM2 19h1v1h-1zM4 19h2v1h-2zM7 19h1v1h-1zM10 19h1v1h-1zM14 19h1v1h-1zM16 19h4v1h-4zM21 19h2v1h-2zM25 19h2v1h-2zM1 20h2v1h-2zM4 20h8v1h-8zM15 20h3v1h-3zM20 20h7v1h-7zM28 20h1v1h-1zM8 21h1v1h-1zM10 21h2v1h-2zM13 21h2v1h-2zM16 21h1v1h-1zM18 21h1v1h-1zM20 21h1v1h-1zM24 21h2v1h-2zM27 21h2v1h-2zM0 22h7v1h-7zM9 22h1v1h-1zM11 22h3v1h-3zM16 22h1v1h-1zM19 22h2v1h-2zM22 22h1v1h-1zM24 22h1v1h-1zM26 22h2v1h-2zM0 23h1v1h-1zM6 23h1v1h-1zM8 23h3v1h-3zM18 23h1v1h-1zM20 23h1v1h-1zM24 23h1v1h-1zM0 24h1v1h-1zM2 24h3v1h-3zM6 24h1v1h-1zM10 24h1v1h-1zM12 24h1v1h-1zM14 24h2v1h-2zM17 24h1v1h-1zM20 24h7v1h-7zM0 25h1v1h-1zM2 25h3v1h-3zM6 25h1v1h-1zM8 25h1v1h-1zM10 25h1v1h-1zM15 25h2v1h-2zM19 25h1v1h-1zM24 25h3v1h-3zM28 25h1v1h-1zM0 26h1v1h-1zM2 26h3v1h-3zM6 26h1v1h-1zM8 26h2v1h-2zM11 26h3v1h-3zM17 26h2v1h-2zM20 26h1v1h-1zM23 26h1v1h-1zM26 26h1v1h-1zM28 26h1v1h-1zM0 27h1v1h-1zM6 27h1v1h-1zM8 27h2v1h-2zM11 27h2v1h-2zM14 27h1v1h-1zM16 27h1v1h-1zM18 27h1v1h-1zM20 27h2v1h-2zM24 27h2v1h-2zM27 27h1v1h-1zM0 28h7v1h-7zM10 28h1v1h-1zM13 28h3v1h-3zM18 28h3v1h-3zM23 28h1v1h-1zM27 28h1v1h-1z";

export default function DemoQr() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <svg
        role="img"
        aria-label={"QR code that opens " + APP_URL}
        viewBox="-4 -4 37 37"
        shapeRendering="crispEdges"
        className="h-28 w-28 shrink-0 rounded bg-white"
      >
        <path d={MODULES} fill="#000" />
      </svg>
      <p className="min-w-0 text-base text-slate-300">
        Try it on your phone
        <a
          href={APP_URL}
          className="mt-1 block text-[clamp(0.8rem,8.5cqw,1.125rem)] font-semibold text-sky-300 underline"
        >
          grace.<wbr />
          <span className="whitespace-nowrap">effulgentpoint.com</span>
        </a>
      </p>
    </div>
  );
}
