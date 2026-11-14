"""Build the reading experience. Events come from the Google Sheet at runtime, with a built-in snapshot as fallback."""
from pathlib import Path
import json
import shutil


def seed_apps_script(here, snapshot):
    """Keep the starter events inside sheet/Code.gs identical to the built-in snapshot."""
    target = here.parent / "sheet" / "Code.gs"
    if not target.is_file():
        return
    code = target.read_text(encoding="utf-8")
    start, end = "/*SEED_START*/", "/*SEED_END*/"
    assert start in code and end in code, "Seed markers missing in sheet/Code.gs"
    seeded = code[: code.index(start) + len(start)] + json.dumps(snapshot["events"], ensure_ascii=False) + code[code.index(end):]
    if seeded != code:
        target.write_text(seeded, encoding="utf-8", newline="\n")


def build_reader(out):
    here = Path(__file__).resolve().parent
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    read = lambda p: (here / p).read_text(encoding="utf-8")
    encode = lambda value: json.dumps(value, ensure_ascii=False).replace("</", "<\\/")
    raw = json.loads(read("data.json"))
    snapshot = json.loads(read("sheet-snapshot.json"))
    assert snapshot["events"], "The built-in snapshot must contain events."
    config = json.loads(read("site-config.json"))
    media = json.loads(read("reader-media.json"))
    for item in media["items"]:
        source = here / item["src"]
        assert source.is_file(), f"Missing media: {source}"
    seed_apps_script(here, snapshot)
    # Data and the sheet loader run first; everything that depends on events runs in boot(SHEET).
    scripts = (
        read("data.js").replace("/*__DATA__*/", encode(raw))
        + "\nconst PHOTOS = [], INTERVIEWS = [];\n"
        + read("src-reader/02-sheet.js")
        + "\nconst SITE_CONFIG = " + encode(config) + ";\nconst SHEET_SNAPSHOT = " + encode(snapshot) + ";\n"
        + "function boot(SHEET){\n"
        + read("events-base.js")
        + "\nconst READER_MEDIA = " + encode(media) + ";\n"
        + read("src-reader/05-model.js")
        + read("src-reader/20-reader.js")
        + "\n}\n"
        + """SheetData.load(SITE_CONFIG, SHEET_SNAPSHOT, NEWS.length).then(data => {
  try { boot(data); document.documentElement.classList.remove('sheet-loading'); }
  catch (error) {
    // Unexpected sheet content must never leave visitors with a blank page.
    if (data.origin !== 'snapshot' && SheetData.distrust()) location.reload();
    else { document.documentElement.classList.remove('sheet-loading'); throw error; }
  }
});
"""
    )
    assert "</script" not in scripts.lower()
    html = """<!doctype html>
<html lang="zh-Hant-TW" class="sheet-loading"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<meta name="description" content="智能障礙歷史精選事件，結合 738 篇剪報、研究與人數資料。選擇範圍後沿時間閱讀。">
<title>智能障礙歷史年表</title>
<link rel="icon" href="icon.svg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@500;600&family=Noto+Sans+TC:wght@400;500;600&display=swap" rel="stylesheet">
<style>""" + read("src-reader/style.css") + "</style></head><body>\n"
    html += '<noscript><style>html.sheet-loading main{visibility:visible}html.sheet-loading body::after{content:none}</style><p>請開啟 JavaScript 以使用篩選與年表。原始資料與整理方式也可在本網站的 README 閱讀。</p></noscript>\n'
    html += read("src-reader/body.html") + "\n<script>\n" + scripts + "\n</script></body></html>\n"
    (out / "index.html").write_text(html, encoding="utf-8", newline="\n")
    (out / "assets").mkdir(exist_ok=True)
    icon = here.parent / 'icon.svg'
    if icon.resolve() != (out / 'icon.svg').resolve():
        shutil.copyfile(icon, out / 'icon.svg')
    for item in media["items"]:
        shutil.copyfile(here / item["src"], out / item["src"])
    print(f"Reader: {len(snapshot['events'])} built-in events, {len(raw['news'])} clippings; media copied.")


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default=str(Path(__file__).resolve().parent.parent))
    build_reader(parser.parse_args().out)
