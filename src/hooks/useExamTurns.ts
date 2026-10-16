import { useState, useEffect, useRef, useCallback } from 'react';
import {
  useAudioRecorder,
  useAudioRecorderState,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  createAudioPlayer,
  type AudioPlayer,
} from 'expo-audio';
import {
  submitExamTurn,
  finishExamSession,
  resolveAudioUrl,
} from '../api';
import type {
  CoCandidateMode,
  ExamReply,
  ExamStage,
  TranscriptTurn,
} from '../types/exam';

export type TurnPhase =
  | 'speaking' // Examiner or AI co-candidate is speaking
  | 'listening' // Ready for candidate to tap mic and speak
  | 'recording' // Candidate is actively recording
  | 'thinking' // Uploading audio -> STT -> LLM
  | 'done' // Exam finished, ready to navigate to results
  | 'error'; // Recoverable error with retry option

export interface UseExamTurnsOptions {
  sessionId: string;
  coCandidateMode: CoCandidateMode;
  initialReplies: ExamReply[];
  initialTranscript: TranscriptTurn[];
  onExamComplete: () => void;
}

const RECORDING_OPTIONS = {
  ...RecordingPresets.HIGH_QUALITY,
  isMeteringEnabled: true,
};

// Silence detection parameters (when platform provides metering in dBFS, -160..0)
const SPEECH_ACTIVE_THRESHOLD_DB = -32;
const SILENCE_THRESHOLD_DB = -40;
const AUTO_STOP_SILENCE_MS = 2600;
const MIN_RECORDING_BEFORE_AUTO_STOP_MS = 2500;

export function useExamTurns({
  sessionId,
  coCandidateMode,
  initialReplies,
  initialTranscript,
  onExamComplete,
}: UseExamTurnsOptions) {
  const [phase, setPhase] = useState<TurnPhase>('speaking');
  const [stage, setStage] = useState<ExamStage>('DEL_1');
  const [activeAiSpeaker, setActiveAiSpeaker] = useState<'examiner' | 'co_candidate'>('examiner');
  const [currentReplyText, setCurrentReplyText] = useState<string>(
    initialReplies[0]?.text ?? ''
  );
  const [transcripts, setTranscripts] = useState<TranscriptTurn[]>(initialTranscript);
  const [candidateSpeaker, setCandidateSpeaker] = useState<'CANDIDATE_1' | 'CANDIDATE_2'>(
    'CANDIDATE_1'
  );
  const [micPermissionGranted, setMicPermissionGranted] = useState<boolean | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hintMessage, setHintMessage] = useState<string | null>(null);

  const recorder = useAudioRecorder(RECORDING_OPTIONS);
  const recorderState = useAudioRecorderState(recorder, 200);

  const isMountedRef = useRef<boolean>(true);
  const activePlayerRef = useRef<AudioPlayer | null>(null);
  const isExamDoneRef = useRef<boolean>(false);
  const isStoppingRecordingRef = useRef<boolean>(false);
  const recordingStartTimeRef = useRef<number>(0);
  const hasDetectedSpeechRef = useRef<boolean>(false);
  const silenceStartRef = useRef<number | null>(null);

  // Clean up audio player on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (activePlayerRef.current) {
        try {
          activePlayerRef.current.pause();
          activePlayerRef.current.remove();
        } catch {
          // Ignore cleanup errors
        }
        activePlayerRef.current = null;
      }
    };
  }, []);

  // Request microphone permission on mount
  const ensureMicPermission = useCallback(async (): Promise<boolean> => {
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (isMountedRef.current) {
        setMicPermissionGranted(perm.granted);
      }
      if (perm.granted) {
        await setAudioModeAsync({
          allowsRecording: true,
          playsInSilentMode: true,
        }).catch(() => {});
      }
      return perm.granted;
    } catch {
      if (isMountedRef.current) {
        setMicPermissionGranted(false);
      }
      return false;
    }
  }, []);

  /**
   * Play a single ExamReply MP3 URL and resolve when finished (or on error/skip).
   */
  const playSingleReply = useCallback((reply: ExamReply): Promise<void> => {
    return new Promise((resolve) => {
      if (!isMountedRef.current) {
        resolve();
        return;
      }

      setActiveAiSpeaker(reply.speaker);
      setCurrentReplyText(reply.text);
      setPhase('speaking');

      const audioUrl = resolveAudioUrl(reply.audioUrl);
      let settled = false;

      // Estimate generous fallback timeout based on text length (min 12s, max 45s)
      const fallbackMs = Math.min(45_000, Math.max(12_000, reply.text.length * 110));
      const safetyTimer = setTimeout(() => {
        finishPlayback();
      }, fallbackMs);

      function finishPlayback() {
        if (settled) return;
        settled = true;
        clearTimeout(safetyTimer);
        if (activePlayerRef.current) {
          try {
            activePlayerRef.current.pause();
            activePlayerRef.current.remove();
          } catch {
            // Ignore cleanup errors
          }
          activePlayerRef.current = null;
        }
        resolve();
      }

      try {
        setAudioModeAsync({
          allowsRecording: false,
          playsInSilentMode: true,
        }).catch(() => {});

        const player = createAudioPlayer(audioUrl, { updateInterval: 250 });
        activePlayerRef.current = player;

        let sawPlaying = false;
        const playerWithEvents = player as unknown as {
          addListener: (
            event: 'playbackStatusUpdate',
            cb: (status: {
              playing: boolean;
              error: string | null;
              didJustFinish: boolean;
              currentTime: number;
              duration: number;
            }) => void
          ) => void;
        };

        playerWithEvents.addListener('playbackStatusUpdate', (status) => {
          if (status.playing) {
            sawPlaying = true;
          }
          if (status.error) {
            console.warn('[AudioPlayer] Playback error, advancing turn:', status.error);
            finishPlayback();
            return;
          }
          if (
            status.didJustFinish ||
            (sawPlaying &&
              !status.playing &&
              status.currentTime > 0 &&
              status.duration > 0 &&
              status.currentTime >= status.duration - 0.15)
          ) {
            finishPlayback();
          }
        });

        player.play();
      } catch (err) {
        console.warn('[AudioPlayer] Failed to create/play audio, continuing with text:', err);
        // Brief pause so user can read the text if audio playback is unavailable
        setTimeout(finishPlayback, 2000);
      }
    });
  }, []);

  /**
   * Sequentially play an array of AI replies, then transition to listening (or finish exam).
   */
  const playRepliesSequence = useCallback(
    async (replies: ExamReply[], examDone: boolean) => {
      for (const reply of replies) {
        if (!isMountedRef.current) return;
        await playSingleReply(reply);
      }

      if (!isMountedRef.current) return;

      if (examDone) {
        setPhase('done');
        try {
          await finishExamSession(sessionId);
        } catch (err) {
          console.warn('[FinishExam] Warning during auto-finish:', err);
        }
        if (isMountedRef.current) {
          onExamComplete();
        }
      } else {
        setPhase('listening');
      }
    },
    [onExamComplete, playSingleReply, sessionId]
  );

  // On initial mount: request mic permissions and play the examiner's opening greeting
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await ensureMicPermission();
      if (cancelled || !isMountedRef.current) return;
      if (initialReplies && initialReplies.length > 0) {
        await playRepliesSequence(initialReplies, false);
      } else {
        setPhase('listening');
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Allow the user to skip the currently playing AI audio and jump straight to answering.
   */
  const skipCurrentSpeech = useCallback(() => {
    if (activePlayerRef.current) {
      try {
        activePlayerRef.current.pause();
        activePlayerRef.current.remove();
      } catch {
        // Ignore
      }
      activePlayerRef.current = null;
    }
    if (isExamDoneRef.current) {
      setPhase('done');
      finishExamSession(sessionId)
        .catch(() => {})
        .finally(() => {
          if (isMountedRef.current) onExamComplete();
        });
    } else {
      setPhase('listening');
    }
  }, [onExamComplete, sessionId]);

  /**
   * Start recording the candidate's voice answer.
   */
  const startRecording = useCallback(async () => {
    setErrorMessage(null);
    setHintMessage(null);

    const granted = micPermissionGranted || (await ensureMicPermission());
    if (!granted) {
      setErrorMessage(
        'Mikrofontilgang er nødvendig for muntlig prøve. Vennligst gi tilgang i innstillingene.'
      );
      setPhase('error');
      return;
    }

    try {
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });

      await recorder.prepareToRecordAsync(RECORDING_OPTIONS);
      recordingStartTimeRef.current = Date.now();
      hasDetectedSpeechRef.current = false;
      silenceStartRef.current = null;
      isStoppingRecordingRef.current = false;

      recorder.record();
      setPhase('recording');
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Kunne ikke starte mikrofonopptak.';
      setErrorMessage(msg);
      setPhase('error');
    }
  }, [ensureMicPermission, micPermissionGranted, recorder]);

  /**
   * Stop recording and upload the audio turn to /api/exam/[sessionId]/turn.
   */
  const stopRecordingAndSubmit = useCallback(async () => {
    if (isStoppingRecordingRef.current) return;
    isStoppingRecordingRef.current = true;

    const elapsedMs = Math.max(
      recorderState.durationMillis || 0,
      Date.now() - recordingStartTimeRef.current
    );

    let stopStatusUrl: string | undefined;
    try {
      const stopResult = (await recorder.stop()) as unknown as
        | { url?: string | null }
        | undefined;
      if (stopResult && typeof stopResult.url === 'string' && stopResult.url) {
        stopStatusUrl = stopResult.url;
      }
    } catch (err) {
      console.warn('[Recorder] Error stopping recorder:', err);
    }

    const uri = stopStatusUrl || recorder.uri || recorderState.url;
    if (!uri) {
      isStoppingRecordingRef.current = false;
      setHintMessage('Ingen lyd ble fanget opp. Prøv å trykke på mikrofonen igjen.');
      setPhase('listening');
      return;
    }

    setPhase('thinking');
    setErrorMessage(null);

    try {
      const response = await submitExamTurn(sessionId, {
        audioUri: uri,
        durationMs: elapsedMs,
        speaker: coCandidateMode === 'HUMAN_LOCAL' ? candidateSpeaker : 'CANDIDATE_1',
      });

      if (!isMountedRef.current) return;

      setTranscripts(response.transcript);
      setStage(response.stage);
      isExamDoneRef.current = response.done;

      if (response.retry) {
        setHintMessage(
          response.message ||
            'Sensoren hørte ikke hva du sa. Prøv å snakke litt høyere og nærmere mikrofonen.'
        );
        setPhase('listening');
        return;
      }

      setHintMessage(null);

      // In HUMAN_LOCAL Del 2, automatically toggle candidate speaker after each recorded turn
      if (coCandidateMode === 'HUMAN_LOCAL' && response.stage === 'DEL_2') {
        setCandidateSpeaker((prev) =>
          prev === 'CANDIDATE_1' ? 'CANDIDATE_2' : 'CANDIDATE_1'
        );
      }

      if (response.replies && response.replies.length > 0) {
        await playRepliesSequence(response.replies, response.done);
      } else if (response.done) {
        setPhase('done');
        await finishExamSession(sessionId).catch(() => {});
        if (isMountedRef.current) onExamComplete();
      } else {
        setPhase('listening');
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      const msg =
        err instanceof Error ? err.message : 'Feil ved innsending av svar.';
      setErrorMessage(msg);
      setPhase('error');
    } finally {
      isStoppingRecordingRef.current = false;
    }
  }, [
    candidateSpeaker,
    coCandidateMode,
    onExamComplete,
    playRepliesSequence,
    recorder,
    recorderState.durationMillis,
    recorderState.url,
    sessionId,
  ]);

  // Automatic silence stop when metering is available
  useEffect(() => {
    if (phase !== 'recording' || !recorderState.isRecording) return;

    const metering = recorderState.metering;
    if (typeof metering !== 'number') return;

    const now = Date.now();
    const recordedMs =
      recorderState.durationMillis || now - recordingStartTimeRef.current;

    if (metering > SPEECH_ACTIVE_THRESHOLD_DB) {
      hasDetectedSpeechRef.current = true;
      silenceStartRef.current = null;
      return;
    }

    if (
      hasDetectedSpeechRef.current &&
      recordedMs >= MIN_RECORDING_BEFORE_AUTO_STOP_MS &&
      metering < SILENCE_THRESHOLD_DB
    ) {
      if (silenceStartRef.current === null) {
        silenceStartRef.current = now;
      } else if (now - silenceStartRef.current >= AUTO_STOP_SILENCE_MS) {
        silenceStartRef.current = null;
        stopRecordingAndSubmit();
      }
    }
  }, [
    phase,
    recorderState.durationMillis,
    recorderState.isRecording,
    recorderState.metering,
    stopRecordingAndSubmit,
  ]);

  /**
   * HUMAN_LOCAL Del 2: Explicitly finish the peer discussion and move to Del 3.
   */
  const endHumanDiscussion = useCallback(async () => {
    setErrorMessage(null);
    setHintMessage(null);

    if (phase === 'recording') {
      try {
        await recorder.stop();
      } catch {
        // Ignore
      }
    }

    setPhase('thinking');
    try {
      const response = await submitExamTurn(sessionId, {
        endDiscussion: true,
        speaker: candidateSpeaker,
      });

      if (!isMountedRef.current) return;

      setTranscripts(response.transcript);
      setStage(response.stage);
      isExamDoneRef.current = response.done;

      if (response.replies && response.replies.length > 0) {
        await playRepliesSequence(response.replies, response.done);
      } else {
        setPhase('listening');
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      const msg =
        err instanceof Error
          ? err.message
          : 'Kunne ikke gå videre til Del 3. Vennligst prøv igjen.';
      setErrorMessage(msg);
      setPhase('error');
    }
  }, [candidateSpeaker, phase, playRepliesSequence, recorder, sessionId]);

  /**
   * End the exam early (when user confirms "Avslutt prøve og få vurdering").
   */
  const endExamEarly = useCallback(async () => {
    if (activePlayerRef.current) {
      try {
        activePlayerRef.current.pause();
        activePlayerRef.current.remove();
      } catch {
        // Ignore
      }
      activePlayerRef.current = null;
    }
    if (phase === 'recording') {
      try {
        await recorder.stop();
      } catch {
        // Ignore
      }
    }
    setPhase('done');
    try {
      await finishExamSession(sessionId);
    } catch (err) {
      console.warn('[EndExamEarly] Error calling finish endpoint:', err);
    }
    if (isMountedRef.current) {
      onExamComplete();
    }
  }, [onExamComplete, phase, recorder, sessionId]);

  const dismissError = useCallback(() => {
    setErrorMessage(null);
    setPhase('listening');
  }, []);

  return {
    phase,
    stage,
    activeAiSpeaker,
    currentReplyText,
    transcripts,
    candidateSpeaker,
    setCandidateSpeaker,
    micPermissionGranted,
    recordingDurationMs: recorderState.durationMillis || 0,
    meteringDb: recorderState.metering,
    errorMessage,
    hintMessage,
    startRecording,
    stopRecordingAndSubmit,
    skipCurrentSpeech,
    endHumanDiscussion,
    endExamEarly,
    dismissError,
  };
}
