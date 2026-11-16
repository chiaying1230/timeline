"""Optional: copy the live Google Sheet into the built-in snapshot (the fallback visitors see if the sheet is unreachable).
Run before an exhibition opens, then rebuild:  python source/sync_sheet.py && python source/build.py"""
from pathlib import Path
from urllib.parse import quote
from urllib.request import urlopen
import csv
import io
import json

here = Path(__file__).resolve().parent


def fetch(sheet_id, name, required):
    url = f"https://docs.google.com/spreadsheets/d/{quote(sheet_id)}/gviz/tq?tqx=out:csv&headers=1&sheet={quote(name)}"
    with urlopen(url, timeout=30) as response:
        rows = list(csv.reader(io.StringIO(response.read().decode("utf-8-sig"))))
    head = [h.strip() for h in rows[0]] if rows else []
    missing = [h for h in required if h not in head]
    if missing:
        raise SystemExit(f"「{name}」分頁缺少欄位 {missing}。請確認試算表已公開檢視，且分頁名稱正確。")
    records = [{h: (row[i].strip() if i < len(row) else "") for i, h in enumerate(head) if h} for row in rows[1:]]
    return [r for r in records if any(r.values())]


if __name__ == "__main__":
    config = json.loads((here / "site-config.json").read_text(encoding="utf-8"))
    if not config.get("sheetId"):
        raise SystemExit("source/site-config.json 還沒有填 sheetId。")
    snapshot = {
        "events": fetch(config["sheetId"], config.get("eventsSheet", "事件"), ["編號", "日期", "標題"]),
        "media": fetch(config["sheetId"], config.get("mediaSheet", "附件"), ["事件編號", "種類"]),
    }
    (here / "sheet-snapshot.json").write_text(json.dumps(snapshot, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")
    print(f"Snapshot updated: {len(snapshot['events'])} events, {len(snapshot['media'])} attachments.")
