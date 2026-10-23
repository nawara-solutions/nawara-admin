import { Subject } from 'rxjs';
import { StepUpGrant } from '../auth/step-up.gateway';
import { AppError } from '../errors/app-error';
import { ActionContext, ActionOutcome, ActionRun } from './action-run';

interface Sent {
  readonly input: string;
  readonly idempotencyKey: string;
  readonly stepUpToken: string | null;
  readonly answer: Subject<string>;
}

function setUp(options: { stepUp?: boolean } = {}) {
  let context: ActionContext | null = { actorId: 'owner', scope: 'company' };
  const sent: Sent[] = [];
  const grants: Subject<StepUpGrant>[] = [];
  const settled: { outcome: ActionOutcome<string>; input: string; presented: boolean }[] = [];
  let keys = 0;
  const run = new ActionRun<string, string>({
    context: () => context,
    stepUp:
      options.stepUp === false
        ? null
        : () => {
            const grant = new Subject<StepUpGrant>();
            grants.push(grant);
            return grant;
          },
    execute: (input, request) => {
      const answer = new Subject<string>();
      sent.push({ input, ...request, answer });
      return answer;
    },
    settled: (outcome, input, presented) => settled.push({ outcome, input, presented }),
    newKey: () => `key-${++keys}`,
  });
  const grant = (token = 'grant') =>
    grants.at(-1)?.next({ token, expiresAt: '2026-10-23T12:05:00Z' });
  return {
    run,
    sent,
    settled,
    grant,
    grants,
    setContext: (next: ActionContext | null) => (context = next),
  };
}

const proof = { method: 'totp', code: '123456' } as const;
const network: AppError = { kind: 'network', status: 0 };

describe('ActionRun', () => {
  it('opens only in a context that allows it', () => {
    const { run, setContext } = setUp();
    setContext(null);
    expect(run.open()).toBe(false);
    expect(run.state()).toEqual({ phase: 'closed' });
    setContext({ actorId: 'owner', scope: 'company' });
    expect(run.open()).toBe(true);
    expect(run.state()).toEqual({ phase: 'editing' });
  });

  it('verifies, then sends once with the grant and one idempotency key', () => {
    const { run, sent, settled, grant } = setUp();
    run.open();
    run.submit('Academy');
    expect(run.state()).toEqual({ phase: 'verifying', busy: false, failure: null });
    run.verify(proof);
    expect(run.state()).toEqual({ phase: 'verifying', busy: true, failure: null });
    run.verify(proof); // ignored while busy
    grant('grant-1');
    expect(run.state()).toEqual({ phase: 'pending' });
    run.submit('Academy'); // ignored while pending
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      input: 'Academy',
      idempotencyKey: 'key-1',
      stepUpToken: 'grant-1',
    });
    sent[0]?.answer.next('platform-1');
    expect(run.state()).toEqual({ phase: 'succeeded', result: 'platform-1' });
    expect(settled).toEqual([
      { outcome: { ok: true, result: 'platform-1' }, input: 'Academy', presented: true },
    ]);
  });

  it('keeps the key for a retry after an unknown outcome, verifying again; a changed input gets a new key', () => {
    const { run, sent, grant } = setUp();
    run.open();
    run.submit('Academy');
    run.verify(proof);
    grant('g1');
    sent[0]?.answer.error(network);
    expect(run.state()).toEqual({ phase: 'failed', failure: { kind: 'outcomeUnknown' } });
    run.retry();
    expect(run.state().phase).toBe('verifying');
    run.verify(proof);
    grant('g2');
    expect(sent.map((s) => [s.idempotencyKey, s.stepUpToken])).toEqual([
      ['key-1', 'g1'],
      ['key-1', 'g2'],
    ]);
    sent[1]?.answer.error({ kind: 'unavailable', status: 503 });
    run.retry();
    run.back();
    run.submit('Academy 2');
    run.verify(proof);
    grant('g3');
    expect(sent[2]?.idempotencyKey).toBe('key-2');
  });

  it('keeps a refused verification in the verification step', () => {
    const { run, grants, sent } = setUp();
    run.open();
    run.submit('Academy');
    run.verify(proof);
    grants[0]?.error({ kind: 'unauthenticated', status: 401 });
    expect(run.state()).toEqual({
      phase: 'verifying',
      busy: false,
      failure: { kind: 'verificationRefused' },
    });
    expect(sent).toHaveLength(0);
  });

  it('sends nothing when the actor or scope changed after opening', () => {
    const { run, sent, setContext, grant } = setUp();
    run.open();
    run.submit('Academy');
    run.verify(proof);
    setContext({ actorId: 'owner', scope: 'another-company' });
    grant();
    expect(sent).toHaveLength(0);
    expect(run.state()).toEqual({ phase: 'failed', failure: { kind: 'stale' } });
  });

  it('drops a grant that arrives after the dialog closed: nothing is sent', () => {
    const { run, sent, grant } = setUp();
    run.open();
    run.submit('Academy');
    run.verify(proof);
    run.close();
    grant();
    expect(sent).toHaveLength(0);
    expect(run.state()).toEqual({ phase: 'closed' });
  });

  it('never cancels a sent command: closing detaches it, and the result is still delivered', () => {
    const { run, sent, settled, grant } = setUp();
    run.open();
    run.submit('Academy');
    run.verify(proof);
    grant();
    run.close();
    expect(run.state()).toEqual({ phase: 'pending' });
    expect(run.open()).toBe(false);
    sent[0]?.answer.next('platform-1');
    expect(settled).toEqual([
      { outcome: { ok: true, result: 'platform-1' }, input: 'Academy', presented: false },
    ]);
    expect(run.state()).toEqual({ phase: 'closed' });
  });

  it('shows a detached pending command again when reopened', () => {
    const { run, sent, settled, grant } = setUp();
    run.open();
    run.submit('Academy');
    run.verify(proof);
    grant();
    run.close();
    expect(run.reattach()).toBe(true);
    sent[0]?.answer.next('platform-1');
    expect(settled[0]?.presented).toBe(true);
    expect(run.state()).toEqual({ phase: 'succeeded', result: 'platform-1' });
  });

  it('drops, silently, an answer that arrives for another actor (or after a sign-out)', () => {
    const { run, sent, settled, setContext, grant } = setUp();
    run.open();
    run.submit('Academy');
    run.verify(proof);
    grant();
    setContext({ actorId: 'someone-else', scope: 'company' });
    sent[0]?.answer.next('platform-1');
    expect(settled).toEqual([]);
    expect(run.state()).toEqual({ phase: 'closed' });
  });

  it('runs an action without a step-up straight away, and refuses retry after a final refusal', () => {
    const { run, sent } = setUp({ stepUp: false });
    run.open();
    run.submit('Academy');
    expect(sent[0]).toMatchObject({ stepUpToken: null, idempotencyKey: 'key-1' });
    sent[0]?.answer.error({ kind: 'conflict', code: 'not_authoritative', status: 409 });
    run.retry();
    expect(sent).toHaveLength(1);
    expect(run.state()).toEqual({
      phase: 'failed',
      failure: { kind: 'conflict', code: 'not_authoritative' },
    });
  });
});
