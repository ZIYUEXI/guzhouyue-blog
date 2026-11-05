import { useEffect, useState } from 'react';
import { requestJson } from './apiClient';

type AgentKey = {
  id: string; name: string; prefix: string; created_at: string;
  revoked_at: string | null; last_used_at: string | null;
};
type Audit = { id: number; name: string; method: string; path: string; status: number; created_at: string };

// 密钥明文只在创建成功后保留于当前组件，不写入浏览器持久存储。
export function AdminAgentKeysPanel() {
  const [keys, setKeys] = useState<AgentKey[]>([]);
  const [audit, setAudit] = useState<Audit[]>([]);
  const [name, setName] = useState('');
  const [token, setToken] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const [keyData, auditData] = await Promise.all([
      requestJson<{ items: AgentKey[] }>('/api/admin/agent-keys'),
      requestJson<{ items: Audit[] }>('/api/admin/agent-keys/audit'),
    ]);
    setKeys(keyData.items);
    setAudit(auditData.items);
  }

  useEffect(() => { void refresh().catch(() => setNotice('无法加载工具密钥，请刷新重试。')); }, []);

  async function create() {
    setBusy(true);
    setNotice('');
    setToken('');
    try {
      const result = await requestJson<{ token: string }>('/api/admin/agent-keys', {
        method: 'POST', body: JSON.stringify({ name: name.trim() }),
      });
      setToken(result.token);
      setName('');
      await refresh();
    } catch { setNotice('操作失败，请刷新密钥列表确认结果后再重试。'); }
    finally { setBusy(false); }
  }

  async function revoke(id: string) {
    setBusy(true);
    setNotice('');
    try {
      await requestJson(`/api/admin/agent-keys/${encodeURIComponent(id)}/revoke`, { method: 'POST' });
      setToken('');
      await refresh();
    } catch { setNotice('停用失败，请重试。'); }
    finally { setBusy(false); }
  }

  return <section className="admin-agent-keys">
    <h2>工具密钥</h2>
    <p>供 Codex 或其他写作工具读文章、保存草稿与上传配图。可填写作者署名，留空默认站长；发布需在文章管理中完成。</p>
    <p>接口地址：<code>https://ziyuexi.top/api/agent/v1</code></p>
    <form className="admin-agent-key-form" onSubmit={(event) => { event.preventDefault(); void create(); }}>
      <label>用途名称<input required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：我的 Codex" /></label>
      <button type="submit" className="primary-action" disabled={busy || !name.trim()}>创建密钥</button>
    </form>
    {token && <div role="status" className="admin-agent-key-secret">
      <p>密钥仅显示这一次，请保存到工具的私密配置中。</p>
      <textarea aria-label="新建工具密钥" readOnly value={token} onFocus={(event) => event.target.select()} />
      <button type="button" className="secondary-action" onClick={() => setToken('')}>已保存，隐藏密钥</button>
    </div>}
    {notice && <p role="alert">{notice}</p>}
    <ul className="admin-agent-key-list">{keys.map((key) => <li key={key.id}>
      <div><strong>{key.name}</strong> <code>{key.prefix}…</code>
        <p>{key.revoked_at ? '已停用' : '可用'} · 最近调用：{key.last_used_at || '尚未使用'}</p></div>
      {!key.revoked_at && <button type="button" className="secondary-action" disabled={busy} onClick={() => void revoke(key.id)}>停用</button>}
    </li>)}</ul>
    <h3>最近调用</h3>
    <button type="button" className="secondary-action" disabled={busy} onClick={() => void refresh().catch(() => setNotice('刷新失败，请重试。'))}>刷新记录</button>
    <ul className="admin-agent-key-list">{audit.map((item) => <li key={item.id}>
      <div><strong>{item.name}</strong> · {item.method} <code>{item.path}</code><p>{item.status} · {item.created_at}</p></div>
    </li>)}</ul>
  </section>;
}
