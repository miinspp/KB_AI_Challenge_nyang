"""거래 분류 오케스트레이터 — 레이어 ①~⑦을 순서대로 실행.

  ① 정규화        normalize_merchant
  ⑥' 개인규칙 우선  이미 사용자가 교정한 거래처면 즉시 확정(학습 결과 재사용)
  ② 구조적 매칭    match_structural (메타로 확정)
  ③ 규칙 분류      classify_rule (키워드)
  ③' 정기성 보정   매월 반복 → RENT/LABOR 신뢰도 상향(계열 전체를 봐야 가능)
  ④ AI 분류        ai_classify (선택 훅 — 규칙 실패건만, base 인코더/LLM은 외부 주입)
  ⑤ 신뢰도 게이트  임계값 미만은 needs_review=True → 사용자 확인 UI로
  ⑦ 집계          aggregate_monthly

레이어④는 무거운 의존성(torch)을 끌어오지 않도록 함수 훅으로 분리했다.
없으면 규칙 실패건은 UNKNOWN으로 남고 사용자 확인 대상이 된다.
"""
from __future__ import annotations

from collections import defaultdict
from typing import Callable, Optional

from schema import Txn, signed_amount
from taxonomy import CATEGORIES, label_of, is_expense, is_income, NEUTRAL_CODES
from normalize import normalize_merchant, norm_key
from structural import match_structural
from rules import classify_rule

# 이 값 미만이면 자동 확정하지 않고 사용자 확인(⑤).
REVIEW_THRESHOLD = 0.6
# 정기성(반복)으로 인정할 최소 발생 월 수 / 금액 허용 오차.
RECUR_MIN_MONTHS = 2
RECUR_AMOUNT_TOL = 0.15

# 레이어④ 훅 시그니처: (txn) -> (code, confidence, reason) | None
AiClassifier = Callable[[Txn], Optional[tuple[str, float, str]]]


def classify_all(
    txns: list[Txn],
    personal_rules: Optional[dict[str, str]] = None,
    ai_classify: Optional[AiClassifier] = None,
) -> list[Txn]:
    """거래 리스트를 제자리(in-place) 분류해 반환.

    personal_rules: {norm_key: category_code} — 레이어⑥ 사용자 교정 저장분.
    ai_classify:    레이어④ 훅(없으면 건너뜀).
    """
    personal_rules = personal_rules or {}

    # ① 정규화
    for t in txns:
        t.merchant_norm = normalize_merchant(t.counterparty or t.desc)

    # ③' 정기성 판정을 위해 먼저 반복 거래처 집합을 만든다.
    recurring = _detect_recurring(txns)

    for t in txns:
        key = norm_key(t.counterparty or t.desc)

        # ⑥' 개인 규칙 최우선 — 한 번 교정한 거래처는 다시 묻지 않는다.
        if key in personal_rules:
            _assign(t, personal_rules[key], 0.99, "사용자 교정 규칙", "personal_rule")
            continue

        # ② 구조적 매칭
        st = match_structural(t)
        if st:
            _assign(t, *st, decided_by="structural")
            continue

        # ③ 규칙 분류
        rule = classify_rule(t)
        if rule:
            code, conf, reason = rule
            # ③' 정기성 보정: 월세·인건비는 '매월 같은 곳에 비슷한 금액'이 결정적 단서.
            if key in recurring and code in ("RENT", "LABOR"):
                conf = min(0.95, conf + 0.15)
                reason += " + 매월 반복(정기성)"
            _assign(t, code, conf, reason, "rule")
            continue

        # ④ AI 분류(훅 있을 때만) — 규칙으로 못 잡은 애매한 건.
        if ai_classify:
            ai = ai_classify(t)
            if ai:
                _assign(t, *ai, decided_by="ai")
                continue

        # 아무 데도 안 걸림 → 미분류.
        _assign(t, "UNKNOWN", 0.0, "규칙·구조·AI 모두 미해당", "none")

    # ⑤ 신뢰도 게이트
    #   확실히 중립인 내부이체·카드대금·현금인출은 낮은 신뢰도라도 확인 불필요.
    #   단, UNKNOWN은 중립코드지만 '못 정한' 것이므로 반드시 확인 대상.
    confident_neutral = NEUTRAL_CODES - {"UNKNOWN"}
    for t in txns:
        t.needs_review = (t.category == "UNKNOWN") or (
            t.confidence < REVIEW_THRESHOLD and t.category not in confident_neutral)
    return txns


def _assign(t: Txn, code: str, conf: float, reason: str, decided_by: str) -> None:
    t.category, t.confidence, t.decided_by, t.reason = code, round(conf, 2), decided_by, reason


def _month(date: str) -> str:
    return date[:7]  # 'YYYY-MM'


def _detect_recurring(txns: list[Txn]) -> set[str]:
    """(거래처, 출금) 계열이 서로 다른 달에 RECUR_MIN_MONTHS회 이상,
    금액이 ±RECUR_AMOUNT_TOL 안에서 반복되면 정기 거래로 본다."""
    buckets: dict[str, list[tuple[str, int]]] = defaultdict(list)
    for t in txns:
        if t.direction != "OUT":
            continue
        buckets[norm_key(t.counterparty or t.desc)].append((_month(t.date), t.amount))

    recurring: set[str] = set()
    for key, items in buckets.items():
        months = {m for m, _ in items}
        if len(months) < RECUR_MIN_MONTHS:
            continue
        amounts = [a for _, a in items]
        avg = sum(amounts) / len(amounts)
        if avg > 0 and all(abs(a - avg) / avg <= RECUR_AMOUNT_TOL for a in amounts):
            recurring.add(key)
    return recurring


# ── ⑦ 집계 ───────────────────────────────────────────────────────────
def aggregate_monthly(txns: list[Txn]) -> dict:
    """월 × 카테고리 집계 + 월별 손익/현금흐름 요약.

    반환 구조:
      { "2026-05": {
          "categories": { "RENT": {"label","amount","count"}, ... },
          "income": int, "expense": int, "profit": int,   # 손익(pnl 기준)
          "cash_in": int, "cash_out": int, "net_cash": int  # 현금흐름
        }, ... }
    """
    out: dict[str, dict] = {}
    for t in txns:
        if not t.category:
            continue
        m = _month(t.date)
        node = out.setdefault(m, {"categories": {}, "income": 0, "expense": 0,
                                  "profit": 0, "cash_in": 0, "cash_out": 0, "net_cash": 0})
        cat = node["categories"].setdefault(
            t.category, {"label": label_of(t.category), "amount": 0, "count": 0})
        cat["amount"] += t.amount
        cat["count"] += 1

        cash = signed_amount(t)
        node["net_cash"] += cash
        if cash >= 0:
            node["cash_in"] += cash
        else:
            node["cash_out"] += -cash
        if is_income(t.category):
            node["income"] += t.amount
        elif is_expense(t.category):
            node["expense"] += t.amount

    for node in out.values():
        node["profit"] = node["income"] - node["expense"]
    return dict(sorted(out.items()))
