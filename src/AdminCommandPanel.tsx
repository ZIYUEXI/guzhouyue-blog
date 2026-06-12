import { useEffect, useMemo, useState } from 'react';
import { Play, Search, ShieldCheck, SquareTerminal } from 'lucide-react';
import {
  fetchAdminCommandGuide,
  parseAdminCommand,
  runAdminCommand,
  type ApiAdminCommandGuide,
  type ApiAdminCommandInvocation,
  type ApiAdminCommandParseResult,
  type ApiAdminCommandRunResult,
} from './apiClient';

type CommandStatus = 'idle' | 'loading' | 'ready' | 'error';

export function AdminCommandPanel() {
  const [guide, setGuide] = useState<ApiAdminCommandGuide | null>(null);
  const [input, setInput] = useState('');
  const [parseResult, setParseResult] = useState<ApiAdminCommandParseResult | null>(null);
  const [runResult, setRunResult] = useState<ApiAdminCommandRunResult | null>(null);
  const [status, setStatus] = useState<CommandStatus>('loading');
  const [busy, setBusy] = useState(false);
  const commandCount = guide?.commands.length ?? 0;
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
        </section>

        <aside className="admin-command-guide" aria-label="指令范式">
          <div>
            <span>Pattern</span>
            <code>{guide?.pattern ?? '加载中'}</code>
          </div>
          <div>
            <span>Rules</span>
            <ul>
              {(guide?.rules ?? []).map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
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
          <div>
            <span>Registry</span>
            {commandCount > 0 ? (
              <div className="admin-command-registry">
                {guide?.commands.map((command) => (
                  <article key={command.name}>
                    <strong>{command.name}</strong>
                    <small>{command.summary}</small>
                  </article>
                ))}
              </div>
            ) : (
              <p className="empty-state">暂无业务指令注册。</p>
            )}
          </div>
        </aside>
      </div>
    </section>
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
