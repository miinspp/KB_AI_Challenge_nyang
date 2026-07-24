"""거래 한 건의 표준 스키마.

마이데이터/홈택스/KB Open API는 응답 필드가 제각각이라, 수집 직후 이 형태로
어댑터가 변환한다고 가정한다(어댑터는 별도 — 여기선 표준형만 정의).
분류 엔진은 오직 이 표준 필드만 본다.
"""
from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Optional


# 계좌 성격 — 구조적 매칭(레이어②)의 핵심 신호.
ACCOUNT_OPERATING = "operating"   # 사업용 입출금 계좌
ACCOUNT_LOAN = "loan"             # 대출 계좌
ACCOUNT_CARD = "card"             # 카드 계좌(개별 승인건)
ACCOUNT_SAVINGS = "savings"       # 본인 저축/예비 계좌

# 데이터 출처.
SRC_MYDATA_BANK = "mydata_bank"
SRC_MYDATA_CARD = "mydata_card"
SRC_MYDATA_LOAN = "mydata_loan"
SRC_HOMETAX = "hometax"
SRC_KB_OPENAPI = "kb_openapi"


@dataclass
class Txn:
    txn_id: str
    date: str                      # 'YYYY-MM-DD'
    amount: int                    # 원. 부호 없음(방향은 direction으로)
    direction: str                 # 'IN'(입금) | 'OUT'(출금)
    desc: str                      # 적요/가맹점명 원문 (분류의 1차 단서)
    source: str                    # SRC_*
    account_role: str              # ACCOUNT_*

    # ── 구조적 힌트(API가 주면 채움, 없으면 None) ──
    counterparty: Optional[str] = None       # 거래 상대 이름(정규화 전)
    counterparty_biz_no: Optional[str] = None  # 상대 사업자번호(있으면 매입처 확정에 강력)
    is_own_account: bool = False             # 본인 명의 다른 계좌로의 이체면 True → 내부이체
    loan_id: Optional[str] = None            # 대출 계좌 식별자(상환건 매칭)
    card_issuer: Optional[str] = None        # 카드사(카드대금/수수료 판별)
    mydata_category: Optional[str] = None    # 마이데이터가 준 업종/카테고리 코드(있으면 힌트)

    # ── 정규화·분류 결과(엔진이 채움) ──
    merchant_norm: Optional[str] = None      # 정규화된 상호(레이어①)
    category: Optional[str] = None           # 최종 카테고리 code
    confidence: float = 0.0                  # 0~1
    decided_by: Optional[str] = None         # 'structural' | 'rule' | 'ai' | 'user' | 'personal_rule'
    reason: Optional[str] = None             # 판단 근거(디버깅·사용자 설명용)
    needs_review: bool = False               # 신뢰도 낮아 사용자 확인 필요

    def to_dict(self) -> dict:
        return asdict(self)


def signed_amount(t: Txn) -> int:
    """현금흐름 부호를 적용한 금액(+입금 / -출금)."""
    return t.amount if t.direction == "IN" else -t.amount
