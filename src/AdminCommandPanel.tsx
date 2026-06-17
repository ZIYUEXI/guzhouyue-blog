import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ClipboardList, Play, Search, ShieldCheck, SquareTerminal } from 'lucide-react';
import {
  fetchAdminCommandGuide,
  parseAdminCommand,
  runAdminCommand,
  type ApiAdminCommandGuide,
  type ApiAdminCommandDescriptor,
  type ApiAdminCommandInvocation,
  type ApiAdminCommandParseResult,
  type ApiAdminCommandRunResult,
} from './apiClient';

type CommandStatus = 'idle' | 'loading' | 'ready' | 'error';

export function AdminCommandPanel() {
  const [guide, setGuide] = useState<ApiAdminCommandGuide | null>(null);
  const [input, setInput] = useState('');
  const [commandQuery, setCommandQuery] = useState('');
  const [parseResult, setParseResult] = useState<ApiAdminCommandParseResult | null>(null);
  const [runResult, setRunResult] = useState<ApiAdminCommandRunResult | null>(null);
  const [status, setStatus] = useState<CommandStatus>('loading');
  const [busy, setBusy] = useState(false);
  const commands = guide?.commands ?? [];
  const commandCount = commands.length;
  const filteredCommands = useMemo(() => {
    const keyword = commandQuery.trim().toLowerCase();
    if (!keyword) {
      return commands;
    }

    return commands.filter((command) => {
      const argumentText = command.arguments
        .map((argument) => `${argument.name}${argument.description}${argument.type ?? ''}`)
        .join('');
      const searchableText = `${command.name}${command.summary}${command.scope}${command.risk}${argumentText}`.toLowerCase();
      return searchableText.includes(keyword);
    });
  }, [commandQuery, commands]);
  const groupedCommands = useMemo(() => groupCommandsByScope(filteredCommands), [filteredCommands]);
  const canSubmit = input.trim().length > 0 && !busy;
  const visibleInvocation = useMemo(() => {
    if (runResult && 'invocation' in runResult) {
      return runResult.invocation;
    }
    if (parseResult?.ok) {
      return parseResult.invocation;
    }
    return null;
  }, [parseResult, runResult]);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    fetchAdminCommandGuide()
      .then((payload) => {
        if (!cancelled) {
          setGuide(payload);
          setStatus('ready');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatus('error');
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleParse() {
    if (!canSubmit) {
      return;
    }

    setBusy(true);
    setRunResult(null);
    try {
      const result = await parseAdminCommand(input);
      setParseResult(result);
      setGuide(result.guide);
    } catch {
      setParseResult(null);
      setStatus('error');
    } finally {
      setBusy(false);
    }
  }

  async function handleRun(dryRun: boolean) {
    if (!canSubmit) {
      return;
    }

    setBusy(true);
    setParseResult(null);
    try {
      const result = await runAdminCommand(input, { dryRun });
      setRunResult(result);
      setGuide('guide' in result ? result.guide : guide);
    } catch {
      setRunResult(null);
      setStatus('error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-panel admin-command-panel" aria-label="快速指令通道">
      <header className="panel-header">
        <h2>快速指令</h2>
        <span className="admin-command-count">{commandCount} 条已注册</span>
      </header>

      <div className="admin-command-body">
        <section className="admin-command-console" aria-label="指令输入">
          <div className="admin-command-console-head">
            <div>
              <span>Command Console</span>
              <h3>执行台</h3>
            </div>
            <small>建议先预演高风险或批量类指令。</small>
          </div>
          <label className="admin-command-input">
            <SquareTerminal size={18} />
            <input
              autoCapitalize="none"
              autoComplete="off"
              autoCorrect="off"
              onChange={(event) => {
                setInput(event.target.value);
                setParseResult(null);
                setRunResult(null);
              }}
              placeholder={guide?.pattern ?? '<domain>:<action> [target] [--key=value]'}
              spellCheck={false}
              value={input}
            />
          </label>

          <div className="admin-command-actions">
            <button className="secondary-action" disabled={!canSubmit} type="button" onClick={handleParse}>
              <Search size={16} />
              解析
            </button>
            <button className="secondary-action" disabled={!canSubmit} type="button" onClick={() => void handleRun(true)}>
              <ShieldCheck size={16} />
              预演
            </button>
            <button className="primary-action" disabled={!canSubmit} type="button" onClick={() => void handleRun(false)}>
              <Play size={16} />
              执行
            </button>
          </div>

          <CommandFeedback parseResult={parseResult} runResult={runResult} status={status} />
          {visibleInvocation && <CommandInvocationView invocation={visibleInvocation} />}
          {runResult?.status === 'executed' && <CommandResultView result={runResult.result} />}
        </section>

        <section className="admin-command-catalog" aria-label="指令目录">
          <header className="admin-command-section-head">
            <div>
              <span>Registry</span>
              <h3>指令目录</h3>
            </div>
            <small>
              {filteredCommands.length} / {commandCount}
            </small>
          </header>
          <label className="admin-command-search">
            <Search size={16} />
            <input
              aria-label="搜索指令"
              onChange={(event) => setCommandQuery(event.target.value)}
              placeholder="按名称、说明、作用域搜索"
              value={commandQuery}
            />
          </label>

          <div className="admin-command-registry">
            {groupedCommands.length > 0 ? (
              groupedCommands.map((group) => (
                <section className="admin-command-registry-group" key={group.scope}>
                  <header>
                    <strong>{group.scope}</strong>
                    <small>{group.commands.length} 条</small>
                  </header>
                  {group.commands.map((command) => (
                    <CommandCard command={command} key={command.name} onUseCommand={setInput} />
                  ))}
                </section>
              ))
            ) : (
              <p className="empty-state">{commandCount > 0 ? '没有匹配的指令。' : '暂无业务指令注册。'}</p>
            )}
          </div>
        </section>
      </div>

      <aside className="admin-command-guide" aria-label="指令范式">
        <div>
          <span>Pattern</span>
          <code>{guide?.pattern ?? '加载中'}</code>
        </div>
        <div>
          <span>Placeholders</span>
          <div className="admin-command-examples">
            {(guide?.placeholderExamples ?? []).map((example) => (
              <button key={example} type="button" onClick={() => setInput(example)}>
                {example}
              </button>
            ))}
          </div>
        </div>
        <details>
          <summary>
            <ClipboardList size={16} />
            解析规则
          </summary>
          <ul>
            {(guide?.rules ?? []).map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </details>
      </aside>
    </section>
  );
}

function CommandCard({
  command,
  onUseCommand,
}: {
  command: ApiAdminCommandDescriptor;
  onUseCommand: (value: string) => void;
}) {
  const example = createCommandExample(command);
  const RiskIcon = command.risk === 'high' ? AlertTriangle : command.risk === 'medium' ? ShieldCheck : CheckCircle2;

  return (
    <article className="admin-command-card">
      <div className="admin-command-card-main">
        <div className="admin-command-card-title">
          <code>{command.name}</code>
          <span className={`admin-command-risk risk-${command.risk}`}>
            <RiskIcon size={14} />
            {formatCommandRisk(command.risk)}
          </span>
        </div>
        <p>{command.summary}</p>
        {command.arguments.length > 0 && (
          <dl className="admin-command-args">
            {command.arguments.slice(0, 4).map((argument) => (
              <div key={argument.name}>
                <dt>
                  {argument.name}
                  {argument.required ? '*' : ''}
                </dt>
                <dd>{argument.description}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
      <button className="secondary-action" type="button" onClick={() => onUseCommand(example)}>
        填入
      </button>
    </article>
  );
}

function CommandFeedback({
  parseResult,
  runResult,
  status,
}: {
  parseResult: ApiAdminCommandParseResult | null;
  runResult: ApiAdminCommandRunResult | null;
  status: CommandStatus;
}) {
  if (status === 'error') {
    return <p className="admin-command-notice is-error">指令服务暂时不可用，请确认后台连接和登录状态。</p>;
  }
  if (status === 'loading') {
    return <p className="admin-command-notice">正在读取指令通道配置。</p>;
  }
  if (parseResult && !parseResult.ok) {
    return <p className="admin-command-notice is-error">{parseResult.errors.join(' ')}</p>;
  }
  if (parseResult?.ok) {
    return <p className="admin-command-notice">解析通过，等待选择预演或执行。</p>;
  }
  if (runResult?.status === 'invalid') {
    return <p className="admin-command-notice is-error">{runResult.errors.join(' ')}</p>;
  }
  if (runResult?.status === 'unknown_command') {
    return <p className="admin-command-notice">框架已识别输入，但当前没有匹配的业务指令。</p>;
  }
  if (runResult?.status === 'dry_run') {
    return <p className="admin-command-notice">预演通过，尚未执行任何写入。</p>;
  }
  if (runResult?.status === 'confirmation_required') {
    return <p className="admin-command-notice is-error">该指令需要二次确认后才能执行。</p>;
  }
  if (runResult?.status === 'failed') {
    return <p className="admin-command-notice is-error">{runResult.errors.join(' ')}</p>;
  }
  if (runResult?.status === 'executed') {
    return <p className="admin-command-notice">指令执行完成。</p>;
  }

  return <p className="admin-command-notice">输入符合范式的指令后，可以先解析或预演。</p>;
}

function CommandInvocationView({ invocation }: { invocation: ApiAdminCommandInvocation }) {
  return (
    <div className="admin-command-invocation">
      <div>
        <span>Command</span>
        <code>{invocation.name}</code>
      </div>
      <div>
        <span>Targets</span>
        <code>{invocation.positional.length > 0 ? invocation.positional.join(', ') : '-'}</code>
      </div>
      <div>
        <span>Options</span>
        <code>{Object.keys(invocation.options).length > 0 ? JSON.stringify(invocation.options) : '{}'}</code>
      </div>
    </div>
  );
}

function CommandResultView({ result }: { result: unknown }) {
  const normalizedResult = isRecord(result) ? result : null;
  const articleItems = Array.isArray(normalizedResult?.items) ? normalizedResult.items.filter(isRecord) : [];
  const article = isRecord(normalizedResult?.article) ? normalizedResult.article : null;

  if (articleItems.length > 0 && articleItems.every((item) => typeof item.id === 'string')) {
    return (
      <section className="admin-command-result" aria-label="指令执行结果">
        <header>
          <span>Result</span>
          <strong>{typeof normalizedResult?.count === 'number' ? `${normalizedResult.count} 篇文章` : `${articleItems.length} 条结果`}</strong>
        </header>
        <div className="admin-command-result-table" role="table" aria-label="文章 ID 列表">
          <div role="row">
            <strong role="columnheader">ID</strong>
            <strong role="columnheader">标题</strong>
            <strong role="columnheader">Slug</strong>
            <strong role="columnheader">状态</strong>
          </div>
          {articleItems.map((item) => (
            <div role="row" key={String(item.id)}>
              <code role="cell">{asResultText(item.id)}</code>
              <span role="cell">{asResultText(item.title)}</span>
              <code role="cell">{asResultText(item.slug)}</code>
              <span role="cell">{asResultText(item.status)}</span>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (article) {
    return (
      <section className="admin-command-result" aria-label="指令执行结果">
        <header>
          <span>Result</span>
          <strong>{asResultText(article.title) || '文章内容'}</strong>
        </header>
        <div className="admin-command-result-summary">
          <div>
            <span>ID</span>
            <code>{asResultText(article.id)}</code>
          </div>
          <div>
            <span>Slug</span>
            <code>{asResultText(article.slug)}</code>
          </div>
          <div>
            <span>Status</span>
            <code>{asResultText(article.status)}</code>
          </div>
          <div>
            <span>Updated</span>
            <code>{asResultText(article.updatedAt)}</code>
          </div>
        </div>
        {typeof article.bodyMarkdown === 'string' && (
          <pre className="admin-command-result-code">{article.bodyMarkdown || '正文为空。'}</pre>
        )}
      </section>
    );
  }

  return (
    <section className="admin-command-result" aria-label="指令执行结果">
      <header>
        <span>Result</span>
        <strong>原始返回</strong>
      </header>
      <pre className="admin-command-result-code">{JSON.stringify(result, null, 2)}</pre>
    </section>
  );
}

function groupCommandsByScope(commands: ApiAdminCommandDescriptor[]) {
  const groups = new Map<string, ApiAdminCommandDescriptor[]>();
  commands.forEach((command) => {
    const scope = command.scope.trim() || '未分组';
    groups.set(scope, [...(groups.get(scope) ?? []), command]);
  });

  return Array.from(groups.entries())
    .map(([scope, groupCommands]) => ({ scope, commands: groupCommands }))
    .sort((first, second) => first.scope.localeCompare(second.scope, 'zh-CN'));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asResultText(value: unknown) {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value);
}

function createCommandExample(command: ApiAdminCommandDescriptor) {
  const requiredArguments = command.arguments
    .filter((argument) => argument.required)
    .map((argument) => {
      if (argument.type === 'boolean') {
        return `--${argument.name}`;
      }

      return `<${argument.name}>`;
    });

  return [command.name, ...requiredArguments].join(' ');
}

function formatCommandRisk(risk: ApiAdminCommandDescriptor['risk']) {
  if (risk === 'high') {
    return '高风险';
  }
  if (risk === 'medium') {
    return '中风险';
  }

  return '低风险';
}
