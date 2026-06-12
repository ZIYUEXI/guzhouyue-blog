export type AdminCommandRisk = 'low' | 'medium' | 'high';

export type AdminCommandArgumentSpec = {
  name: string;
  description: string;
  required?: boolean;
  type?: 'string' | 'number' | 'boolean' | 'json';
};

export type AdminCommandDefinition<TResult = unknown> = {
  name: string;
  summary: string;
  scope: string;
  risk: AdminCommandRisk;
  arguments?: AdminCommandArgumentSpec[];
  confirmationRequired?: boolean;
  execute: (invocation: AdminCommandInvocation, context: AdminCommandContext) => Promise<TResult> | TResult;
};

export type AdminCommandContext = {
  requestedAt: string;
  requestId: string;
};

export type AdminCommandInvocation = {
  raw: string;
  name: string;
  positional: string[];
  options: Record<string, AdminCommandOptionValue>;
};

export type AdminCommandOptionValue = string | boolean | string[];

export type AdminCommandParseResult =
  | {
      ok: true;
      invocation: AdminCommandInvocation;
      tokens: string[];
    }
  | {
      ok: false;
      errors: string[];
      tokens: string[];
    };

export type AdminCommandRunRequest = {
  input?: unknown;
  confirm?: unknown;
  dryRun?: unknown;
};

export type AdminCommandRunResult =
  | {
      status: 'invalid';
      errors: string[];
      guide: AdminCommandGuide;
    }
  | {
      status: 'unknown_command';
      invocation: AdminCommandInvocation;
      guide: AdminCommandGuide;
    }
  | {
      status: 'confirmation_required';
      invocation: AdminCommandInvocation;
      command: AdminCommandDescriptor;
    }
  | {
      status: 'dry_run';
      invocation: AdminCommandInvocation;
      command: AdminCommandDescriptor;
    }
  | {
      status: 'failed';
      invocation: AdminCommandInvocation;
      command: AdminCommandDescriptor;
      errors: string[];
    }
  | {
      status: 'executed';
      invocation: AdminCommandInvocation;
      command: AdminCommandDescriptor;
      result: unknown;
    };

export type AdminCommandDescriptor = {
  name: string;
  summary: string;
  scope: string;
  risk: AdminCommandRisk;
  arguments: AdminCommandArgumentSpec[];
  confirmationRequired: boolean;
};

export type AdminCommandGuide = {
  pattern: string;
  rules: string[];
  placeholderExamples: string[];
  commands: AdminCommandDescriptor[];
};

const maxCommandLength = 2000;
const commandNamePattern = /^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)*$/;
const optionNamePattern = /^[a-z][a-z0-9-]*$/;

export class AdminCommandRegistry {
  private readonly commands = new Map<string, AdminCommandDefinition>();

  register(command: AdminCommandDefinition) {
    if (!commandNamePattern.test(command.name)) {
      throw new Error(`Invalid admin command name: ${command.name}`);
    }
    if (this.commands.has(command.name)) {
      throw new Error(`Duplicate admin command name: ${command.name}`);
    }

    this.commands.set(command.name, command);
  }

  find(name: string) {
    return this.commands.get(name);
  }

  list(): AdminCommandDescriptor[] {
    return Array.from(this.commands.values())
      .map(toDescriptor)
      .sort((first, second) => first.name.localeCompare(second.name));
  }
}

export function createDefaultAdminCommandRegistry() {
  return new AdminCommandRegistry();
}

export function getAdminCommandGuide(registry: AdminCommandRegistry): AdminCommandGuide {
  return {
    pattern: '<domain>:<action>[.<subaction>] [target] [--key=value] [--flag]',
    rules: [
      '指令名必须使用小写 ASCII，格式为 domain:action 或 domain:action.subaction。',
      '指令名后可以跟一个或多个位置参数，用于表达目标对象。',
      '选项使用 --key=value、--key value 或 --flag，key 只能包含小写字母、数字和连字符。',
      '包含空格的参数必须用单引号或双引号包裹，反斜杠可用于转义。',
      '框架只负责解析、鉴权、确认和分发；具体业务指令必须显式注册后才会执行。',
    ],
    placeholderExamples: [
      'content:example target-slug --dry-run',
      'ops:example --scope=site --reason="示例说明"',
    ],
    commands: registry.list(),
  };
}

export function parseAdminCommand(rawInput: unknown): AdminCommandParseResult {
  const raw = typeof rawInput === 'string' ? rawInput.trim() : '';
  if (!raw) {
    return { ok: false, errors: ['指令不能为空。'], tokens: [] };
  }
  if (raw.length > maxCommandLength) {
    return { ok: false, errors: [`指令不能超过 ${maxCommandLength} 个字符。`], tokens: [] };
  }

  const tokenResult = tokenizeCommand(raw);
  if (!tokenResult.ok) {
    return { ok: false, errors: tokenResult.errors, tokens: tokenResult.tokens };
  }

  const [name = '', ...parts] = tokenResult.tokens;
  const errors: string[] = [];
  if (!commandNamePattern.test(name)) {
    errors.push('指令名格式无效，应为 domain:action 或 domain:action.subaction。');
  }

  const positional: string[] = [];
  const options: Record<string, AdminCommandOptionValue> = {};
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index] ?? '';
    if (!part.startsWith('--')) {
      positional.push(part);
      continue;
    }

    const optionText = part.slice(2);
    const separatorIndex = optionText.indexOf('=');
    const key = separatorIndex >= 0 ? optionText.slice(0, separatorIndex) : optionText;
    if (!optionNamePattern.test(key)) {
      errors.push(`选项名无效：${key || part}`);
      continue;
    }

    let value: string | boolean = true;
    if (separatorIndex >= 0) {
      value = optionText.slice(separatorIndex + 1);
    } else if (parts[index + 1] && !parts[index + 1].startsWith('--')) {
      value = parts[index + 1];
      index += 1;
    }
    addOptionValue(options, key, value);
  }

  if (errors.length > 0) {
    return { ok: false, errors, tokens: tokenResult.tokens };
  }

  return {
    ok: true,
    invocation: {
      raw,
      name,
      positional,
      options,
    },
    tokens: tokenResult.tokens,
  };
}

export async function runAdminCommand(
  registry: AdminCommandRegistry,
  request: AdminCommandRunRequest,
  context: AdminCommandContext,
): Promise<AdminCommandRunResult> {
  const parsed = parseAdminCommand(request.input);
  const guide = getAdminCommandGuide(registry);
  if (!parsed.ok) {
    return { status: 'invalid', errors: parsed.errors, guide };
  }

  const command = registry.find(parsed.invocation.name);
  if (!command) {
    return { status: 'unknown_command', invocation: parsed.invocation, guide };
  }

  const descriptor = toDescriptor(command);
  if (request.dryRun === true) {
    return { status: 'dry_run', invocation: parsed.invocation, command: descriptor };
  }
  if (command.confirmationRequired && request.confirm !== true) {
    return { status: 'confirmation_required', invocation: parsed.invocation, command: descriptor };
  }

  try {
    return {
      status: 'executed',
      invocation: parsed.invocation,
      command: descriptor,
      result: await command.execute(parsed.invocation, context),
    };
  } catch (error) {
    return {
      status: 'failed',
      invocation: parsed.invocation,
      command: descriptor,
      errors: [(error as Error).message || '指令执行失败。'],
    };
  }
}

function tokenizeCommand(raw: string): { ok: true; tokens: string[] } | { ok: false; errors: string[]; tokens: string[] } {
  const tokens: string[] = [];
  const errors: string[] = [];
  let current = '';
  let quote: '"' | "'" | '' = '';
  let escaped = false;

  for (const character of raw) {
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }

    if (character === '\\') {
      escaped = true;
      continue;
    }

    if (quote) {
      if (character === quote) {
        quote = '';
      } else {
        current += character;
      }
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }

    if (/\s/.test(character)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }

    current += character;
  }

  if (escaped) {
    current += '\\';
  }
  if (quote) {
    errors.push('引号未闭合。');
  }
  if (current) {
    tokens.push(current);
  }

  return errors.length > 0 ? { ok: false, errors, tokens } : { ok: true, tokens };
}

function addOptionValue(options: Record<string, AdminCommandOptionValue>, key: string, value: string | boolean) {
  const existing = options[key];
  if (existing === undefined) {
    options[key] = value;
    return;
  }
  if (Array.isArray(existing)) {
    options[key] = [...existing, String(value)];
    return;
  }

  options[key] = [String(existing), String(value)];
}

function toDescriptor(command: AdminCommandDefinition): AdminCommandDescriptor {
  return {
    name: command.name,
    summary: command.summary,
    scope: command.scope,
    risk: command.risk,
    arguments: command.arguments ?? [],
    confirmationRequired: command.confirmationRequired ?? command.risk === 'high',
  };
}
