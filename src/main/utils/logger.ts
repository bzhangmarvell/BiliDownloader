// src/main/utils/logger.ts

import fs from 'fs';
import path from 'path';
import { app } from 'electron';

const logPath = path.join(app.getPath('userData'), 'bilidownloader.log');

export function log(message: string) {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] ${message}\n`;
  console.log(message);
  fs.appendFileSync(logPath, logLine);
}

// Also log console output to file
const originalConsoleLog = console.log;
console.log = function(...args: any[]) {
  const timestamp = new Date().toISOString();
  const message = args.join(' ');
  const logLine = `[${timestamp}] ${message}\n`;
  fs.appendFileSync(logPath, logLine);
  originalConsoleLog.apply(console, args);
};

export function getLogPath(): string {
  return logPath;
}
