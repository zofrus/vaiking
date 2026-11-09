// Read aloud with the phone's own voice (speechSynthesis). On-device on most
// phones, so it works offline. If it is missing, the button is not shown.

export function canSpeak(): boolean {
  return (
    "speechSynthesis" in globalThis &&
    typeof (globalThis as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance === "function"
  );
}

export function speak(text: string, onEnd: () => void): void {
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.onend = onEnd;
    u.onerror = onEnd;
    speechSynthesis.speak(u);
  } catch {
    console.warn("Read aloud failed");
    onEnd();
  }
}

export function stopSpeaking(): void {
  try {
    speechSynthesis.cancel();
  } catch {
    /* nothing to stop */
  }
}
