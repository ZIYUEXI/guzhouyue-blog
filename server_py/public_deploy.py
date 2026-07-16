from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
import threading
import uuid
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from .config import ROOT_DIR
from .export_public_snapshot import main as export_public_snapshot


DEPLOY_REPO_DEFAULT = "https://github.com/ZIYUEXI/guzhouyue-blog-deploy.git"
DEPLOY_BRANCH_DEFAULT = "main"
deploy_tasks: dict[str, dict[str, Any]] = {}
deploy_tasks_lock = threading.Lock()


class PublicDeployError(RuntimeError):
    pass


def start_public_deploy_task() -> dict[str, Any]:
    task_id = f"deploy_{uuid.uuid4().hex[:12]}"
    task = {
        "id": task_id,
        "status": "pending",
        "createdAt": _now_iso(),
        "updatedAt": _now_iso(),
        "logs": ["任务已创建，等待后台发布。"],
        "result": None,
        "error": "",
    }
    with deploy_tasks_lock:
        deploy_tasks[task_id] = task

    thread = threading.Thread(target=_run_public_deploy_task, args=(task_id,), daemon=True)
    thread.start()
    return _public_task_payload(task_id)


def get_public_deploy_task(task_id: str) -> dict[str, Any] | None:
    return _public_task_payload(task_id)


def _run_public_deploy_task(task_id: str) -> None:
    _update_task(task_id, status="running", log="后台发布已开始。")
    try:
        result = publish_public_snapshot(lambda line: _append_task_log(task_id, line))
        _update_task(task_id, status="succeeded", result=result, log=result["message"])
    except Exception as error:
        _update_task(task_id, status="failed", error=str(error), log=f"发布失败：{error}")


def publish_public_snapshot(log: Callable[[str], None] | None = None) -> dict[str, Any]:
    deploy_repo = os.environ.get("PUBLIC_DEPLOY_REPO", DEPLOY_REPO_DEFAULT)
    deploy_branch = os.environ.get("PUBLIC_DEPLOY_BRANCH", DEPLOY_BRANCH_DEFAULT)
    git_author_name = os.environ.get("PUBLIC_DEPLOY_GIT_NAME", "Guzhouyue Deploy Bot")
    git_author_email = os.environ.get("PUBLIC_DEPLOY_GIT_EMAIL", "deploy@guzhouyue.local")

    _log(log, "开始导出公开快照。")
    export_public_snapshot()
    _log(log, "公开快照导出完成。")

    public_root = ROOT_DIR / "public"
    snapshot_data = public_root / "data"
    snapshot_gallery = public_root / "uploads" / "gallery"
    if not snapshot_data.exists():
        raise PublicDeployError(f"Export did not create snapshot data: {snapshot_data}")

    with tempfile.TemporaryDirectory(prefix="guzhouyue-public-deploy-") as temp_dir:
        git_env = _git_env(Path(temp_dir))
        worktree = _prepare_worktree(deploy_repo, deploy_branch, git_env, log)
        _run(["git", "config", "user.name", git_author_name], cwd=worktree, env=git_env, log=log)
        _run(["git", "config", "user.email", git_author_email], cwd=worktree, env=git_env, log=log)
        _run(["git", "fetch", "--progress", "origin", deploy_branch], cwd=worktree, env=git_env, log=log)
        _run(["git", "reset", "--hard", f"origin/{deploy_branch}"], cwd=worktree, env=git_env, log=log)

        _log(log, "复制 data/ 快照。")
        _copy_tree(snapshot_data, worktree / "data")
        if snapshot_gallery.exists():
            _log(log, "复制 uploads/gallery/ 上传图片。")
            _copy_tree(snapshot_gallery, worktree / "uploads" / "gallery")

        _run(["git", "add", "--all", "data", "uploads/gallery"], cwd=worktree, env=git_env, log=log)
        changed = _run(["git", "status", "--short", "--", "data", "uploads/gallery"], cwd=worktree, capture=True, env=git_env, log=log).stdout.strip()
        if not changed:
            commit = _run(["git", "rev-parse", "--short", "HEAD"], cwd=worktree, capture=True, env=git_env, log=log).stdout.strip()
            return {
                "ok": True,
                "changed": False,
                "message": "公开快照没有变化，无需推送。",
                "branch": deploy_branch,
                "repo": deploy_repo,
                "commit": commit,
            }

        commit_message = os.environ.get("PUBLIC_DEPLOY_COMMIT_MESSAGE", "Publish public snapshot from admin")
        _run(["git", "commit", "-m", commit_message], cwd=worktree, env=git_env, log=log)
        _run(["git", "push", "--progress", "origin", deploy_branch], cwd=worktree, env=git_env, log=log)
        commit = _run(["git", "rev-parse", "--short", "HEAD"], cwd=worktree, capture=True, env=git_env, log=log).stdout.strip()

    return {
        "ok": True,
        "changed": True,
        "message": "公开快照已推送，Cloudflare Pages 会自动重新部署。",
        "branch": deploy_branch,
        "repo": deploy_repo,
        "commit": commit,
    }


def _prepare_worktree(deploy_repo: str, deploy_branch: str, git_env: dict[str, str] | None, log: Callable[[str], None] | None) -> Path:
    configured_worktree = os.environ.get("PUBLIC_DEPLOY_WORKTREE")
    if configured_worktree:
        worktree = Path(configured_worktree)
        if (worktree / ".git").exists():
            _log(log, f"使用长期部署工作区：{worktree}")
            return worktree
        worktree.parent.mkdir(parents=True, exist_ok=True)
        _log(log, f"初始化长期部署工作区：{worktree}")
        _run(["git", "clone", "--progress", "--branch", deploy_branch, "--single-branch", deploy_repo, str(worktree)], env=git_env, log=log)
        return worktree

    worktree = Path(tempfile.mkdtemp(prefix="guzhouyue-public-deploy-repo-"))
    _log(log, f"准备临时部署仓库：{deploy_repo} ({deploy_branch})")
    _run(["git", "clone", "--progress", "--depth", "1", "--branch", deploy_branch, "--single-branch", deploy_repo, str(worktree)], env=git_env, log=log)
    return worktree


def _copy_tree(source: Path, target: Path) -> None:
    if target.exists():
        shutil.rmtree(target)
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(source, target)


def _git_env(temp_dir: Path) -> dict[str, str] | None:
    env = {**os.environ, "GIT_TERMINAL_PROMPT": "0"}
    ssh_config = os.environ.get("PUBLIC_DEPLOY_SSH_CONFIG")
    if ssh_config:
        env["GIT_SSH_COMMAND"] = f"ssh -F {ssh_config}"

    token = os.environ.get("PUBLIC_DEPLOY_GITHUB_TOKEN")
    if not token:
        return env

    username = os.environ.get("PUBLIC_DEPLOY_GITHUB_USER", "x-access-token")
    askpass = temp_dir / "git-askpass.sh"
    askpass.write_text(
        "\n".join(
            [
                "#!/bin/sh",
                'case "$1" in',
                '  *Username*) printf "%s\\n" "$PUBLIC_DEPLOY_GITHUB_USER" ;;',
                '  *) printf "%s\\n" "$PUBLIC_DEPLOY_GITHUB_TOKEN" ;;',
                "esac",
                "",
            ]
        ),
        encoding="utf-8",
    )
    askpass.chmod(0o700)

    return {
        **env,
        "GIT_ASKPASS": str(askpass),
        "PUBLIC_DEPLOY_GITHUB_USER": username,
        "PUBLIC_DEPLOY_GITHUB_TOKEN": token,
    }


def _run(
    args: list[str],
    cwd: Path | None = None,
    capture: bool = False,
    env: dict[str, str] | None = None,
    log: Callable[[str], None] | None = None,
) -> subprocess.CompletedProcess[str]:
    _log(log, f"$ {_format_command(args)}")
    timeout_seconds = int(os.environ.get("PUBLIC_DEPLOY_GIT_TIMEOUT_SECONDS", "240"))
    try:
        process = subprocess.Popen(
            args,
            cwd=cwd,
            text=True,
            encoding="utf-8",
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
        )
        output_lines: list[str] = []
        started_at = time.monotonic()
        assert process.stdout is not None
        while True:
            line = process.stdout.readline()
            if line:
                clean_line = line.rstrip("\n")
                output_lines.append(clean_line)
                _log(log, clean_line)
            if process.poll() is not None:
                remainder = process.stdout.read()
                if remainder:
                    for clean_line in remainder.splitlines():
                        output_lines.append(clean_line)
                        _log(log, clean_line)
                break
            if time.monotonic() - started_at > timeout_seconds:
                process.kill()
                raise PublicDeployError(f"{_format_command(args)} timed out after {timeout_seconds} seconds")

        stdout = "\n".join(output_lines)
        if process.returncode != 0:
            raise subprocess.CalledProcessError(process.returncode or 1, args, output=stdout, stderr=stdout)
        return subprocess.CompletedProcess(args=args, returncode=process.returncode or 0, stdout=stdout, stderr="")
    except FileNotFoundError as error:
        raise PublicDeployError(f"Command not found: {args[0]}") from error
    except subprocess.CalledProcessError as error:
        _log_stream(log, error.stdout)
        _log_stream(log, error.stderr)
        details = (error.stderr or error.stdout or "").strip()
        command = " ".join(args)
        raise PublicDeployError(f"{command} failed{': ' + details if details else ''}") from error


def _format_command(args: list[str]) -> str:
    return " ".join(args)


def _log(log: Callable[[str], None] | None, line: str) -> None:
    if log:
        log(line)


def _log_stream(log: Callable[[str], None] | None, value: str | None) -> None:
    if not log or not value:
        return
    for line in value.splitlines():
        log(line)


def _append_task_log(task_id: str, line: str) -> None:
    with deploy_tasks_lock:
        task = deploy_tasks.get(task_id)
        if not task:
            return
        task["logs"].append(line)
        task["updatedAt"] = _now_iso()


def _update_task(
    task_id: str,
    *,
    status: str | None = None,
    result: dict[str, Any] | None = None,
    error: str | None = None,
    log: str | None = None,
) -> None:
    with deploy_tasks_lock:
        task = deploy_tasks.get(task_id)
        if not task:
            return
        if status:
            task["status"] = status
        if result is not None:
            task["result"] = result
        if error is not None:
            task["error"] = error
        if log:
            task["logs"].append(log)
        task["updatedAt"] = _now_iso()


def _public_task_payload(task_id: str) -> dict[str, Any] | None:
    with deploy_tasks_lock:
        task = deploy_tasks.get(task_id)
        if not task:
            return None
        return {
            **task,
            "logs": list(task["logs"]),
            "result": dict(task["result"]) if isinstance(task["result"], dict) else task["result"],
        }


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
