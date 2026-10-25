import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_FALLBACK, DEFAULT_FALLBACK_LABEL } from './pricing';
import type { Rate } from './types';

/** Local, git-ignored pricing overrides, read from the app root. */
export const PRICING_FILE = 'pricing.local.json';

export type PricingFile = {
  fallbackLabel: string;
  fallback: Rate;
  /** Lowercase model id -> rate. */
  models: Record<string, Rate>;
  /** Absolute path of the file, whether or not it exists. */
  path: string;
  /** Validation problems from the last read; invalid entries were ignored. */
  warnings: string[];
};

export type PricingUpdate = {
  fallback?: { label?: string; rate: Rate };
  models?: Record<string, Rate>;
};

export class PricingValidationError extends Error {}

type Json = Record<string, unknown>;

function isRecord(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A rate entry is valid only when all three fields are finite and >= 0. */
function rateOf(value: unknown): Rate | null {
  if (!isRecord(value)) return null;
  const input = value.input;
  const output = value.output;
  const cacheRead = value.cacheRead;
  for (const field of [input, output, cacheRead]) {
    if (typeof field !== 'number' || !Number.isFinite(field) || field < 0) return null;
  }
  return { input: input as number, output: output as number, cacheRead: cacheRead as number };
}

function defaultPricing(file: string): PricingFile {
  return {
    fallbackLabel: DEFAULT_FALLBACK_LABEL,
    fallback: DEFAULT_FALLBACK,
    models: {},
    path: file,
    warnings: [],
  };
}

let cache: { mtimeMs: number; data: PricingFile } | null = null;

function readPricing(file: string): PricingFile {
  let parsed: unknown;
  try {
    // Windows editors may save UTF-8 with a BOM, which JSON.parse rejects.
    const text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
    parsed = JSON.parse(text);
  } catch (error) {
    return {
      ...defaultPricing(file),
      warnings: [`${PRICING_FILE}: ${error instanceof Error ? error.message : 'unreadable'}; using defaults`],
    };
  }

  const data = defaultPricing(file);
  if (!isRecord(parsed)) {
    data.warnings.push(`${PRICING_FILE}: expected a JSON object; using defaults`);
    return data;
  }

  if (parsed.fallback !== undefined) {
    if (!isRecord(parsed.fallback)) {
      data.warnings.push('fallback: expected an object; ignored');
    } else {
      const rate = rateOf(parsed.fallback);
      if (!rate) {
        data.warnings.push('fallback: needs numeric input, output and cacheRead >= 0; ignored');
      } else {
        data.fallback = rate;
        if (typeof parsed.fallback.label === 'string' && parsed.fallback.label.trim()) {
          data.fallbackLabel = parsed.fallback.label.trim();
        } else if (parsed.fallback.label !== undefined) {
          data.warnings.push(`fallback.label: expected a non-empty string; using "${DEFAULT_FALLBACK_LABEL}"`);
        }
      }
    }
  }

  if (parsed.models !== undefined) {
    if (!isRecord(parsed.models)) {
      data.warnings.push('models: expected an object; ignored');
    } else {
      for (const [model, entry] of Object.entries(parsed.models)) {
        const rate = rateOf(entry);
        if (!rate) {
          data.warnings.push(`models["${model}"]: needs numeric input, output and cacheRead >= 0; ignored`);
          continue;
        }
        data.models[model.toLowerCase()] = rate;
      }
    }
  }

  return data;
}

/**
 * Read `pricing.local.json` from the app root. Missing files yield the built-in
 * defaults; a changed `mtimeMs` triggers a re-read, so edits apply on the next
 * request without a restart.
 */
export function loadPricing(): PricingFile {
  const file = path.join(process.cwd(), PRICING_FILE);
  let mtimeMs: number;
  try {
    mtimeMs = fs.statSync(file).mtimeMs;
  } catch {
    cache = null;
    return defaultPricing(file);
  }

  if (cache && cache.mtimeMs === mtimeMs) return cache.data;

  const data = readPricing(file);
  for (const warning of data.warnings) console.warn('[pricing]', warning);
  cache = { mtimeMs, data };
  return data;
}

/** Validate a POST body without touching the file. */
export function parsePricingUpdate(body: unknown): PricingUpdate {
  if (!isRecord(body)) throw new PricingValidationError('body must be a JSON object');

  const update: PricingUpdate = {};

  if (body.fallback !== undefined) {
    if (!isRecord(body.fallback)) throw new PricingValidationError('fallback must be an object');
    const rate = rateOf(body.fallback);
    if (!rate) throw new PricingValidationError('fallback needs numeric input, output and cacheRead >= 0');
    const label = body.fallback.label;
    if (label !== undefined && (typeof label !== 'string' || !label.trim())) {
      throw new PricingValidationError('fallback.label must be a non-empty string');
    }
    update.fallback = { rate, label: typeof label === 'string' ? label.trim() : undefined };
  }

  if (body.models !== undefined) {
    if (!isRecord(body.models)) throw new PricingValidationError('models must be an object');
    const models: Record<string, Rate> = {};
    for (const [model, entry] of Object.entries(body.models)) {
      const rate = rateOf(entry);
      if (!rate) throw new PricingValidationError(`models["${model}"] needs numeric input, output and cacheRead >= 0`);
      models[model.toLowerCase()] = rate;
    }
    update.models = models;
  }

  return update;
}

/**
 * Merge a validated update into the current file and write it atomically
 * (temp file in the same directory, then rename).
 */
export function savePricing(update: PricingUpdate): PricingFile {
  const file = path.join(process.cwd(), PRICING_FILE);
  const current = loadPricing();

  const fallback = update.fallback
    ? { label: update.fallback.label ?? current.fallbackLabel, ...update.fallback.rate }
    : { label: current.fallbackLabel, ...current.fallback };
  const models: Record<string, Rate> = { ...current.models, ...update.models };

  const text = `${JSON.stringify({ fallback, models }, null, 2)}\n`;
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(temp, text, 'utf8');
    fs.renameSync(temp, file);
  } catch (error) {
    try {
      fs.unlinkSync(temp);
    } catch {
      /* already gone */
    }
    throw error;
  }

  cache = null;
  return loadPricing();
}
