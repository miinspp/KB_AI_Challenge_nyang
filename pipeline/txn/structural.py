"""레이어② 구조적 매칭 — API 메타데이터로 확정 분류(AI 불필요).

적요 텍스트를 읽기 전에, 계좌 성격·출처·상대방 메타만으로 확실히 정해지는
거래를 먼저 못박는다. 여기서 잡으면 confidence≈1.0 으로 확정되고 뒤 단계를
건너뛴다. 특히 대출 원금상환·내부이체·카드대금을 여기서 걸러야
'비용 이중계상'과 '대출상환을 지출로 오인'하는 치명적 오류를 막는다.

반환: (category_code, confidence, reason) 또는 None(구조로는 못 정함 → 규칙으로).
"""
from __future__ import annotations

from typing import Optional

from schema import (
    Txn,
    ACCOUNT_LOAN,
    SRC_MYDATA_LOAN,
    SRC_HOMETAX,
)


def match_structural(t: Txn) -> Optional[tuple[str, float, str]]:
    # 1) 본인 명의 다른 계좌 간 이동 → 내부이체(비용/수입 아님).
    if t.is_own_account:
        return ("INTERNAL_TRANSFER", 0.99, "본인 명의 계좌 간 이체(메타)")

    # 2) 대출 계좌에서 나가는 상환건.
    #    실제로는 원금+이자가 한 건에 섞여 오기도 한다. 여기선 상환 전체를
    #    원금으로 잡고, 이자 분리는 API의 상환 스케줄(loan_id)로 후처리하는 것을 TODO로 남긴다.
    if t.source == SRC_MYDATA_LOAN or t.account_role == ACCOUNT_LOAN:
        if t.direction == "OUT":
            return ("LOAN_PRINCIPAL", 0.95, "대출계좌 상환 출금(메타). 이자 분리는 상환스케줄로 후처리")
        return None

    # 3) 홈택스 출처 → 세금/4대보험 확정.
    if t.source == SRC_HOMETAX:
        return ("TAX", 0.97, "홈택스 신고·납부 데이터(메타)")

    # 4) 카드사에 나가는 '카드대금 통합결제'.
    #    개별 카드승인건(mydata_card)과 이중계상되지 않도록 중립 처리.
    if t.card_issuer and t.direction == "OUT" and _looks_like_card_bill(t):
        return ("CARD_BILL", 0.9, f"{t.card_issuer} 카드대금 통합결제(메타) — 개별건과 이중계상 방지")

    return None


# 카드사명이 상대방인데 금액이 크고 월 1~2회면 통합결제로 본다(개별 승인은 mydata_card로 들어옴).
_CARD_KEYWORDS = ("카드대금", "카드결제", "청구대금")


def _looks_like_card_bill(t: Txn) -> bool:
    text = f"{t.desc} {t.counterparty or ''}"
    return any(k in text for k in _CARD_KEYWORDS)
