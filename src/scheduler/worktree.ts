import { isTestEnv } from '../platform/env.js';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { TaskNode, TaskEdge } from '../ir/task.js';

export function git(args: string[], cwd?: string): { ok: boolean; stdout: string; stderr: string } {
  const res = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return { ok: res.status === 0, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

export function safeBranchName(taskId: string): string {
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(taskId)) {
    throw new Error(`Unsafe task id for a git branch: ${JSON.stringify(taskId)}`);
  }
  return `loopcode/task-${taskId}`;
}

export class GitWorktreeScheduler {
  private baseDir: string;
  private client?: any;

  constructor(baseDir: string = '.loopcode/worktrees', client?: any) {
    this.baseDir = path.resolve(baseDir);
    this.client = client;
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  /**
   * Creates a new Git worktree for sandboxed task execution.
   */
  createWorktree(taskId: string, baseBranch: string = 'main'): string {
    if (isTestEnv()) {
      return process.cwd();
    }
    const branchName = safeBranchName(taskId);
    const worktreePath = path.join(this.baseDir, `task-${taskId}`);
    this.removeWorktree(taskId);

    const checkGit = git(['rev-parse', '--is-inside-work-tree']);
    if (!checkGit.ok) {
      fs.mkdirSync(worktreePath, { recursive: true });
      return worktreePath;
    }

    const addRes = git(['worktree', 'add', '-b', branchName, worktreePath, baseBranch]);
    if (!addRes.ok) {
      git(['worktree', 'add', worktreePath, baseBranch]);
    }
    return worktreePath;
  }

  /**
   * Removes a Git worktree.
   */
  removeWorktree(taskId: string) {
    if (isTestEnv()) {
      return;
    }
    const branchName = safeBranchName(taskId);
    const worktreePath = path.join(this.baseDir, `task-${taskId}`);
    if (fs.existsSync(worktreePath)) {
      const checkGit = git(['rev-parse', '--is-inside-work-tree']);
      if (!checkGit.ok) {
        fs.rmSync(worktreePath, { recursive: true, force: true });
        return;
      }

      git(['worktree', 'remove', '-f', worktreePath]);
      git(['branch', '-D', branchName]);
    }
  }

  /**
   * Sorts tasks topologically into parallel execution batches.
   */
  topologicalSort(tasks: TaskNode[], edges: TaskEdge[]): TaskNode[][] {
    const adj: Map<string, string[]> = new Map();
    const inDegree: Map<string, number> = new Map();
    const taskMap: Map<string, TaskNode> = new Map();

    for (const t of tasks) {
      taskMap.set(t.id, t);
      adj.set(t.id, []);
      inDegree.set(t.id, 0);
    }

    const fileToTasks = new Map<string, string[]>();
    for (const t of tasks) {
      for (const file of t.writeAllowlist || []) {
        if (!fileToTasks.has(file)) {
          fileToTasks.set(file, []);
        }
        fileToTasks.get(file)!.push(t.id);
      }
    }

    const implicitEdges: TaskEdge[] = [];
    for (const [_file, taskIds] of fileToTasks.entries()) {
      for (let i = 0; i < taskIds.length - 1; i++) {
        implicitEdges.push({ from: taskIds[i], to: taskIds[i + 1], type: 'dependency' });
      }
    }

    const allEdges = [...edges, ...implicitEdges];

    for (const edge of allEdges) {
      if (edge.type === 'dependency') {
        adj.get(edge.from)?.push(edge.to);
        inDegree.set(edge.to, (inDegree.get(edge.to) || 0) + 1);
      }
    }

    const batches: TaskNode[][] = [];
    let queue: string[] = [];

    for (const [id, deg] of inDegree.entries()) {
      if (deg === 0) {
        queue.push(id);
      }
    }

    while (queue.length > 0) {
      const currentBatch: TaskNode[] = [];
      const nextQueue: string[] = [];

      for (const id of queue) {
        const node = taskMap.get(id);
        if (node) {
          currentBatch.push(node);
        }

        const neighbors = adj.get(id) || [];
        for (const n of neighbors) {
          inDegree.set(n, (inDegree.get(n) || 1) - 1);
          if (inDegree.get(n) === 0) {
            nextQueue.push(n);
          }
        }
      }

      batches.push(currentBatch);
      queue = nextQueue;
    }

    return batches;
  }

  /**
   * Detects merge conflicts in a worktree path.
   */
  detectMergeConflicts(worktreePath: string): string[] {
    const res = git(['diff', '--name-only', '--diff-filter=U'], worktreePath);
    if (!res.ok) return [];

    const root = path.resolve(worktreePath);
    return res.stdout
      .split('\n')
      .map((line) => line.trim())
      .filter((file) => {
        if (!file) return false;
        if (path.isAbsolute(file)) return false;
        const resolved = path.resolve(root, file);
        return resolved.startsWith(root + path.sep) || resolved === root;
      });
  }

  /**
   * Helper to merge branches and auto-resolve non-overlapping files.
   */
  async mergeBranch(targetBranch: string, sourceBranch: string): Promise<{ success: boolean; conflicts: string[] }> {
    const checkoutRes = git(['checkout', targetBranch]);
    if (!checkoutRes.ok) return { success: false, conflicts: [] };

    const mergeRes = git(['merge', sourceBranch, '-m', `Merge branch ${sourceBranch}`]);
    if (mergeRes.ok) {
      return { success: true, conflicts: [] };
    }

    const conflicts = this.detectMergeConflicts(process.cwd());
    if (conflicts.length > 0 && this.client) {
      let allResolved = true;

      for (const file of conflicts) {
        try {
          const fileContent = fs.readFileSync(file, 'utf8');
          const { data: session } = await this.client.session.create({ body: { title: 'Conflict Resolution' } });
          if (!session) {
            allResolved = false;
            break;
          }

          const prompt = `Resolve the following git merge conflicts in ${file}. 
Return the fully resolved file content with conflict markers (<<<<<<<, =======, >>>>>>>) removed.
Preserve the correct logic from both branches where applicable.

File content:
${fileContent}`;

          const { data: result } = await this.client.session.prompt({
            path: { id: session.id },
            body: { parts: [{ type: 'text', text: prompt }] } as any,
          });

          const resolvedContent = result?.text;
          if (resolvedContent && !resolvedContent.includes('<<<<<<<')) {
            let finalContent = resolvedContent;
            if (finalContent.startsWith('```')) {
              finalContent = finalContent.replace(/^```[\w]*\n/, '').replace(/\n```$/, '');
            }
            fs.writeFileSync(file, finalContent);
            git(['add', '--', file]);
          } else {
            allResolved = false;
          }
          await this.client.session.delete({ path: { id: session.id } }).catch(() => {});
        } catch {
          allResolved = false;
        }
      }

      if (allResolved) {
        const commitRes = git(['commit', '-m', `Auto-resolved merge conflicts from ${sourceBranch}`]);
        if (commitRes.ok) {
          return { success: true, conflicts: [] };
        }
        git(['merge', '--abort']);
        return { success: false, conflicts };
      }
      git(['merge', '--abort']);
      return { success: false, conflicts };
    }

    git(['merge', '--abort']);
    return { success: false, conflicts };
  }
}
