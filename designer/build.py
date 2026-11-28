"""Build the self-contained AES editor using only the Python standard library."""
import re
import sys
from pathlib import Path

root = Path(__file__).resolve().parent
output = Path(sys.argv[1]) if len(sys.argv) > 1 else root.parent / "dist" / "index.html"
source = (root / "vendor/html_dbms-core.js").read_text(encoding="utf-8")
core, count = re.subn(r"\nexport \{[^{}]+\};\s*\Z", """
return {newStore, createDatabase, commit, snapshot, adoptStore, openDatabase};
""", source)
if count != 1:
    raise ValueError("Unexpected HTML_DBMS core exports")
pieces = {
    "STYLE": (root / "design.css").read_text(encoding="utf-8"),
    "CORE": "const AESDB = (() => {\n" + core + "})();",
    "MODEL": (root / "model.js").read_text(encoding="utf-8"),
    "ENGINEERING": (root / "engineering.js").read_text(encoding="utf-8"),
    "PHYSICAL": (root / "physical-ui.js").read_text(encoding="utf-8"),
    "ORTHO": (root / "ortho.js").read_text(encoding="utf-8"),
    "DIAGRAM": (root / "diagram.js").read_text(encoding="utf-8"),
    "WIRING": (root / "wiring.js").read_text(encoding="utf-8"),
    "OVERVIEW": (root / "overview.js").read_text(encoding="utf-8"),
    "UI": (root / "editor.js").read_text(encoding="utf-8"),
}
html = (root / "shell.html").read_text(encoding="utf-8")
for name, value in pieces.items():
    if name != "STYLE" and "</script" in value.lower():
        raise ValueError("Unescaped script terminator")
    html = html.replace("/*{{" + name + "}}*/", value)
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(html, encoding="utf-8")
