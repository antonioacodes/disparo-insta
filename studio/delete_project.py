import json
import re
import shutil
from pathlib import Path


def remove_path(path):
    if path.is_symlink() or not path.is_dir():
        path.unlink(missing_ok=True)
    else:
        shutil.rmtree(path)


def delete_project(db, work, project):
    if not re.fullmatch(r"[a-f0-9]{32}", project):
        raise ValueError("Projeto inválido")
    db.execute("BEGIN IMMEDIATE")
    try:
        row = db.execute("SELECT media FROM projects WHERE id=?", (project,)).fetchone()
        if row is None:
            db.commit()
            return
        media = row[0]
        if not re.fullmatch(r"[\w.-]+", media) or media in (".", ".."):
            raise ValueError("Arquivo de origem inválido")

        # The single worker finishes its current render before processing this job.
        entities = "(SELECT id FROM clips WHERE project=?)"
        active = db.execute("SELECT 1 FROM jobs WHERE state='running' AND kind!='purge' "
                            f"AND (entity=? OR entity IN {entities})", (project, project)).fetchone()
        if active:
            db.execute("INSERT OR IGNORE INTO jobs(kind,entity) VALUES('purge',?)", (project,))
            db.commit()
            return

        remove_path(work / project)
        shared = db.execute("SELECT 1 FROM projects WHERE media=? AND id!=?", (media,project)).fetchone()
        if not shared:
            root = work.parent
            remove_path(root / "media" / media)
            remove_path(root / "transcripts" / media)
            meta = root / "media-meta" / (media.split("-")[0] + ".json")
            if meta.is_file() and json.loads(meta.read_text()).get("media", {}).get("id") == media:
                remove_path(meta)
            renders = root / "renders"
            if renders.is_dir():
                pattern = re.compile(r"\d+-" + re.escape(Path(media).stem) + r"-(horizontal|vertical)\.mp4")
                for file in renders.iterdir():
                    if pattern.fullmatch(file.name):
                        remove_path(file)

        db.execute(f"DELETE FROM jobs WHERE entity=? OR entity IN {entities}", (project,project))
        for table in ("audience","preview_cache","caption_edits"):
            db.execute(f"DELETE FROM {table} WHERE clip IN {entities}", (project,))
        db.execute(f"DELETE FROM revisions WHERE id IN {entities}", (project,))
        for table in ("clips","presets","media_info","link_sources"):
            db.execute(f"DELETE FROM {table} WHERE project=?", (project,))
        db.execute("DELETE FROM projects WHERE id=?", (project,))
        db.commit()
    except BaseException:
        db.rollback()
        raise
