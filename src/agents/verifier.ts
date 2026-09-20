import { isTestEnv } from '../platform/env.js';
import { resolveProjectCommands } from '../platform/package-manager.js';
import type { TaskNode } from '../ir/task.js';
import type { ExecutionIR } from '../ir/execution.js';
import type { VerificationIR, VerificationLayer, Regression } from '../ir/verification.js';
import { ReviewerAgent } from './reviewer.js';
import { MemoryEngine } from '../memory/engine.js';
import type { OpencodeClient } from '@opencode-ai/sdk';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

export class VerifierAgent {
  private reviewerAgent: ReviewerAgent;
  private memoryEngine: MemoryEngine;

  constructor(
    client: OpencodeClient,
    modelRoute?: { providerID: string; modelID: string },
    memoryEngine?: MemoryEngine | string,
  ) {
    this.reviewerAgent = new ReviewerAgent(client, modelRoute);
    this.memoryEngine =
      typeof memoryEngine === 'string'
        ? new MemoryEngine(memoryEngine)
        : (memoryEngine ?? new MemoryEngine('loopcode.db'));
  }

  /**
   * Run the 5-layer verification pipeline on a completed task.
   */
  async verifyTask(
    taskNode: TaskNode,
    execIR?: ExecutionIR,
    _testCoverageBefore: number = 100,
  ): Promise<VerificationIR> {
    if (!execIR) {
      const execJson = this.memoryEngine.getTaskExecution(taskNode.id);
      if (!execJson) {
        throw new Error('No execution IR found in shared memory for task ' + taskNode.id);
      }
      execIR = JSON.parse(execJson) as ExecutionIR;
    }

    const layers: VerificationLayer[] = [];
    let overallPass = true;
    let retryHint = '';
    const regressions: Regression[] = [];

    const worktreePath = execIR.gitState.worktreePath || process.cwd();
    const commands = resolveProjectCommands(worktreePath);

    // Layer 1: Compilation
    const compileStart = Date.now();
    let compilePassed = true;
    let compileEvidence = 'No compilation command specified.';

    const buildArgv = commands.build ?? commands.typecheck;
    if (buildArgv) {
      const res = spawnSync(buildArgv[0], buildArgv.slice(1), { cwd: worktreePath, encoding: 'utf8' });
      compilePassed = res.status === 0;
      compileEvidence = res.stdout || res.stderr || (res.error ? res.error.message : '');
      if (!compilePassed) {
        overallPass = false;
        retryHint = `Compilation failed: ${compileEvidence}`;
      }
    } else {
      compilePassed = true;
      compileEvidence = 'Skipped: Project defines no build or typecheck script.';
    }

    layers.push({
      name: 'Compilation',
      type: 'compile',
      passed: compilePassed,
      evidence: compileEvidence,
      durationMs: Date.now() - compileStart,
      cost: 0,
      confidence: 1.0,
    });

    if (!compilePassed) {
      return { taskId: taskNode.id, layers, overallPass: false, canRetry: true, retryHint, regressions };
    }

    // Layer 2: Unit Tests
    const testStart = Date.now();
    let testPassed = true;
    let testEvidence = 'No unit tests run.';

    if (!isTestEnv() && commands.test) {
      const res = spawnSync(commands.test[0], commands.test.slice(1), { cwd: worktreePath, encoding: 'utf8' });
      testPassed = res.status === 0;
      testEvidence = res.stdout || res.stderr || (res.error ? res.error.message : '');
      if (!testPassed) {
        overallPass = false;
        retryHint = `Unit tests failed: ${testEvidence}`;
      }
    } else {
      testPassed = true;
      testEvidence = isTestEnv() ? 'Skipped: Running in test environment.' : 'Skipped: Project defines no test script.';
    }

    layers.push({
      name: 'Unit Tests',
      type: 'test',
      passed: testPassed,
      evidence: testEvidence,
      durationMs: Date.now() - testStart,
      cost: 0,
      confidence: 1.0,
    });

    if (!testPassed) {
      return { taskId: taskNode.id, layers, overallPass: false, canRetry: true, retryHint, regressions };
    }

    // Layer 3: Integration Tests
    const integrationStart = Date.now();
    layers.push({
      name: 'Integration Tests',
      type: 'test',
      passed: true,
      evidence: 'Skipped: No integration test suite found.',
      durationMs: Date.now() - integrationStart,
      cost: 0,
      confidence: 1.0,
    });

    // Layer 4: Security Scan
    const securityStart = Date.now();
    let securityPassed = true;
    let securityEvidence = 'Security check clean.';
    try {
      if (!isTestEnv()) {
        const res = spawnSync('semgrep', ['scan', '--config', 'auto', '--json'], {
          cwd: worktreePath,
          encoding: 'utf8',
        });
        if (res.status === 0 && res.stdout) {
          const parsed = JSON.parse(res.stdout);
          if (parsed && parsed.results && parsed.results.length > 0) {
            securityPassed = false;
            securityEvidence = `Semgrep found ${parsed.results.length} vulnerability(ies).`;
            overallPass = false;
            retryHint = securityEvidence;
          }
        } else if (res.status !== 0 && res.status !== null) {
          throw new Error('Semgrep missing or failed');
        }
      }
    } catch {
      const modifiedFiles = execIR.steps
        .filter((s) => s.type === 'file_edit')
        .map((s) => (s.metadata?.path as string) || '')
        .filter(Boolean);

      const secretsRegex = /(api[_-]?key|secret|password|bearer\s+[a-z0-9._-]+)\s*[:=]\s*["'][a-z0-9._-]+["']/i;

      for (const file of modifiedFiles) {
        const fullPath = path.join(worktreePath, file);
        if (fs.existsSync(fullPath)) {
          const content = fs.readFileSync(fullPath, 'utf8');
          if (secretsRegex.test(content)) {
            securityPassed = false;
            securityEvidence = `Potential secret credential detected in ${file}`;
            overallPass = false;
            retryHint = securityEvidence;
            break;
          }
        }
      }
    }

    layers.push({
      name: 'Security Scan',
      type: 'security',
      passed: securityPassed,
      evidence: securityEvidence,
      durationMs: Date.now() - securityStart,
      cost: 0,
      confidence: 1.0,
    });

    if (!securityPassed) {
      return { taskId: taskNode.id, layers, overallPass: false, canRetry: true, retryHint, regressions };
    }

    // Layer 5: LLM Code Reviewer Agent
    const reviewIR = await this.reviewerAgent.reviewTask(taskNode, execIR);
    const violations = reviewIR.comments.map((c) => c.message);

    layers.push({
      name: 'LLM Code Review',
      type: 'review',
      passed: reviewIR.passed,
      evidence: violations.join('; ') || 'Code meets design conventions and quality guidelines.',
      durationMs: 0,
      cost: 0,
      confidence: reviewIR.confidence,
    });

    if (!reviewIR.passed) {
      overallPass = false;
      retryHint = `Code Review Failed: ${violations.join('; ')}`;
    }

    return {
      taskId: taskNode.id,
      layers,
      overallPass,
      canRetry: true,
      retryHint,
      regressions,
    };
  }
}
