import { describe, it, expect } from 'bun:test';
import { EventBus, makeEvent, type NoticeEvent, type TaskStateEvent } from '../src/app/events.js';

describe('EventBus Central Redaction & Lifecycle', () => {
  it('redacts synthetic secrets centrally on EventBus.emit (AC-7.1)', () => {
    const bus = new EventBus();
    let received: NoticeEvent | null = null;

    bus.subscribe((event) => {
      if (event.kind === 'notice') {
        received = event as NoticeEvent;
      }
    });

    bus.emit(
      makeEvent<NoticeEvent>({
        kind: 'notice',
        level: 'info',
        text: 'Found API key sk-ant-api03-1234567890abcdef1234567890abcdef inside output',
      }),
    );

    expect(received).not.toBeNull();
    expect(received!.text).not.toContain('sk-ant-api03-1234567890abcdef1234567890abcdef');
    expect(received!.text).toContain('«redacted»');
  });

  it('maintains event history buffer for late subscribers', () => {
    const bus = new EventBus(10);
    bus.emit(makeEvent<NoticeEvent>({ kind: 'notice', level: 'info', text: 'Hello' }));
    bus.emit(
      makeEvent<TaskStateEvent>({
        kind: 'task-state',
        taskId: 't1',
        title: 'Task 1',
        batchIndex: 0,
        status: 'running',
      }),
    );

    const history = bus.history();
    expect(history.length).toBe(2);
    expect(history[0].kind).toBe('notice');
    expect(history[1].kind).toBe('task-state');
  });
});
