import csv
import os

DIR = os.path.join(os.path.dirname(__file__), "old crm")

for fname in ["Wants to purchase.csv", "demo completed.csv", "interested in demo.csv"]:
    with open(os.path.join(DIR, fname), "r", encoding="utf-8", errors="replace") as f:
        reader = csv.reader(f)
        rows = list(reader)
    print(f"=== {fname}: {len(rows)} rows, max cols: {max(len(r) for r in rows)} ===")
    for ri in range(min(5, len(rows))):
        r = rows[ri]
        def g(i):
            return r[i].strip() if i < len(r) else ""
        print(f"  Name: {g(17)} {g(27)} | Company: {g(5)} | Phone: {g(40)} | Email: {g(39)} | Addr: {g(0)[:50]} | PC: {g(41)} | Role: {g(26)} | Prov: {g(52)[:30]}")
    print()
