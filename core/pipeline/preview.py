"""Office → PDF preview conversion using LibreOffice (already a system dep for LiteParse).

Converts non-native-browser files (Word, Excel, PPT) to PDF and caches them
in data/preview_cache/ for instant preview serving.
"""
from __future__ import annotations

import platform
import shutil
import subprocess
import tempfile
from pathlib import Path

from core.logger import get_logger

logger = get_logger(__name__)

# Preview cache lives in project data/ dir (safe to write per AGENTS.md §四)
PREVIEW_CACHE_DIR = Path(__file__).resolve().parent.parent / "data" / "preview_cache"

# Extensions that need LibreOffice conversion for preview
_OFFICE_EXTS = frozenset({
    ".doc", ".docx", ".docm", ".odt", ".rtf",
    ".xls", ".xlsx", ".xlsm", ".ods",
    ".ppt", ".pptx", ".pptm", ".odp",
    ".csv", ".tsv",
})

# Extensions that browsers can display natively
_NATIVE_EXTS = frozenset({
    ".pdf",
    ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg", ".tif", ".tiff",
    ".txt", ".md", ".html", ".htm",
})


def needs_conversion(file_path: Path) -> bool:
    """Return True if the file needs LibreOffice conversion for preview."""
    ext = file_path.suffix.lower()
    return ext not in _NATIVE_EXTS


def get_cached_preview_path(file_id: str) -> Path:
    """Return the expected path for a cached preview PDF."""
    return PREVIEW_CACHE_DIR / f"{file_id}.pdf"


def _find_soffice() -> str:
    """Locate the LibreOffice binary (cross-platform)."""
    if platform.system() == "Windows":
        candidates = [
            Path(r"C:\Program Files\LibreOffice\program\soffice.exe"),
            Path(r"C:\Program Files (x86)\LibreOffice\program\soffice.exe"),
        ]
        for c in candidates:
            if c.exists():
                return str(c)
        # Fallback to PATH
        if shutil.which("soffice"):
            return "soffice"
        raise FileNotFoundError("LibreOffice not found. Install it for preview conversion.")

    # macOS / Linux
    for cmd in ("soffice", "libreoffice"):
        if shutil.which(cmd):
            return cmd
    raise FileNotFoundError("LibreOffice not found. Install it for preview conversion.")


def convert_to_preview_pdf(file_path: Path, file_id: str) -> Path | None:
    """Convert a file to PDF using LibreOffice and cache it.

    Args:
        file_path: Absolute path to the source file.
        file_id: Unique file ID for cache key.

    Returns:
        Path to the cached PDF, or None if conversion failed.
    """
    cached = get_cached_preview_path(file_id)
    if cached.exists():
        logger.debug("Preview cache hit: %s", cached)
        return cached

    PREVIEW_CACHE_DIR.mkdir(parents=True, exist_ok=True)

    try:
        soffice = _find_soffice()
    except FileNotFoundError as e:
        logger.warning("Preview conversion skipped: %s", e)
        return None

    # LibreOffice requires a unique temp dir per conversion to avoid lock conflicts
    with tempfile.TemporaryDirectory() as tmp_dir:
        try:
            cmd = [
                soffice,
                "--headless",
                "--norestore",
                "--convert-to", "pdf",
                "--outdir", tmp_dir,
                str(file_path),
            ]
            result = subprocess.run(
                cmd,
                timeout=60,
                capture_output=True,
                text=True,
            )
            if result.returncode != 0:
                logger.error("soffice conversion failed: %s", result.stderr)
                return None

            # Find the generated PDF (LibreOffice names it same stem + .pdf)
            generated = Path(tmp_dir) / (file_path.stem + ".pdf")
            if not generated.exists():
                # Sometimes soffice changes the name slightly
                pdfs = list(Path(tmp_dir).glob("*.pdf"))
                if pdfs:
                    generated = pdfs[0]
                else:
                    logger.error("No PDF generated in %s", tmp_dir)
                    return None

            # Move to cache
            shutil.move(str(generated), str(cached))
            logger.info("Preview PDF cached: %s → %s", file_path.name, cached)
            return cached

        except subprocess.TimeoutExpired:
            logger.error("soffice conversion timed out for %s", file_path.name)
            return None
        except Exception as e:
            logger.error("Preview conversion error: %s", e)
            return None
