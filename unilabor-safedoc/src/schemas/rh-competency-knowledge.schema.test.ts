import { describe, expect, it } from 'vitest';
import { assignKnowledgeQuizSchema } from './rh-competency-evaluation.schema';

describe('assignKnowledgeQuizSchema', () => {
  it('modo aleatorio exige cantidad y acepta minutos nulos', () => {
    const ok = assignKnowledgeQuizSchema.safeParse({ mode: 'random', count: '10', window_hours: '72' });
    expect(ok.success).toBe(true);
    expect((ok as any).data).toEqual({ mode: 'random', count: 10, window_hours: 72, attempt_time_limit_minutes: null });
    expect(assignKnowledgeQuizSchema.safeParse({ mode: 'random', window_hours: 72 }).success).toBe(false);
  });

  it('modo fijo exige al menos una pregunta elegida', () => {
    expect(assignKnowledgeQuizSchema.safeParse({ mode: 'fixed', item_ids: [], window_hours: 24 }).success).toBe(false);
    const ok = assignKnowledgeQuizSchema.safeParse({ mode: 'fixed', item_ids: ['5', 7], window_hours: 24, attempt_time_limit_minutes: 30 });
    expect(ok.success).toBe(true);
    expect((ok as any).data.item_ids).toEqual([5, 7]);
    expect((ok as any).data.attempt_time_limit_minutes).toBe(30);
  });

  it('rechaza ventana o minutos fuera de rango', () => {
    expect(assignKnowledgeQuizSchema.safeParse({ mode: 'random', count: 5, window_hours: 0 }).success).toBe(false);
    expect(assignKnowledgeQuizSchema.safeParse({ mode: 'random', count: 5, window_hours: 721 }).success).toBe(false);
    expect(assignKnowledgeQuizSchema.safeParse({ mode: 'random', count: 5, window_hours: 24, attempt_time_limit_minutes: 3 }).success).toBe(false);
    expect(assignKnowledgeQuizSchema.safeParse({ mode: 'random', count: 51, window_hours: 24 }).success).toBe(false);
  });
});
