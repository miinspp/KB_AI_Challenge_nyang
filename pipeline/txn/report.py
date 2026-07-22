"""리포트 빌더 — 분류 결과를 프론트/백엔드가 쓸 JSON 계약으로 변환.

engine.aggregate_monthly(월×카테고리 집계) 위에 표시용 구조를 얹는다.
  - months:      월별 손익·현금흐름 + 카테고리(그룹·라벨 포함)
  - reviewQueue: 신뢰도 낮아 사용자 확인이 필요한 거래
  - suggestions: 부담률·원가율 진단(임계값 — 추후 benchmarks.json 업종평균으로 교체)

산출물은 backend/src/main/resources/data/txn/monthly_report.json 으로 써서
Spring(TxnReportRepository)이 그대로 로드·서빙한다(reco 파이프라인과 동일 패턴).
"""
from __future__ import annotations

import json
from pathlib import Path

from schema import Txn, signed_amount
from taxonomy import CATEGORIES, label_of, INCOME, FIXED, VARIABLE, FINANCING
from mock_data import build_mock_transactions, MONTHS
from engine import classify_all, aggregate_monthly

ROOT = Path(__file__).resolve().parents[2]
OUT_PATH = ROOT / "backend/src/main/resources/data/txn/monthly_report.json"
# 백엔드 교정 저장소(레이어⑥). 백엔드가 append, 여기서 읽어 personal_rules로 반영.
CORRECTIONS_PATH = Path(__file__).resolve().parent / "data" / "corrections.jsonl"

# 카테고리 그룹 표시 순서.
GROUP_ORDER = {INCOME: 0, FIXED: 1, VARIABLE: 2, FINANCING: 3}


def build_report(txns: list[Txn]) -> dict:
    monthly = aggregate_monthly(txns)

    months = []
    for month, node in monthly.items():
        cats = [
            {
                "code": code,
                "label": c["label"],
                "group": CATEGORIES[code].group,
                "amount": c["amount"],
                "count": c["count"],
            }
            for code, c in node["categories"].items()
        ]
        cats.sort(key=lambda x: (GROUP_ORDER.get(x["group"], 9), -x["amount"]))
        months.append({
            "month": month,
            "income": node["income"], "expense": node["expense"], "profit": node["profit"],
            "cashIn": node["cash_in"], "cashOut": node["cash_out"], "netCash": node["net_cash"],
            "categories": cats,
        })

    review = [
        {
            "txnId": t.txn_id,
            "date": t.date,
            "amount": t.amount,
            "merchant": (t.counterparty or t.desc) or "(적요없음)",
            "guess": label_of(t.category),
        }
        for t in txns if t.needs_review
    ]

    return {
        "meta": {
            "generatedFor": "mock",
            "months": [m for m in MONTHS if m in monthly],
            "txnCount": len(txns),
        },
        "months": months,
        "reviewQueue": review,
        "suggestions": build_diagnostics(monthly),
    }


def build_diagnostics(monthly: dict) -> list[dict]:
    """월 평균 기준 간단 진단. status: ok | warn. 임계값은 추후 업종평균으로 대체."""
    nodes = list(monthly.values())
    if not nodes:
        return []
    avg_income = sum(n["income"] for n in nodes) / len(nodes)
    if avg_income <= 0:
        return []

    def cat_avg(code: str) -> float:
        return sum(n["categories"].get(code, {}).get("amount", 0) for n in nodes) / len(nodes)

    def pct(code: str) -> float:
        return round(cat_avg(code) / avg_income * 100, 1)

    out = [
        {"metric": "인건비 부담률", "value": pct("LABOR"), "status": "ok",
         "message": "업종평균 대비 비교 필요"},
        {"metric": "임대료 부담률", "value": pct("RENT"),
         "status": "warn" if pct("RENT") > 10 else "ok",
         "message": "매출 대비 높음(임대료 10% 초과)" if pct("RENT") > 10 else "양호"},
        {"metric": "매입 원가율", "value": pct("SUPPLIES"),
         "status": "warn" if pct("SUPPLIES") > 35 else "ok",
         "message": "원가 관리 점검 권장" if pct("SUPPLIES") > 35 else "양호"},
    ]
    return out


def load_corrections() -> dict:
    """백엔드가 쌓은 사용자 교정(corrections.jsonl)을 {norm_key: code}로 로드.

    저장은 원문 상호(merchant)로, 매칭 키는 norm_key로 — engine과 동일 정규화라
    다음 분류부터 규칙보다 먼저 확정된다(레이어⑥ 재사용). 이 로그가 곧 학습 라벨.
    """
    from normalize import norm_key
    rules: dict[str, str] = {}
    if not CORRECTIONS_PATH.exists():
        return rules
    for line in CORRECTIONS_PATH.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        try:
            r = json.loads(line)
            rules[norm_key(r["merchant"])] = r["category"]
        except Exception:
            continue  # 깨진 줄은 건너뜀
    return rules


def main() -> None:
    txns = build_mock_transactions()
    personal_rules = {"스마트스토어": "SUPPLIES", **load_corrections()}
    classify_all(txns, personal_rules=personal_rules)
    report = build_report(txns)
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[report] {len(txns)}건 → {OUT_PATH.relative_to(ROOT)} "
          f"(months={len(report['months'])}, review={len(report['reviewQueue'])})")


if __name__ == "__main__":
    main()
