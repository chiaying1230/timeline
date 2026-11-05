"""Build the agreed 50-event reading experience from the existing source data."""
from pathlib import Path
import json
import shutil


def build_reader(out):
    here = Path(__file__).resolve().parent
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    read = lambda p: (here / p).read_text(encoding="utf-8")
    encode = lambda value: json.dumps(value, ensure_ascii=False).replace("</", "<\\/")
    raw = json.loads(read("data.json"))
    picked = json.loads(read("events.json"))
    assert len(picked) == 32, "The selected timeline must retain exactly 50 events."
    media = json.loads(read("reader-media.json"))
    for item in media["items"]:
        source = here / item["src"]
        assert source.is_file(), f"Missing media: {source}"
    scripts = (
        read("data.js").replace("/*__DATA__*/", encode(raw))
        + "\nconst PHOTOS = [], INTERVIEWS = [];\n"
        + read("events-base.js").replace("/*__EVENTS__*/", encode(picked))
        + read("easy.js")
        + "\nconst READER_MEDIA = " + encode(media) + ";\n"
        + read("src-reader/05-model.js")
        + read("src-reader/20-reader.js")
    )
    assert "</script" not in scripts.lower()
    html = """<!doctype html>
<html lang="zh-Hant-TW"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<meta name="description" content="50 件智能障礙歷史精選事件，結合 738 篇剪報、研究與人數資料。選擇範圍後沿時間閱讀。">
<title>智能障礙歷史年表</title>
<link rel="icon" href="icon.svg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@500;600&family=Noto+Sans+TC:wght@400;500;600&display=swap" rel="stylesheet">
<style>""" + read("src-reader/style.css") + "</style></head><body>\n"
    html += '<noscript><p>請開啟 JavaScript 以使用篩選與年表。原始資料與整理方式也可在本網站的 README 閱讀。</p></noscript>\n'
    html += read("src-reader/body.html") + "\n<script>\n" + scripts + "\n</script></body></html>\n"
    (out / "index.html").write_text(html, encoding="utf-8", newline="\n")
    (out / "assets").mkdir(exist_ok=True)
    icon = here.parent / 'icon.svg'
    if icon.resolve() != (out / 'icon.svg').resolve():
        shutil.copyfile(icon, out / 'icon.svg')
    for item in media["items"]:
        shutil.copyfile(here / item["src"], out / item["src"])
    print("Reader: 50 selected events, 738 clippings; media copied.")


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default=str(Path(__file__).resolve().parent.parent))
    build_reader(parser.parse_args().out)
