# -*- coding: utf-8 -*-
"""Replace pokemon.json config.typeChart with correct Gen6+ defensive chart.
chart[defender][attackType] = multiplier when attackType hits defender.
Only non-1.0 values are stored.
"""
import json
from pathlib import Path

# Official Gen 6+ defensive matchups (attacker -> mult against this defender)
# Keys are defender types.
CORRECT = {
    "一般": {"格斗": 2, "幽灵": 0},
    "格斗": {"飞行": 2, "超能力": 2, "妖精": 2, "岩石": 0.5, "虫": 0.5, "恶": 0.5},
    "飞行": {"岩石": 2, "电": 2, "冰": 2, "格斗": 0.5, "虫": 0.5, "草": 0.5, "地面": 0},
    "毒": {"地面": 2, "超能力": 2, "格斗": 0.5, "毒": 0.5, "虫": 0.5, "草": 0.5, "妖精": 0.5},
    "地面": {"水": 2, "草": 2, "冰": 2, "毒": 0.5, "岩石": 0.5, "电": 0},
    "岩石": {
        "格斗": 2, "地面": 2, "钢": 2, "水": 2, "草": 2,
        "一般": 0.5, "飞行": 0.5, "毒": 0.5, "火": 0.5,
    },
    "虫": {
        "飞行": 2, "岩石": 2, "火": 2,
        "格斗": 0.5, "地面": 0.5, "草": 0.5,
    },
    "幽灵": {"幽灵": 2, "恶": 2, "毒": 0.5, "虫": 0.5, "一般": 0, "格斗": 0},
    "钢": {
        "格斗": 2, "地面": 2, "火": 2,
        "一般": 0.5, "草": 0.5, "冰": 0.5, "飞行": 0.5, "超能力": 0.5,
        "虫": 0.5, "岩石": 0.5, "龙": 0.5, "钢": 0.5, "妖精": 0.5,
        "毒": 0,
    },
    "火": {
        "地面": 2, "岩石": 2, "水": 2,
        "虫": 0.5, "钢": 0.5, "火": 0.5, "草": 0.5, "冰": 0.5, "妖精": 0.5,
    },
    "水": {"草": 2, "电": 2, "钢": 0.5, "火": 0.5, "水": 0.5, "冰": 0.5},
    "草": {
        "飞行": 2, "毒": 2, "虫": 2, "火": 2, "冰": 2,
        "地面": 0.5, "水": 0.5, "草": 0.5, "电": 0.5,
    },
    "电": {"地面": 2, "飞行": 0.5, "钢": 0.5, "电": 0.5},
    "超能力": {"虫": 2, "幽灵": 2, "恶": 2, "格斗": 0.5, "超能力": 0.5},
    "冰": {"格斗": 2, "岩石": 2, "钢": 2, "火": 2, "冰": 0.5},
    "龙": {
        "冰": 2, "龙": 2, "妖精": 2,
        "火": 0.5, "水": 0.5, "草": 0.5, "电": 0.5,
    },
    "恶": {"格斗": 2, "虫": 2, "妖精": 2, "幽灵": 0.5, "恶": 0.5, "超能力": 0},
    "妖精": {"毒": 2, "钢": 2, "格斗": 0.5, "虫": 0.5, "恶": 0.5, "龙": 0},
}

TYPES = [
    "一般", "格斗", "飞行", "毒", "地面", "岩石", "虫", "幽灵", "钢",
    "火", "水", "草", "电", "超能力", "冰", "龙", "恶", "妖精",
]

path = Path(r"E:\GUESS Who\server-go\data\pokemon.json")
data = json.loads(path.read_text(encoding="utf-8"))
old = data["config"]["typeChart"]["chart"]

# sanity: fighting must not be weak to poison
assert CORRECT["格斗"].get("毒") is None or CORRECT["格斗"].get("毒", 1) == 1
assert CORRECT["格斗"]["超能力"] == 2
assert CORRECT["格斗"]["妖精"] == 2
assert CORRECT["火"]["草"] == 0.5

data["config"]["typeChart"] = {"types": TYPES, "chart": CORRECT}
path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

# report diffs for fighting
print("格斗 old:", old.get("格斗"))
print("格斗 new:", CORRECT["格斗"])
print("火 old 草:", old.get("火", {}).get("草"))
print("OK patched")
