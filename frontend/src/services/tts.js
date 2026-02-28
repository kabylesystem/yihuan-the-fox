/**
 * Text-to-Speech service for Neural-Sync Language Lab.
 *
 * Wraps the browser's SpeechSynthesis API to speak the tutor's French
 * responses aloud. Selects a French voice when available, with graceful
 * fallbacks for browsers that lack SpeechSynthesis or a French voice.
 *
 * Edge cases handled:
 *  - Browser lacks SpeechSynthesis entirely  -> silently no-ops, logs warning.
 *  - No French voice available               -> uses default voice, logs warning.
 *  - Empty or missing text                   -> no-op (no utterance created).
 */

/** Preferred BCP-47 language tag for French. */
const FRENCH_LANG = 'fr-FR';

/** Cache the resolved French voice so we only search once. */
let _cachedVoice = null;
let _voiceResolved = false;

/**
 * Find the best available French voice.
 *
 * Prefers an exact match on "fr-FR", then falls back to any voice whose
 * lang starts with "fr". Returns null if no French voice is found.
 *
 * @returns {SpeechSynthesisVoice | null}
 */
function findFrenchVoice() {
  if (!window.speechSynthesis) return null;

  const voices = window.speechSynthesis.getVoices();

  // Exact match first (e.g. "fr-FR")
  const exact = voices.find((v) => v.lang === FRENCH_LANG);
  if (exact) return exact;

  // Broad match (e.g. "fr-CA", "fr")
  const broad = voices.find((v) => v.lang.startsWith('fr'));
  if (broad) return broad;

  return null;
}

/**
 * Resolve and cache the French voice.
 *
 * On some browsers (Chrome), `getVoices()` returns an empty array until
 * the `voiceschanged` event fires. This helper handles both synchronous
 * and asynchronous voice loading.
 *
 * @returns {Promise<SpeechSynthesisVoice | null>}
 */
function resolveFrenchVoice() {
  if (_voiceResolved) return Promise.resolve(_cachedVoice);

  return new Promise((resolve) => {
    // Try synchronously first
    const voice = findFrenchVoice();
    if (voice) {
      _cachedVoice = voice;
      _voiceResolved = true;
      return resolve(voice);
    }

    // Wait for voices to load (Chrome fires this asynchronously)
    if (window.speechSynthesis && window.speechSynthesis.onvoiceschanged !== undefined) {
      let timeoutId = null;

      const handler = () => {
        if (timeoutId) clearTimeout(timeoutId);
        window.speechSynthesis.removeEventListener('voiceschanged', handler);
        _cachedVoice = findFrenchVoice();
        _voiceResolved = true;
        resolve(_cachedVoice);
      };
      window.speechSynthesis.addEventListener('voiceschanged', handler);

      // Safety timeout — don't wait forever
      timeoutId = setTimeout(() => {
        window.speechSynthesis.removeEventListener('voiceschanged', handler);
        _voiceResolved = true;
        resolve(_cachedVoice);
      }, 2000);
    } else {
      // No voiceschanged support — resolve with whatever we have
      _voiceResolved = true;
      resolve(null);
    }
  });
}

/**
 * Speak the given text using browser SpeechSynthesis.
 *
 * Uses a French voice when available. Falls back to the browser's
 * default voice if no French voice is found.
 *
 * @param {string}  text          - The text to speak (typically French).
 * @param {string}  [lang='fr-FR'] - BCP-47 language tag for the utterance.
 * @returns {Promise<void>} Resolves when the utterance finishes or is skipped.
 */
export async function speak(text, lang = FRENCH_LANG) {
  // Guard: nothing to say
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return;
  }

  // Guard: browser lacks SpeechSynthesis
  if (!window.speechSynthesis) {
    return;
  }

  // Cancel any in-progress speech before starting new utterance
  window.speechSynthesis.cancel();

  const voice = await resolveFrenchVoice();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;

  if (voice) {
    utterance.voice = voice;
  }

  // Moderate pace for a language learner
  utterance.rate = 0.9;
  utterance.pitch = 1.0;

  return new Promise((resolve) => {
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve(); // Don't reject — degrade gracefully
    window.speechSynthesis.speak(utterance);
  });
}

/**
 * Check whether the browser supports SpeechSynthesis.
 *
 * @returns {boolean}
 */
export function isTTSSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/**
 * Stop any in-progress speech immediately.
 */
export function stopSpeaking() {
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}
