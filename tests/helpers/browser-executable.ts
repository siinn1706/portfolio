import { chromium } from '@playwright/test';
import { existsSync } from 'node:fs';

/** Native CDP tests need an explicit executable while preserving Playwright's CI fallback. */
export function browserExecutablePath() {
  return process.env.PLAYWRIGHT_EXECUTABLE_PATH || [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ].find(existsSync) || chromium.executablePath();
}
