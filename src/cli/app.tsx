import React, { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import type { AppEvent } from '../app/events.js';
import type { SessionController } from '../app/session-controller.js';
import { Transcript } from './components/Transcript.js';
import { Composer } from './components/Composer.js';
import { LiveStatus } from './components/LiveStatus.js';
import { HintBar } from './components/HintBar.js';
import { CommandPalette } from './components/CommandPalette.js';
import { ThemeProvider } from './theme-context.js';
import { buildTheme, c } from './theme.js';
import { HINTS } from './keys.js';
import { Onboarding } from './components/onboarding/Onboarding.js';
import { TasksOverlay } from './components/overlays/Tasks.js';
import { VerificationOverlay } from './components/overlays/Verification.js';
import { BudgetOverlay } from './components/overlays/Budget.js';
import { SessionsOverlay } from './components/overlays/Sessions.js';
import { HelpOverlay } from './components/overlays/Help.js';
import { ProxyOverlay } from './components/overlays/Proxy.js';
import { filterCommands } from './commands.js';

type Overlay = 'none' | 'tasks' | 'verification' | 'budget' | 'sessions' | 'help' | 'proxy';

interface State {
  committed: AppEvent[];
  live: AppEvent[];
  expanded: Set<string>;
}

type Action = { type: 'event'; event: AppEvent } | { type: 'expand-last' } | { type: 'clear' };

/** Events that can still change after they first appear. */
function isLive(event: AppEvent): boolean {
  if (event.kind === 'tool') return event.status === 'running';
  if (event.kind === 'assistant-text') return Boolean(event.streaming);
  if (event.kind === 'task-state') return event.status === 'running' || event.status === 'retrying';
  if (event.kind === 'verification') return event.overallPass === null;
  return false;
}

/** Live items are keyed so an update replaces rather than appends. */
function liveKey(event: AppEvent): string {
  switch (event.kind) {
    case 'tool':
      return `tool:${event.tool}:${event.summary}`;
    case 'task-state':
      return `task:${event.taskId}`;
    case 'verification':
      return `verify:${event.taskId}`;
    case 'assistant-text':
      return `assistant:${event.id}`;
    default:
      return event.id;
  }
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'clear':
      return { committed: [], live: [], expanded: new Set<string>() };
    case 'expand-last': {
      const candidates = [...state.live, ...state.committed].reverse();
      const target = candidates.find(
        (e) => e.kind === 'tool' || e.kind === 'diff' || e.kind === 'verification' || e.kind === 'plan',
      );
      if (!target) return state;
      const expanded = new Set(state.expanded);
      if (expanded.has(target.id)) expanded.delete(target.id);
      else expanded.add(target.id);
      return { ...state, expanded };
    }
    case 'event': {
      const event = action.event;
      const key = liveKey(event);

      if (isLive(event)) {
        const live = state.live.filter((e) => liveKey(e) !== key);
        return { ...state, live: [...live, event] };
      }

      // Terminal state: drop any live twin, commit this one.
      const live = state.live.filter((e) => liveKey(e) !== key);
      const committed = event.kind === 'notice' && event.ephemeral ? state.committed : [...state.committed, event];
      return { ...state, live, committed };
    }
    default:
      return state;
  }
}

export interface AppProps {
  controller: SessionController;
  needsOnboarding: boolean;
  initialGoal?: string;
  resumeTaskId?: string;
}

export function App({ controller, needsOnboarding, initialGoal, resumeTaskId }: AppProps) {
  const { exit } = useApp();
  const theme = useMemo(
    () => buildTheme({ mode: controller.config.ui.theme, ascii: controller.config.ui.ascii }),
    [controller],
  );

  const [state, dispatch] = useReducer(reducer, { committed: [], live: [], expanded: new Set<string>() });
  const [onboarding, setOnboarding] = useState(needsOnboarding);
  const [overlay, setOverlay] = useState<Overlay>('none');
  const [status, setStatus] = useState(controller.snapshot());
  const [paletteQuery, setPaletteQuery] = useState<string | null>(null);
  const [paletteIndex, setPaletteIndex] = useState(0);
  const [history, setHistory] = useState<string[]>([]);
  const [lastCtrlC, setLastCtrlC] = useState(0);

  // Single subscription; the controller owns all engine interaction.
  useEffect(() => {
    const unsubscribe = controller.bus.subscribe((event: AppEvent) => {
      dispatch({ type: 'event', event });
      setStatus(controller.snapshot());
    });
    for (const event of controller.bus.history()) dispatch({ type: 'event', event });
    return unsubscribe;
  }, [controller]);

  useEffect(() => {
    if (onboarding) return;
    if (resumeTaskId) void controller.resume(resumeTaskId);
    else if (initialGoal) void controller.runGoal(initialGoal);
  }, [onboarding, controller, initialGoal, resumeTaskId]);

  const handleAction = useCallback(
    (action: string) => {
      switch (action) {
        case 'open-tasks':
          setOverlay((o) => (o === 'tasks' ? 'none' : 'tasks'));
          return;
        case 'open-verification':
          setOverlay((o) => (o === 'verification' ? 'none' : 'verification'));
          return;
        case 'open-budget':
          setOverlay((o) => (o === 'budget' ? 'none' : 'budget'));
          return;
        case 'open-sessions':
          setOverlay((o) => (o === 'sessions' ? 'none' : 'sessions'));
          return;
        case 'open-help':
          setOverlay((o) => (o === 'help' ? 'none' : 'help'));
          return;
        case 'expand-last':
          dispatch({ type: 'expand-last' });
          return;
        case 'clear-view':
          dispatch({ type: 'clear' });
          return;
        case 'cycle-mode':
          controller.cyclePermissionMode();
          setStatus(controller.snapshot());
          return;
        case 'interrupt':
          void controller.interrupt();
          return;
        case 'exit':
          void controller.shutdown().then(() => {
            exit();
            process.exit(0);
          });
          return;
        default:
          return;
      }
    },
    [controller, exit],
  );

  // Global keys that must work regardless of focus.
  useInput(
    (input, key) => {
      if (key.ctrl && input === 'c') {
        const now = Date.now();
        if (now - lastCtrlC < 2000) {
          void controller.shutdown().then(() => {
            exit();
            process.exit(130);
          });
          return;
        }
        setLastCtrlC(now);
        void controller.interrupt();
        return;
      }
      if (key.escape && overlay !== 'none') {
        setOverlay('none');
        return;
      }
    },
    { isActive: !onboarding },
  );

  const handleSubmit = useCallback(
    (text: string) => {
      setHistory((h) => (h[h.length - 1] === text ? h : [...h, text]));
      setPaletteQuery(null);

      if (text.startsWith('/')) {
        const matches = filterCommands(text.split(' ')[0]);
        const chosen = matches[0];
        void controller.runCommand(chosen ? `/${chosen.name}${text.slice(text.split(' ')[0].length)}` : text, {
          openOverlay: (name) => setOverlay(name as Overlay),
        });
        return;
      }
      void controller.runGoal(text);
    },
    [controller],
  );

  const handleChange = useCallback((text: string) => {
    if (text.startsWith('/') && !text.includes(' ')) {
      setPaletteQuery(text);
      setPaletteIndex(0);
    } else {
      setPaletteQuery(null);
    }
  }, []);

  if (onboarding) {
    return (
      <ThemeProvider theme={theme}>
        <Onboarding
          controller={controller}
          onDone={() => {
            setOnboarding(false);
            setStatus(controller.snapshot());
          }}
          onExit={() => {
            exit();
            process.exit(0);
          }}
        />
      </ThemeProvider>
    );
  }

  const working = status.phase !== 'idle' && status.phase !== 'done' && status.phase !== 'failed';

  return (
    <ThemeProvider theme={theme}>
      <Box flexDirection="column">
        <Box>
          <Text color={c(theme, 'accent')} bold>
            LoopCode
          </Text>
          <Text color={c(theme, 'muted')}>
            {'  '}
            {theme.glyphs.bullet} {status.projectName} {theme.glyphs.bullet} {status.gitBranch}
            {'  '}
            {theme.glyphs.bullet} {status.activeModel ?? 'no model'}
          </Text>
        </Box>

        <Transcript committed={state.committed} live={state.live} expandedIds={state.expanded} />

        <LiveStatus
          active={working}
          phase={status.phase}
          detail={status.detail}
          startedAt={status.startedAt}
          cost={status.quota ? null : { spentUsd: status.goalSpentUsd, limitUsd: status.goalLimitUsd }}
          quota={status.quota}
          interruptible={working}
        />

        {overlay === 'tasks' ? <TasksOverlay tasks={status.tasks} /> : null}
        {overlay === 'verification' ? <VerificationOverlay reports={status.verifications} /> : null}
        {overlay === 'budget' ? <BudgetOverlay status={status} /> : null}
        {overlay === 'sessions' ? (
          <SessionsOverlay
            sessions={status.sessions}
            onSelect={(id) => {
              setOverlay('none');
              void controller.resume(id);
            }}
            onRename={(id, name) => controller.renameSession(id, name)}
            onDelete={(id) => controller.deleteSession(id)}
            onClose={() => setOverlay('none')}
          />
        ) : null}
        {overlay === 'help' ? <HelpOverlay /> : null}
        {overlay === 'proxy' ? <ProxyOverlay state={status.proxy} controller={controller} /> : null}

        {paletteQuery !== null ? <CommandPalette query={paletteQuery} selectedIndex={paletteIndex} /> : null}

        <Composer
          onSubmit={handleSubmit}
          onAction={handleAction}
          onChange={handleChange}
          context={working ? 'working' : 'input'}
          isActive={overlay === 'none'}
          history={history}
        />

        <HintBar
          text={
            overlay !== 'none'
              ? HINTS.overlay
              : working
                ? HINTS.working
                : `${status.permissionMode} ${theme.glyphs.bullet} ${HINTS.idle}`
          }
        />
      </Box>
    </ThemeProvider>
  );
}
