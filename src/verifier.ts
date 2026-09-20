import { spawn } from 'node:child_process';
import type { Task, VerificationReport } from './types.js';

export class Verifier {
  /**
   * Run all verification steps (compile, test, lint) for a task and return a unified report.
   */
  static async verifyTask(task: Task): Promise<VerificationReport> {
    const report: VerificationReport = {
      taskId: task.id,
      layers: {},
      overallPass: true,
      timestamp: new Date().toISOString(),
    };

    // Sequentially run all defined verification steps
    for (const step of task.verification) {
      const startTime = Date.now();

      try {
        const { stdout, stderr, code } = await this.runCommand(step.command);
        const passed = code === step.expectedExitCode;

        const layerResult = {
          passed,
          stdout,
          stderr,
          durationMs: Date.now() - startTime,
        };

        if (step.type === 'compile') {
          report.layers.compile = layerResult;
        } else if (step.type === 'test') {
          // Attempt basic parsing for unit test count if possible, else defaults
          const testCount = this.parseTestCount(stdout);
          report.layers.test = {
            ...layerResult,
            testCount: testCount.total,
            failCount: testCount.failed,
          };
        } else if (step.type === 'lint') {
          report.layers.lint = layerResult;
        }

        if (!passed) {
          report.overallPass = false;
          // Fail fast on compilation or tests
          if (step.type === 'compile' || step.type === 'test') {
            break;
          }
        }
      } catch (err: any) {
        const failedLayerResult = {
          passed: false,
          stdout: '',
          stderr: err.message || String(err),
          durationMs: Date.now() - startTime,
        };

        if (step.type === 'compile') {
          report.layers.compile = failedLayerResult;
        } else if (step.type === 'test') {
          report.layers.test = { ...failedLayerResult, testCount: 0, failCount: 1 };
        } else if (step.type === 'lint') {
          report.layers.lint = failedLayerResult;
        }

        report.overallPass = false;
        break;
      }
    }

    return report;
  }

  /**
   * Helper to run a shell command and capture its output.
   */
  private static runCommand(command: string): Promise<{ stdout: string; stderr: string; code: number }> {
    return new Promise((resolve) => {
      const child = spawn(command, [], {
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data: Buffer | string) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data: Buffer | string) => {
        stderr += data.toString();
      });

      child.on('close', (code: number | null) => {
        resolve({ stdout, stderr, code: code ?? 1 });
      });

      child.on('error', (err: Error) => {
        resolve({ stdout: '', stderr: err.message, code: 1 });
      });
    });
  }

  /**
   * Very basic regex parser for test execution output.
   */
  private static parseTestCount(stdout: string): { total: number; failed: number } {
    try {
      const totalMatch = stdout.match(/Tests?:\s*(\d+)/i) || stdout.match(/(\d+)\s*passed/i);
      const failedMatch = stdout.match(/failed:\s*(\d+)/i) || stdout.match(/(\d+)\s*failed/i);

      const total = totalMatch ? parseInt(totalMatch[1], 10) : 0;
      const failed = failedMatch ? parseInt(failedMatch[1], 10) : 0;

      return { total, failed };
    } catch {
      return { total: 0, failed: 0 };
    }
  }
}
