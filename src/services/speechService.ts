import { useOptionsState } from "../store/optionsState";

export function speak(text: string): void {
  const speaker = new SpeechSynthesisUtterance(text);
  const voices = speechSynthesis.getVoices();
  if (voices.length) {
    const voiceId = +useOptionsState.getState().speakerVoice;
    speaker.voice = voices[voiceId];
  }
  speechSynthesis.speak(speaker);
}
