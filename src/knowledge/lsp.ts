import { spawn, ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';

export interface Location {
  uri: string;
  line: number;
  character: number;
}

export class LSPClient {
  private process: ChildProcess | null = null;
  private messageId = 1;
  private pendingRequests = new Map<number, { resolve: (val: any) => void; reject: (err: any) => void }>();
  private buffer = '';
  private emitter = new EventEmitter();

  async initialize(projectRoot: string): Promise<void> {
    this.process = spawn('npx', ['--yes', 'typescript-language-server', '--stdio'], {
      cwd: projectRoot,
    });

    this.process.stdout?.on('data', (chunk) => {
      this.buffer += chunk.toString();
      this.processBuffer();
    });

    return new Promise((resolve, reject) => {
      this.sendRequest('initialize', {
        processId: process.pid,
        rootUri: `file://${projectRoot}`,
        capabilities: {},
      })
        .then(() => {
          this.sendNotification('initialized', {});
          resolve();
        })
        .catch(reject);
    });
  }

  private processBuffer() {
    while (true) {
      const match = this.buffer.match(/^Content-Length: (\d+)\r\n\r\n/);
      if (!match) break;

      const contentLength = parseInt(match[1], 10);
      const headerLength = match[0].length;

      if (this.buffer.length < headerLength + contentLength) break;

      const body = this.buffer.slice(headerLength, headerLength + contentLength);
      this.buffer = this.buffer.slice(headerLength + contentLength);

      try {
        const msg = JSON.parse(body);
        if (msg.id !== undefined && this.pendingRequests.has(msg.id)) {
          const { resolve, reject } = this.pendingRequests.get(msg.id)!;
          this.pendingRequests.delete(msg.id);
          if (msg.error) reject(msg.error);
          else resolve(msg.result);
        } else if (msg.method) {
          this.emitter.emit(msg.method, msg.params);
        }
      } catch (e) {
        // Parse error
      }
    }
  }

  private sendRequest(method: string, params: any): Promise<any> {
    const id = this.messageId++;
    const payload = JSON.stringify({ jsonrpc: '2.0', id, method, params });
    const message = `Content-Length: ${Buffer.byteLength(payload, 'utf8')}\r\n\r\n${payload}`;

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      if (this.process?.stdin?.writable) {
        this.process.stdin.write(message);
      } else {
        reject(new Error('LSP process not writable'));
      }
    });
  }

  private sendNotification(method: string, params: any) {
    const payload = JSON.stringify({ jsonrpc: '2.0', method, params });
    const message = `Content-Length: ${Buffer.byteLength(payload, 'utf8')}\r\n\r\n${payload}`;
    if (this.process?.stdin?.writable) {
      this.process.stdin.write(message);
    }
  }

  async goToDefinition(file: string, line: number, char: number): Promise<Location[]> {
    const res = await this.sendRequest('textDocument/definition', {
      textDocument: { uri: `file://${file}` },
      position: { line: line - 1, character: char },
    });
    return this.mapLocations(res);
  }

  async findReferences(file: string, line: number, char: number): Promise<Location[]> {
    const res = await this.sendRequest('textDocument/references', {
      textDocument: { uri: `file://${file}` },
      position: { line: line - 1, character: char },
      context: { includeDeclaration: true },
    });
    return this.mapLocations(res);
  }

  async getTypeInfo(file: string, line: number, char: number): Promise<string> {
    const res = await this.sendRequest('textDocument/hover', {
      textDocument: { uri: `file://${file}` },
      position: { line: line - 1, character: char },
    });
    if (res && res.contents && Array.isArray(res.contents) && res.contents.length > 0) {
      return res.contents[0].value || 'any';
    } else if (res && res.contents && res.contents.value) {
      return res.contents.value;
    }
    return 'any';
  }

  private mapLocations(res: any): Location[] {
    if (!res) return [];
    const arr = Array.isArray(res) ? res : [res];
    return arr.map((loc) => ({
      uri: loc.uri ? loc.uri.replace(/^file:\/\//, '') : (loc.targetUri || '').replace(/^file:\/\//, ''),
      line: loc.range ? loc.range.start.line + 1 : loc.targetRange ? loc.targetRange.start.line + 1 : 1,
      character: loc.range ? loc.range.start.character : loc.targetRange ? loc.targetRange.start.character : 0,
    }));
  }
}
