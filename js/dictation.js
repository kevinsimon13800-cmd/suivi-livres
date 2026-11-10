// Dictée vocale pour les notes : utilise la reconnaissance vocale du navigateur quand elle existe (sinon null : le bouton n'apparaît pas).
// Interface commune : start({ onPartial, onFinal, onEnd, onError }) puis stop().
export function createDictation(win) {
  const SR = win && (win.SpeechRecognition || win.webkitSpeechRecognition);
  if (!SR) return null;
  let rec = null;
  return {
    start({ onPartial = () => {}, onFinal = () => {}, onEnd = () => {}, onError = () => {} } = {}) {
      rec = new SR();
      rec.lang = 'fr-FR';
      rec.interimResults = true;
      rec.continuous = true;
      rec.onresult = (e) => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i += 1) {
          const text = e.results[i][0].transcript;
          if (e.results[i].isFinal) onFinal(text.trim());
          else interim += text;
        }
        onPartial(interim.trim());
      };
      rec.onerror = (e) => onError(e && e.error ? e.error : 'error');
      rec.onend = () => onEnd();
      rec.start();
    },
    stop() {
      try { if (rec) rec.stop(); } catch (e) { /* déjà arrêtée */ }
    },
  };
}
