"""거래 분류 파이프라인 실행 데모 (의존성 없음 — 순수 stdlib).

실행:
  python pipeline/txn/demo.py

동작: mock 거래 생성 → 분류(①②③⑤⑥⑦) → 커버리지·월별 리포트·확인필요 출력.
레이어④(AI)는 훅 미주입 상태라 규칙이 놓친 애매한 건은 UNKNOWN으로 남는다
(= 사용자 확인 대상). 개인규칙 예시를 하나 넣어 ⑥ 재사용도 함께 보여준다.
"""
from __future__ import annotations

from collections import Counter

from mock_data import build_mock_transactions
from engine import classify_all, aggregate_monthly
from taxonomy import label_of, CATEGORIES, INCOME, FIXED, VARIABLE, FINANCING


def _won(n: int) -> str:
    return f"{n:>12,}원"


def main() -> None:
    txns = build_mock_transactions()

    # ⑥ 개인 규칙 예시: 낯선 스마트스토어를 사용자가 '매입'으로 교정했다고 가정.
    #   norm_key 기준으로 저장된다(normalize.norm_key). 다음 실행부턴 자동 확정.
    personal_rules = {"스마트스토어": "SUPPLIES"}

    classify_all(txns, personal_rules=personal_rules)

    # ── 커버리지: 어떤 레이어가 얼마나 잡았나 ───────────────────
    by_layer = Counter(t.decided_by for t in txns)
    total = len(txns)
    print(f"\n{'='*56}\n거래 {total}건 분류 커버리지\n{'='*56}")
    for layer in ("personal_rule", "structural", "rule", "ai", "none"):
        n = by_layer.get(layer, 0)
        if n:
            print(f"  {layer:14s} {n:3d}건 ({n/total*100:4.1f}%)")
    review = [t for t in txns if t.needs_review]
    print(f"  → 사용자 확인 필요 {len(review)}건")

    # ── 분류 샘플(각 카테고리 1건씩) ────────────────────────────
    print(f"\n{'='*56}\n분류 샘플\n{'='*56}")
    seen: set[str] = set()
    for t in txns:
        if t.category in seen:
            continue
        seen.add(t.category)
        flag = "  ⚠확인" if t.needs_review else ""
        print(f"  [{label_of(t.category):14s}] {t.confidence:.2f} {t.decided_by:12s} "
              f"| {(t.counterparty or t.desc)[:18]:18s} | {t.reason}{flag}")

    # ── 확인 필요 건 상세 ───────────────────────────────────────
    if review:
        print(f"\n{'='*56}\n확인 필요(신뢰도<0.6)\n{'='*56}")
        for t in review:
            print(f"  {t.date} {_won(t.amount)} | {(t.counterparty or t.desc) or '(적요없음)'} "
                  f"→ 현재추정 {label_of(t.category)}")

    # ── ⑦ 월별 리포트 ──────────────────────────────────────────
    monthly = aggregate_monthly(txns)
    print(f"\n{'='*56}\n월별 손익·현금흐름\n{'='*56}")
    for month, node in monthly.items():
        print(f"\n[{month}]  수입 {_won(node['income'])} | 비용 {_won(node['expense'])} "
              f"| 손익 {_won(node['profit'])}")
        print(f"        현금유입 {_won(node['cash_in'])} | 유출 {_won(node['cash_out'])} "
              f"| 순현금 {_won(node['net_cash'])}")
        # 그룹별 비용 상위.
        cats = node["categories"]
        for grp in (INCOME, FIXED, VARIABLE, FINANCING):
            rows = [(code, c) for code, c in cats.items()
                    if CATEGORIES[code].group == grp]
            if not rows:
                continue
            rows.sort(key=lambda x: -x[1]["amount"])
            line = "  ".join(f"{c['label']} {c['amount']:,}({c['count']})" for _, c in rows)
            print(f"    · {grp}: {line}")

    # ── 개선 제안 훅(레이어⑦ 이후 — 벤치마크 연동 자리) ──────────
    print(f"\n{'='*56}\n개선 제안(예시 규칙 — 벤치마크 연동 자리)\n{'='*56}")
    _suggest(monthly)


def _suggest(monthly: dict) -> None:
    """월 평균 기준 간단 진단. 실제로는 pipeline/benchmarks.json의 업종평균과 비교."""
    months = list(monthly.values())
    if not months:
        return
    avg_income = sum(m["income"] for m in months) / len(months)
    if avg_income <= 0:
        return
    # 인건비·임대료 부담률(업종평균은 벤치마크로 대체 예정).
    def cat_avg(code: str) -> int:
        return int(sum(m["categories"].get(code, {}).get("amount", 0) for m in months) / len(months))

    labor_ratio = cat_avg("LABOR") / avg_income
    rent_ratio = cat_avg("RENT") / avg_income
    print(f"  · 인건비 부담률 {labor_ratio*100:.1f}%  (업종평균 대비 비교 필요)")
    print(f"  · 임대료 부담률 {rent_ratio*100:.1f}%  "
          f"{'⚠ 매출 대비 높음(임대료 10% 초과)' if rent_ratio > 0.10 else '(양호)'}")
    supplies = cat_avg("SUPPLIES")
    print(f"  · 매입 원가율 {supplies/avg_income*100:.1f}%  "
          f"{'⚠ 원가 관리 점검 권장' if supplies/avg_income > 0.35 else '(양호)'}")


if __name__ == "__main__":
    main()
