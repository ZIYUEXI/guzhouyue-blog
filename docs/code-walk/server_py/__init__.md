# __init__.py

> 源路径：`server_py/__init__.py`
> 总行数：约 1 行

把 `server_py/` 标记为可被 `python -m server_py.xxx` 导入的 Python 包。

## 文件概览

这个文件几乎是空的，只有一行包级文档字符串。它存在的唯一意义是让 Python 把 `server_py/` 识别为一个普通包（regular package），从而支撑仓库根目录下 `package.json` 里的脚本：

```json
"dev:server": "python -m server_py.app",
"seed:server": "python -m server_py.seed",
"seed:test-articles": "python -m server_py.seed_test_articles",
"test:server": "python -m server_py.smoke_test && python -m server_py.compat_test"
```

没有这个文件，`python -m server_py.app` 会因为找不到包而失败。其余子模块都使用 `from .config import ...` 之类的相对导入，相对导入同样依赖包的标识。

## 内容

```python
"""Python backend for Guzhouyue Blog."""
```

包文档字符串只声明这是 Guzhouyue Blog 的 Python 后端。除此之外没有任何可执行语句，也不会触发任何副作用。

## 备注

- 项目没有引入命名空间包或 `src/` 布局，因此 `server_py/__init__.py` 必须保持极简，避免在 import 阶段意外执行重逻辑（否则 `from .app import app` 这类引用会变得难以预测）。
- 想新增子模块（例如 `server_py/foo.py`）时直接放在同目录即可；不需要在这里显式声明。
