# almanac.py

> 源路径：`server_py/almanac.py`
> 总行数：约 63 行

调用外部 cnlunar 子进程生成"今日黄历"（农历、节气、干支、宜忌等），结果按日期缓存。

## 文件概览

`almanac.py` 是 `/api/site` 中 `almanac` 字段的来源。它本身**不包含**农历计算逻辑，而是把日期作为参数交给独立的 Python 脚本 `server/scripts/cnlunar_almanac.py`（依赖 `cnlunar` 库）执行，再把标准输出解析成 JSON。这样做的好处是：

- 把 cnlunar 这个第三方依赖隔离在一个子进程里，主进程即便它崩溃/超时也不会受影响。
- cnlunar 启动开销较大，每次 `/api/site` 都跑一遍不划算，因此按日期缓存。

`get_today_almanac()` 是入口，`app.py` 拼装 `site` 响应时会调用它。

## 按日期缓存

```python
_cache: dict[str, Any] | None = None

def get_today_almanac() -> dict[str, Any]:
    return get_almanac(datetime.now().strftime("%Y-%m-%d"))

def get_almanac(date: str) -> dict[str, Any]:
    global _cache
    if _cache and _cache.get("date") == date:
        return _cache["payload"]
    ...
```

缓存是模块级单元素：只保留"最近一次查询日期"的结果。`/api/site` 在同一天会被反复请求，所以这样的缓存命中率非常高，又能跨日自动失效（日期变了就重新拉子进程）。不需要任何 TTL 复杂度。

## 子进程调用

```python
script_path = Path(SERVER_DIR / "scripts" / "cnlunar_almanac.py")
env = {**os.environ, "PYTHONIOENCODING": "utf-8", "PYTHONUTF8": "1"}
result = subprocess.run(
    [config.python_command, str(script_path), date],
    capture_output=True,
    text=True,
    encoding="utf-8",
    env=env,
    timeout=config.almanac_timeout_ms / 1000,
    check=True,
)
```

- `python_command` 来自 `config.py`（可以被环境变量覆盖），让虚拟环境/特定 Python 解释器都能复用。
- 强制 `PYTHONIOENCODING=utf-8` 和 `PYTHONUTF8=1`，避免 Windows 默认 GBK 编码导致中文节气名乱码。
- `timeout` 来自 `config.almanac_timeout_ms`（默认 3 秒），超时会抛 `TimeoutExpired`，`app.py` 会捕获并降级。
- `check=True` 让子进程返回非零退出码时直接抛错。

## 字段标准化

```python
def _normalize_almanac(value: dict[str, Any]) -> dict[str, Any]:
    return {
        "date": _text(value.get("date")),
        "weekDay": _text(value.get("weekDay")),
        "lunarYear": _text(value.get("lunarYear")),
        ...
        "goodThings": [_text(item) for item in value.get("goodThings", []) if _text(item)],
        "badThings": [_text(item) for item in value.get("badThings", []) if _text(item)],
        "source": "cnlunar",
    }
```

把子进程返回的 JSON 重塑成前端期望的固定 schema：所有字段都是字符串（缺失变 `""`），宜忌是字符串数组，并强制带上 `"source": "cnlunar"`，方便前端在数据缺失时知道数据源。

`_text()` 把任意值规范成字符串，避免 `None`/数字进入响应。这层标准化同时起到了"防御 cnlunar 输出不稳定"的作用。

## 备注

- 这里没有重试逻辑：如果子进程失败，调用方（`app.py`）会捕获异常，把 `almanac` 字段返回成空对象或 fallback。
- 因为是按日期全局缓存，所以测试时如果想强制刷新，需要重置模块级 `_cache`，或重启进程。
