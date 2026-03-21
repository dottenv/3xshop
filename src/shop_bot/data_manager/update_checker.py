import subprocess
import logging
import json
from datetime import datetime
from pathlib import Path

logger = logging.getLogger(__name__)

# Путь к проекту
PROJECT_ROOT = Path("/app/project")
GIT_DIR = PROJECT_ROOT / ".git"


def check_git_available() -> bool:
    """Проверка наличия git и git директории."""
    try:
        if not GIT_DIR.exists():
            logger.debug("Git директория не найдена")
            return False
        
        result = subprocess.run(
            ["git", "--version"],
            capture_output=True,
            text=True,
            timeout=5,
            cwd=PROJECT_ROOT
        )
        return result.returncode == 0
    except FileNotFoundError:
        logger.debug("Git не установлен в системе")
        return False
    except Exception as e:
        logger.debug(f"Ошибка проверки git: {e}")
        return False


def get_current_version() -> str | None:
    """Получить текущую версию (commit hash или tag)."""
    try:
        result = subprocess.run(
            ["git", "describe", "--tags", "--always", "--abbrev=0"],
            capture_output=True,
            text=True,
            timeout=5,
            cwd=PROJECT_ROOT
        )
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip()
        
        # Fallback: используем commit hash
        result = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            capture_output=True,
            text=True,
            timeout=5,
            cwd=PROJECT_ROOT
        )
        if result.returncode == 0:
            return result.stdout.strip()
        
        return None
    except Exception as e:
        logger.error(f"Ошибка получения текущей версии: {e}")
        return None


def get_latest_remote_version() -> str | None:
    """Получить последнюю версию из remote."""
    try:
        # Fetch обновления
        subprocess.run(
            ["git", "fetch", "--tags", "--quiet"],
            capture_output=True,
            timeout=30,
            cwd=PROJECT_ROOT
        )
        
        # Получаем последний tag
        result = subprocess.run(
            ["git", "describe", "--tags", "--abbrev=0", "origin/main"],
            capture_output=True,
            text=True,
            timeout=5,
            cwd=PROJECT_ROOT
        )
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip()
        
        # Fallback: используем последний commit
        result = subprocess.run(
            ["git", "rev-parse", "--short", "origin/main"],
            capture_output=True,
            text=True,
            timeout=5,
            cwd=PROJECT_ROOT
        )
        if result.returncode == 0:
            return result.stdout.strip()
        
        return None
    except Exception as e:
        logger.error(f"Ошибка получения удалённой версии: {e}")
        return None


def get_commit_count_behind() -> int:
    """Получить количество коммитов, на которые отстаём."""
    try:
        result = subprocess.run(
            ["git", "rev-list", "--count", "HEAD..origin/main"],
            capture_output=True,
            text=True,
            timeout=10,
            cwd=PROJECT_ROOT
        )
        if result.returncode == 0:
            try:
                return int(result.stdout.strip())
            except ValueError:
                pass
        return 0
    except Exception as e:
        logger.error(f"Ошибка подсчёта отставания: {e}")
        return 0


def get_changelog_behind() -> list[dict]:
    """Получить список коммитов, которые мы пропустили."""
    try:
        result = subprocess.run(
            ["git", "log", "HEAD..origin/main", "--pretty=format:%H|%an|%ar|%s", "--max-count=10"],
            capture_output=True,
            text=True,
            timeout=10,
            cwd=PROJECT_ROOT
        )
        if result.returncode == 0:
            commits = []
            for line in result.stdout.strip().split("\n"):
                if line:
                    parts = line.split("|", 3)
                    if len(parts) == 4:
                        commits.append({
                            "hash": parts[0][:8],
                            "author": parts[1],
                            "date": parts[2],
                            "message": parts[3]
                        })
            return commits
        return []
    except Exception as e:
        logger.error(f"Ошибка получения changelog: {e}")
        return []


def check_updates_available() -> dict:
    """
    Проверить наличие обновлений.
    Возвращает словарь с информацией об обновлениях.
    """
    if not check_git_available():
        logger.debug("Git недоступен для проверки обновлений")
        return {
            "available": False,
            "error": "Git недоступен или проект не является git репозиторием",
            "current_version": None,
            "latest_version": None,
            "commits_behind": 0,
            "changelog": []
        }
    
    try:
        current_version = get_current_version()
        latest_version = get_latest_remote_version()
        commits_behind = get_commit_count_behind()
        changelog = get_changelog_behind() if commits_behind > 0 else []
        
        logger.debug(f"Update check: current={current_version}, latest={latest_version}, commits_behind={commits_behind}")
        
        # Обновление доступно только если есть отставание по коммитам
        available = commits_behind > 0
        
        logger.info(f"Update available: {available} (commits_behind={commits_behind})")
        
        return {
            "available": available,
            "error": None,
            "current_version": current_version,
            "latest_version": latest_version,
            "commits_behind": commits_behind,
            "changelog": changelog,
            "checked_at": datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"Ошибка проверки обновлений: {e}", exc_info=True)
        return {
            "available": False,
            "error": str(e),
            "current_version": None,
            "latest_version": None,
            "commits_behind": 0,
            "changelog": []
        }


def perform_update() -> dict:
    """
    Выполнить обновление через git pull.
    Возвращает результат операции.
    """
    if not check_git_available():
        return {
            "success": False,
            "error": "Git недоступен"
        }
    
    try:
        # Проверяем наличие локальных изменений
        result = subprocess.run(
            ["git", "status", "--porcelain"],
            capture_output=True,
            text=True,
            timeout=5,
            cwd=PROJECT_ROOT
        )
        
        has_changes = bool(result.stdout.strip())
        
        if has_changes:
            # Сохраняем локальные изменения
            subprocess.run(
                ["git", "stash", "push", "-m", "Auto-stash before update"],
                capture_output=True,
                timeout=10,
                cwd=PROJECT_ROOT
            )
        
        # Выполняем pull
        result = subprocess.run(
            ["git", "pull", "--ff-only"],
            capture_output=True,
            text=True,
            timeout=60,
            cwd=PROJECT_ROOT
        )
        
        success = result.returncode == 0
        
        if success and has_changes:
            # Восстанавливаем локальные изменения
            subprocess.run(
                ["git", "stash", "pop"],
                capture_output=True,
                timeout=10,
                cwd=PROJECT_ROOT
            )
        
        new_version = get_current_version() if success else None
        
        return {
            "success": success,
            "error": result.stderr if result.returncode != 0 else None,
            "output": result.stdout,
            "new_version": new_version,
            "updated_at": datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"Ошибка выполнения обновления: {e}", exc_info=True)
        return {
            "success": False,
            "error": str(e),
            "output": None,
            "new_version": None,
            "updated_at": datetime.now().isoformat()
        }
