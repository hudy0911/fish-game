#!/usr/bin/env node
/**
 * 一键本地开发：一并启动 Vite Web 与本地 mock 大厅服务。
 *
 * 设计目标：
 *  - 一个进程统领两个子进程，Ctrl+C / SIGTERM 时把两者一起关掉。
 *  - 任何子进程崩溃或主动退出，编排器退出，pnpm / 终端会负责清理。
 *  - 子进程 stdout / stderr 直接透传，保留各自的启动 banner。
 *
 * 用法（根目录 package.json 已暴露为 `pnpm dev`）：
 *   node scripts/dev.mjs
 */
import { spawn } from 'node:child_process';
import process from 'node:process';

const tasks = [
  {
    name: 'mock',
    color: '\u001b[36m', // cyan
    command: process.execPath,
    args: ['scripts/lobby-mock.mjs'],
  },
  {
    name: 'web',
    color: '\u001b[35m', // magenta
    // pnpm 在 Windows 上是 pnpm.cmd；非 Windows 直接调 pnpm。
    command: process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
    args: ['--filter', '@parti/web', 'dev', '--host'],
  },
];

const RESET = '\u001b[0m';
const children = new Set();
let shuttingDown = false;

function prefix(name, color) {
  return `${color}[${name}]${RESET} `;
}

function spawnTask(task) {
  // Windows 上 pnpm / vite 都是 .cmd 包装，shell: true 让 spawn 走 cmd.exe 解析后缀。
  const child = spawn(task.command, task.args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
    shell: true,
  });
  children.add(child);
  const tag = prefix(task.name, task.color);
  child.stdout.on('data', (chunk) => process.stdout.write(prefixLines(chunk.toString(), tag)));
  child.stderr.on('data', (chunk) => process.stderr.write(prefixLines(chunk.toString(), tag)));
  child.on('exit', (code, signal) => {
    children.delete(child);
    process.stdout.write(`${tag}exited (code=${code ?? 'null'}, signal=${signal ?? 'null'})\n`);
    shutdown(code ?? 1);
  });
  return child;
}

function prefixLines(text, tag) {
  // 给每一行输出加上统一前缀，保留原行内信息（颜色码、空行、CRLF）。
  return text.replace(/^/gm, tag);
}

function shutdown(exitCode) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) {
      try {
        child.kill('SIGTERM');
      } catch {
        // 子进程可能已经自己退出，忽略。
      }
    }
  }
  // 给子进程 1s 自行退出的宽限，强制兜底。
  setTimeout(() => {
    for (const child of children) {
      if (!child.killed) {
        try {
          child.kill('SIGKILL');
        } catch {
          // ignore
        }
      }
    }
    process.exit(exitCode);
  }, 1000).unref();
}

process.on('SIGINT', () => {
  process.stdout.write('\n[dev] received SIGINT, shutting down…\n');
  shutdown(0);
});
process.on('SIGTERM', () => {
  process.stdout.write('\n[dev] received SIGTERM, shutting down…\n');
  shutdown(0);
});

for (const task of tasks) {
  spawnTask(task);
}
