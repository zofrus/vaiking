import { useEffect, useState } from "react";
import { canSpeak, speak, stopSpeaking } from "./lib/speech";

// Colours come from the surroundings (currentColor), so the same button reads on
// the calm screen and on the black-on-white staff card.
export function ReadAloud({ text }: { text: string }) {
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => stopSpeaking, []);
  if (!canSpeak()) return null;
  return (
    <button
      type="button"
      aria-pressed={speaking}
      className="inline-flex min-h-11 items-center justify-center rounded-xl border-2 border-current px-5 py-2 font-semibold"
      onClick={() => {
        if (speaking) {
          stopSpeaking();
          setSpeaking(false);
        } else {
          setSpeaking(true);
          speak(text, () => setSpeaking(false));
        }
      }}
    >
      {speaking ? "Stop reading" : "Read this aloud"}
    </button>
  );
}
