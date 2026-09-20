/**
 * LoopCode High-Fidelity TUI Simulator
 * Replicates the exact state-machine loop, console transcripts,
 * and interactive overlays from the actual Ink codebase.
 */

document.addEventListener('DOMContentLoaded', () => {
  // --- Copy Installation script ---
  const copyBtn = document.getElementById('copy-cmd-btn');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      const textToCopy = 'curl -fsSL https://raw.githubusercontent.com/arjun-vegeta/loopCode/main/install.sh | bash';
      navigator.clipboard.writeText(textToCopy).then(() => {
        copyBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#39d353" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`;
        setTimeout(() => {
          copyBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
        }, 2000);
      });
    });
  }

  // --- TUI Spinner Tokens ---
  const spinnerChars = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let spinnerIdx = 0;
  let spinnerTimer = null;

  const spinnerEl = document.getElementById('tui-spinner-char');

  function startSpinner() {
    if (spinnerTimer) clearInterval(spinnerTimer);
    spinnerTimer = setInterval(() => {
      spinnerIdx = (spinnerIdx + 1) % spinnerChars.length;
      spinnerEl.innerText = spinnerChars[spinnerIdx];
    }, 80);
  }

  function stopSpinner() {
    clearInterval(spinnerTimer);
    spinnerEl.innerText = '·';
  }

  // --- TUI Interactive Overlays ---
  const overlays = {
    tasks: document.getElementById('overlay-tasks'),
    verify: document.getElementById('overlay-verify'),
    budget: document.getElementById('overlay-budget'),
    help: document.getElementById('overlay-help'),
  };

  const hintItems = {
    tasks: document.getElementById('hint-tasks'),
    verify: document.getElementById('hint-verify'),
    budget: document.getElementById('hint-budget'),
    help: document.getElementById('hint-help'),
  };

  function closeAllOverlays() {
    Object.values(overlays).forEach((el) => el.classList.remove('active'));
    Object.values(hintItems).forEach((el) => el.classList.remove('active'));
  }

  function toggleOverlay(name) {
    const isAlreadyActive = overlays[name].classList.contains('active');
    closeAllOverlays();
    if (!isAlreadyActive) {
      overlays[name].classList.add('active');
      hintItems[name].classList.add('active');
    }
  }

  // Mouse clicks for hint bar buttons
  Object.keys(overlays).forEach((name) => {
    hintItems[name].addEventListener('click', (e) => {
      e.stopPropagation();
      toggleOverlay(name);
    });
    // Click overlay itself to close
    overlays[name].addEventListener('click', (e) => {
      e.stopPropagation();
      closeAllOverlays();
    });
  });

  // Global keyboard listener to match TUI hotkeys
  document.addEventListener('keydown', (e) => {
    // Disable hotkeys if user is typing in standard browser forms (if any)
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    const key = e.key.toLowerCase();

    if (e.key === 'Escape') {
      closeAllOverlays();
    } else if (key === 't') {
      toggleOverlay('tasks');
    } else if (key === 'v') {
      toggleOverlay('verify');
    } else if (key === 'b') {
      toggleOverlay('budget');
    } else if (key === 'h') {
      toggleOverlay('help');
    } else if (e.key === ' ') {
      e.preventDefault();
      toggleSim();
    } else if (key === 'r') {
      restartSim();
    }
  });

  // Close overlays clicking anywhere else inside showcase
  document.getElementById('tui-showcase').addEventListener('click', (e) => {
    // Only close if click wasn't on overlay or hints
    if (!e.target.closest('.tui-overlay-container') && !e.target.closest('.tui-hints')) {
      closeAllOverlays();
    }
  });

  // --- TUI Transcript Event logs ---
  const tuiEvents = [
    {
      type: 'info',
      text: '⏺ Initializing LoopCode session context...',
      phase: 'init',
      detail: 'loading services',
      cost: '$0.00',
    },
    { type: 'dim', text: '⎿ SQLite local codebase indexing active.', phase: 'indexing', detail: 'parsing file trees' },
    {
      type: 'success',
      text: '⎿ parsed 48 classes, 129 functions via tree-sitter.',
      phase: 'indexing',
      detail: 'database synced',
    },
    {
      type: 'info',
      text: '⏺ planning: goal IR mapping generated',
      phase: 'planning',
      detail: 'analyzing dependencies',
      cost: '$0.02',
    },
    {
      type: 'success',
      text: '⎿ budget verified: monthly: $32.40, goal: $0.00',
      phase: 'planning',
      detail: 'goal limits audited',
    },
    {
      type: 'info',
      text: '⏺ scheduling: topologically sorting tasks...',
      phase: 'scheduling',
      detail: 'batching queues',
    },
    { type: 'dim', text: '  ├─ task 1: fetch db schema (Readonly)' },
    { type: 'dim', text: '  ├─ task 2: write routes/user.ts (writeAllowlist)' },
    { type: 'dim', text: '  ├─ task 3: write controllers/user.ts (writeAllowlist)' },
    { type: 'dim', text: '  └─ task 4: write tests/user.test.ts (writeAllowlist)' },
    {
      type: 'info',
      text: '◐ executing Task 2 & Task 3 in parallel...',
      phase: 'execution',
      detail: 'running batches',
      cost: '$0.08',
    },
    { type: 'success', text: '  ├─ checked out worktree: temp_wt_route', phase: 'execution', detail: 'route appended' },
    {
      type: 'success',
      text: '  ├─ checked out worktree: temp_wt_controller',
      phase: 'execution',
      detail: 'implementing services',
    },
    {
      type: 'error',
      text: '✗ L1 verification failed: compile error in user.ts:14',
      phase: 'verification',
      detail: 'compilation fail',
    },
    {
      type: 'warning',
      text: '⚠ feedback loop: re-injecting diagnostics...',
      phase: 'replanning',
      detail: 'adjusting AST changes',
      cost: '$0.12',
    },
    { type: 'success', text: '✓ compile check retry 1: PASS', phase: 'execution', detail: 'retry verify passing' },
    {
      type: 'info',
      text: '◐ executing Task 4 (integration test)...',
      phase: 'execution',
      detail: 'running test suite',
      cost: '$0.15',
    },
    {
      type: 'success',
      text: '✓ Bun test suite verified: 3 assertions passed',
      phase: 'verification',
      detail: 'tests passing',
    },
    { type: 'info', text: '⏺ AI review: peer analysis passed', phase: 'verification', detail: 'peer reviewing' },
    {
      type: 'success',
      text: '✓ session merged successfully to main branch. cost $0.18',
      phase: 'done',
      detail: 'completed',
      cost: '$0.18',
    },
  ];

  const transcriptStream = document.getElementById('tui-transcript-stream');
  const phaseTxt = document.getElementById('tui-phase-txt');
  const detailTxt = document.getElementById('tui-detail-txt');
  const costTxt = document.getElementById('tui-cost-txt');

  const simIndicator = document.getElementById('tui-sim-indicator');
  const ctrlSimToggle = document.getElementById('ctrl-sim-toggle');
  const ctrlSimReset = document.getElementById('ctrl-sim-reset');

  // Overlay nodes snapshot statuses
  const taskSnaps = {
    1: document.getElementById('task-snap-1'),
    2: document.getElementById('task-snap-2'),
    3: document.getElementById('task-snap-3'),
    4: document.getElementById('task-snap-4'),
    5: document.getElementById('task-snap-5'),
  };

  const verifyLayers = {
    1: document.getElementById('v-layer-1'),
    2: document.getElementById('v-layer-2'),
    3: document.getElementById('v-layer-3'),
    4: document.getElementById('v-layer-4'),
    5: document.getElementById('v-layer-5'),
  };

  let simIdx = 0;
  let isSimRunning = false;
  let simTimeoutId = null;

  function renderTuiLine(lineObj) {
    const lineEl = document.createElement('div');
    lineEl.classList.add('tui-line');

    const bulletEl = document.createElement('span');
    bulletEl.classList.add('tui-bullet');
    bulletEl.innerText = '·';
    lineEl.appendChild(bulletEl);

    const contentEl = document.createElement('span');
    contentEl.className = `tui-content ${lineObj.type}`;
    contentEl.innerText = lineObj.text;
    lineEl.appendChild(contentEl);

    transcriptStream.appendChild(lineEl);
    transcriptStream.scrollTop = transcriptStream.scrollHeight;

    // Update Status Indicators
    if (lineObj.phase) phaseTxt.innerText = lineObj.phase;
    if (lineObj.detail) detailTxt.innerText = lineObj.detail;
    if (lineObj.cost) costTxt.innerText = lineObj.cost;
  }

  function updateOverlayStates(idx) {
    // Task Overlay state updates
    if (idx >= 2) taskSnaps[1].innerText = '✓ completed';
    else if (idx >= 0) taskSnaps[1].innerText = '◐ running';

    if (idx >= 12) taskSnaps[2].innerText = '✓ completed';
    else if (idx >= 10) taskSnaps[2].innerText = '◐ running';

    if (idx >= 15) taskSnaps[3].innerText = '✓ completed';
    else if (idx === 13) taskSnaps[3].innerText = '✗ failed';
    else if (idx >= 10) taskSnaps[3].innerText = '◐ running';

    if (idx >= 17) taskSnaps[4].innerText = '✓ completed';
    else if (idx >= 16) taskSnaps[4].innerText = '◐ running';

    if (idx >= 19) taskSnaps[5].innerText = '✓ completed';
    else if (idx >= 18) taskSnaps[5].innerText = '◐ running';

    // Verification layers updates
    if (idx >= 15) {
      verifyLayers[1].className = 'tui-verify-layer passed';
      verifyLayers[1].innerText = '✓ Layer 1: Compilation (compile)';
    } else if (idx >= 13) {
      verifyLayers[1].className = 'tui-verify-layer failed';
      verifyLayers[1].innerText = '✗ Layer 1: Compilation (compile)';
    } else if (idx >= 11) {
      verifyLayers[1].className = 'tui-verify-layer pending';
      verifyLayers[1].innerText = '◐ Layer 1: Compilation (compile)';
    }

    if (idx >= 12) verifyLayers[2].className = 'tui-verify-layer passed';
    else if (idx >= 10) verifyLayers[2].className = 'tui-verify-layer pending';

    if (idx >= 17) verifyLayers[3].className = 'tui-verify-layer passed';
    else if (idx >= 16) verifyLayers[3].className = 'tui-verify-layer pending';

    if (idx >= 18) verifyLayers[4].className = 'tui-verify-layer passed';
    else if (idx >= 17) verifyLayers[4].className = 'tui-verify-layer pending';

    if (idx >= 19) verifyLayers[5].className = 'tui-verify-layer passed';
    else if (idx >= 18) verifyLayers[5].className = 'tui-verify-layer pending';
  }

  function runSimLoop() {
    if (!isSimRunning) return;

    if (simIdx < tuiEvents.length) {
      renderTuiLine(tuiEvents[simIdx]);
      updateOverlayStates(simIdx);
      simIdx++;
      simTimeoutId = setTimeout(runSimLoop, 1200);
    } else {
      // Completed TUI simulation
      isSimRunning = false;
      stopSpinner();
      simIndicator.innerText = 'simulation finished';
      ctrlSimToggle.innerHTML = '<span>[space]</span> restart';
    }
  }

  function startSim() {
    isSimRunning = true;
    startSpinner();
    simIndicator.innerText = 'simulation running';
    ctrlSimToggle.innerHTML = '<span>[space]</span> pause';
    runSimLoop();
  }

  function pauseSim() {
    isSimRunning = false;
    clearTimeout(simTimeoutId);
    stopSpinner();
    simIndicator.innerText = 'simulation paused';
    ctrlSimToggle.innerHTML = '<span>[space]</span> resume';
  }

  function toggleSim() {
    if (simIdx >= tuiEvents.length) {
      restartSim();
    } else if (isSimRunning) {
      pauseSim();
    } else {
      startSim();
    }
  }

  function restartSim() {
    clearTimeout(simTimeoutId);
    transcriptStream.innerHTML = '';
    simIdx = 0;
    phaseTxt.innerText = 'init';
    detailTxt.innerText = 'loading services';
    costTxt.innerText = '$0.00';

    // reset overlay mock text/classes
    Object.values(taskSnaps).forEach((el) => {
      el.className = 'tui-task-state pending';
      el.innerText = '○ pending';
    });
    Object.values(verifyLayers).forEach((el, index) => {
      el.className = 'tui-verify-layer pending';
      el.innerText = `○ Layer ${index + 1}: ${getLayerName(index + 1)}`;
    });

    startSim();
  }

  function getLayerName(layerNum) {
    const names = {
      1: 'Compilation (compile)',
      2: 'Formatting & Linters (lint)',
      3: 'Integration test execution (tests)',
      4: 'Static security analysis (semgrep)',
      5: 'Peer review assessment (ai-review)',
    };
    return names[layerNum];
  }

  // Bind simulation controls
  ctrlSimToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleSim();
  });

  ctrlSimReset.addEventListener('click', (e) => {
    e.stopPropagation();
    restartSim();
  });

  // Start automatically
  startSim();
});
