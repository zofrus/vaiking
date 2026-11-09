import "./share.css";

// "Try it on your phone" card for the projector. The QR is the static file
// public/qr-grace.svg (error correction M), shown at 224px so it scans
// from the back of a room. No network call.
export default function DemoShare() {
  return (
    <aside aria-labelledby="share-h" className="gp-box gp-share">
      <img
        src="/qr-grace.svg"
        alt="QR code for grace.effulgentpoint.com"
        width={224}
        height={224}
        className="gp-share-qr"
      />
      <div className="gp-share-text">
        <h2 id="share-h">Try it on your phone</h2>
        <p className="gp-share-url">
          grace.<wbr />effulgentpoint.com
        </p>
        <p className="gp-muted">
          Scan to open Grace Period. Then use Add to Home Screen to install it.
        </p>
      </div>
    </aside>
  );
}
