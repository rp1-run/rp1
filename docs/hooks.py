"""MkDocs hooks for rp1 documentation build."""

import shutil
from pathlib import Path


def on_post_build(config, **kwargs):
    """Copy install.sh to site root after build completes."""
    repo_root = Path(config["docs_dir"]).parent
    source = repo_root / "scripts" / "install.sh"
    dest = Path(config["site_dir"]) / "install.sh"

    if source.exists():
        shutil.copy2(source, dest)
        print(f"Copied {source} -> {dest}")
    else:
        print(f"Warning: {source} not found, skipping install.sh copy")
