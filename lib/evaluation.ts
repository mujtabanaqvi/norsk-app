import { evaluateExamSession } from '@/src/lib/evaluate-exam';
import { TranscriptEntry } from '@/src/db/schema';

export interface EvaluateSessionParams {
  sessionId: string;
  level: 'B1' | 'B2';
  topic?: string;
  transcript?: TranscriptEntry[];
}

export async function triggerB1B2Evaluation(params: EvaluateSessionParams): Promise<void> {
  const { sessionId } = params;
  (async () => {
    try {
      await evaluateExamSession(sessionId);
    } catch (err) {
      console.error('[Evaluation] Background evaluation failed:', err);
    }
  })();
}
