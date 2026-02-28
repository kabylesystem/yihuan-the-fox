/**
 * VoiceRecorder component for Neural-Sync Language Lab.
 *
 * Provides a mic button that toggles audio recording via the MediaRecorder API.
 * In mock mode the user simply clicks the button to advance the conversation
 * (no actual audio is needed — the backend returns pre-scripted responses).
 *
 * Recording flow:
 *  1. User clicks mic → getUserMedia → MediaRecorder starts capturing
 *  2. User clicks mic again → MediaRecorder stops → audio Blob assembled
 *  3. Audio is base64-encoded and sent to the backend via sendMessage()
 *
 * Mock-mode shortcut:
 *  - Since mock mode doesn't need real audio, clicking the mic sends a
 *    placeholder text message so the backend advances to the next turn.
 *
 * Props:
 *  - sendMessage(text: string) — from useConversation hook
 *  - isProcessing (bool) — whether a turn is currently being processed
 *  - demoComplete (bool) — whether all 5 mock turns are exhausted
 *  - connectionStatus (string) — WebSocket connection state
 */

import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * Convert an audio Blob to a base64 data string.
 *
 * @param {Blob} blob - Raw audio blob from MediaRecorder.
 * @returns {Promise<string>} Base64-encoded audio data (without data URI prefix).
 */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      // Strip the "data:audio/webm;base64," prefix
      const base64 = reader.result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * @param {Object} props
 * @param {Function} props.sendMessage      - Send user text to the conversation WebSocket.
 * @param {boolean}  props.isProcessing     - Whether a turn is currently in flight.
 * @param {boolean}  props.demoComplete     - Whether the mock demo is finished.
 * @param {string}   props.connectionStatus - Current WebSocket connection status.
 * @param {Function} [props.onTranscriptUpdate] - Optional callback for partial transcript updates.
 */
export default function VoiceRecorder({
  sendMessage,
  isProcessing,
  demoComplete,
  connectionStatus,
  onTranscriptUpdate,
}) {
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);

  const isConnected = connectionStatus === 'connected';
  const isDisabled = isProcessing || demoComplete || !isConnected;

  // Cleanup: stop recording and release microphone on unmount
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, []);

  /**
   * Start recording audio from the user's microphone.
   */
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm',
      });

      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // Stop all tracks to release the microphone
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }

        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        chunksRef.current = [];

        if (blob.size > 0) {
          try {
            const base64Audio = await blobToBase64(blob);
            sendMessage(base64Audio);
          } catch {
            // If base64 encoding fails, send a text fallback for mock mode
            sendMessage('[audio]');
          }
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(100); // Collect data every 100ms
      setIsRecording(true);

      if (onTranscriptUpdate) {
        onTranscriptUpdate({ status: 'recording', text: '' });
      }
    } catch {
      // Microphone access denied or unavailable — fall back to mock text
      handleMockAdvance();
    }
  }, [sendMessage, onTranscriptUpdate]);

  /**
   * Stop the active recording.
   */
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
    setIsRecording(false);

    if (onTranscriptUpdate) {
      onTranscriptUpdate({ status: 'processing', text: '' });
    }
  }, [onTranscriptUpdate]);

  /**
   * Advance the conversation in mock mode by sending placeholder text.
   *
   * When microphone access isn't available (common in non-HTTPS environments
   * or when the user denies mic permission), this sends a simple text message
   * that triggers the backend to advance to the next mock turn.
   */
  const handleMockAdvance = useCallback(() => {
    sendMessage('[mock-advance]');
  }, [sendMessage]);

  /**
   * Handle the mic button click — toggle recording or send mock text.
   */
  const handleClick = useCallback(() => {
    if (isDisabled) return;

    if (isRecording) {
      stopRecording();
    } else {
      // Try real recording; falls back to mock advance on failure
      startRecording();
    }
  }, [isDisabled, isRecording, stopRecording, startRecording]);

  // ── Determine button state and label ────────────────────────────────

  let buttonLabel = 'Speak';
  let buttonClass = 'voice-recorder__button';

  if (demoComplete) {
    buttonLabel = 'Demo Complete';
    buttonClass += ' voice-recorder__button--disabled';
  } else if (!isConnected) {
    buttonLabel = connectionStatus === 'reconnecting' ? 'Reconnecting...' : 'Disconnected';
    buttonClass += ' voice-recorder__button--disabled';
  } else if (isProcessing) {
    buttonLabel = 'Thinking...';
    buttonClass += ' voice-recorder__button--processing';
  } else if (isRecording) {
    buttonLabel = 'Stop';
    buttonClass += ' voice-recorder__button--recording';
  }

  return (
    <div className="voice-recorder">
      <div className="voice-recorder__button-wrapper">
        <button
          className={buttonClass}
          onClick={handleClick}
          disabled={isDisabled}
          aria-label={isRecording ? 'Stop recording' : 'Start recording'}
        >
          <span className="voice-recorder__icon">
            {isRecording ? (
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <rect
                  x="6"
                  y="6"
                  width="12"
                  height="12"
                  rx="2"
                  fill="currentColor"
                />
              </svg>
            ) : (
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M12 15C13.6569 15 15 13.6569 15 12V6C15 4.34315 13.6569 3 12 3C10.3431 3 9 4.34315 9 6V12C9 13.6569 10.3431 15 12 15Z"
                  fill="currentColor"
                />
                <path
                  d="M19 11V12C19 15.866 15.866 19 12 19C8.13401 19 5 15.866 5 12V11"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <path
                  d="M12 19V22"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <path
                  d="M9 22H15"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            )}
          </span>
          <span className="voice-recorder__label">{buttonLabel}</span>
        </button>
        {isRecording && (
          <>
            <span className="voice-recorder__ripple voice-recorder__ripple--1" />
            <span className="voice-recorder__ripple voice-recorder__ripple--2" />
            <span className="voice-recorder__ripple voice-recorder__ripple--3" />
          </>
        )}
      </div>
      {isRecording && (
        <div className="voice-recorder__indicator">
          <span className="voice-recorder__pulse" />
          <span className="voice-recorder__indicator-text">Listening...</span>
        </div>
      )}
    </div>
  );
}
