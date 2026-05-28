import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { config } from './config.js';

const execFileAsync = promisify(execFile);
const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const almanacScriptPath = path.join(serverDir, 'scripts', 'cnlunar_almanac.py');

export type AlmanacPayload = {
  date: string;
  weekDay: string;
  lunarYear: string;
  lunarMonth: string;
  lunarDay: string;
  zodiac: string;
  solarTerm: string;
  nextSolarTerm: string;
  nextSolarTermDate: string;
  dayGanzhi: string;
  monthGanzhi: string;
  yearGanzhi: string;
  zodiacClash: string;
  levelName: string;
  goodThings: string[];
  badThings: string[];
  source: 'cnlunar';
};

type AlmanacCacheEntry = {
  date: string;
  payload: AlmanacPayload;
};

let cache: AlmanacCacheEntry | null = null;

export async function getTodayAlmanac() {
  return getAlmanac(formatLocalDate(new Date()));
}

export async function getAlmanac(date: string) {
  if (cache?.date === date) {
    return cache.payload;
  }

  const { stdout } = await execFileAsync(config.pythonCommand, [almanacScriptPath, date], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PYTHONIOENCODING: 'utf-8',
      PYTHONUTF8: '1',
    },
    timeout: config.almanacTimeoutMs,
    windowsHide: true,
  });
  const payload = normalizeAlmanac(JSON.parse(stdout));
  cache = { date, payload };
  return payload;
}

function normalizeAlmanac(value: unknown): AlmanacPayload {
  if (!isRecord(value)) {
    throw new Error('Invalid cnlunar response');
  }

  return {
    date: asText(value.date),
    weekDay: asText(value.weekDay),
    lunarYear: asText(value.lunarYear),
    lunarMonth: asText(value.lunarMonth),
    lunarDay: asText(value.lunarDay),
    zodiac: asText(value.zodiac),
    solarTerm: asText(value.solarTerm),
    nextSolarTerm: asText(value.nextSolarTerm),
    nextSolarTermDate: asText(value.nextSolarTermDate),
    dayGanzhi: asText(value.dayGanzhi),
    monthGanzhi: asText(value.monthGanzhi),
    yearGanzhi: asText(value.yearGanzhi),
    zodiacClash: asText(value.zodiacClash),
    levelName: asText(value.levelName),
    goodThings: asTextArray(value.goodThings),
    badThings: asTextArray(value.badThings),
    source: 'cnlunar',
  };
}

function formatLocalDate(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asText(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function asTextArray(value: unknown) {
  return Array.isArray(value) ? value.map(asText).filter(Boolean) : [];
}
