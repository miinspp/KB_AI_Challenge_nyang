"""소상공인 점포 운영 거래 분류 체계(taxonomy).

마이데이터·홈택스·KB Open API에서 들어온 거래 한 건을 어떤 카테고리로
붙일지 정의한다. 카테고리는 세 가지 축을 함께 갖는다.

  group  : 리포트 묶음(수입 / 고정비 / 변동비 / 금융 / 중립)
  sign   : 현금흐름 부호(+1 유입, -1 유출, 0 중립)
  pnl    : 손익계산서(P&L)상 손익 항목인가.
           - 대출 '원금' 상환은 현금은 나가지만(비용 sign=-1) 손익은 아님(pnl=False).
             부채가 줄 뿐이라 비용으로 세면 이중으로 손해를 과대계상한다.
           - 대출 '이자'는 손익상 비용(pnl=True).
           이 구분이 있어야 "이번 달 진짜 비용"과 "통장에서 나간 돈"을 나눠 볼 수 있다.

새 카테고리를 추가할 땐 여기 CATEGORIES 한 곳만 고치면 규칙·집계·리포트가 따라온다.
"""
from __future__ import annotations

from dataclasses import dataclass

# ── 리포트 묶음(group) ────────────────────────────────────────────────
INCOME = "수입"
FIXED = "고정비"       # 매출과 무관하게 매월 거의 일정
VARIABLE = "변동비"    # 매출·영업량에 따라 변동
FINANCING = "금융"     # 대출 원리금 등 재무활동
NEUTRAL = "중립"       # 비용도 수입도 아님(내부이체·카드대금 등 이중계상 방지)


@dataclass(frozen=True)
class Category:
    code: str
    label: str          # 사용자에게 보일 한글 라벨
    group: str
    sign: int           # +1 유입 / -1 유출 / 0 중립
    pnl: bool           # 손익 항목 여부


def _c(code, label, group, sign, pnl) -> Category:
    return Category(code, label, group, sign, pnl)


# ── 카테고리 레지스트리 ───────────────────────────────────────────────
# code -> Category. code는 코드/DB용 불변 키, label은 표시용.
CATEGORIES: dict[str, Category] = {c.code: c for c in [
    # 수입 -----------------------------------------------------------
    _c("SALES_CARD",     "카드매출 정산",   INCOME, +1, True),
    _c("SALES_DELIVERY", "배달매출 정산",   INCOME, +1, True),
    _c("SALES_CASH",     "현금·계좌 매출",  INCOME, +1, True),
    _c("OTHER_INCOME",   "기타수입(지원금·환급)", INCOME, +1, True),

    # 고정비 ---------------------------------------------------------
    _c("RENT",       "임대료(월세)",  FIXED, -1, True),
    _c("LABOR",      "인건비",        FIXED, -1, True),
    _c("COMMS",      "통신비",        FIXED, -1, True),
    _c("INSURANCE",  "보험료",        FIXED, -1, True),

    # 변동비 ---------------------------------------------------------
    _c("UTILITIES",    "공과금(전기·가스·수도)", VARIABLE, -1, True),
    _c("SUPPLIES",     "매입·원재료",   VARIABLE, -1, True),
    _c("MARKETING",    "광고·마케팅",   VARIABLE, -1, True),
    _c("PLATFORM_FEE", "플랫폼·결제 수수료", VARIABLE, -1, True),
    _c("MAINTENANCE",  "시설·비품·수리", VARIABLE, -1, True),
    _c("TAX",          "세금·4대보험",  VARIABLE, -1, True),
    _c("MISC_EXPENSE", "기타지출",      VARIABLE, -1, True),

    # 금융(재무활동) --------------------------------------------------
    _c("LOAN_INTEREST",  "대출이자",       FINANCING, -1, True),
    _c("LOAN_PRINCIPAL", "대출원금 상환",  FINANCING, -1, False),  # 현금유출이나 비용 아님

    # 중립(집계에서 제외하거나 이중계상 방지) --------------------------
    _c("INTERNAL_TRANSFER", "내부이체(본인 계좌)", NEUTRAL, 0, False),
    _c("CARD_BILL",         "카드대금 결제",   NEUTRAL, 0, False),  # 카드 개별건과 이중계상 방지
    _c("CASH_WITHDRAWAL",   "현금 인출",       NEUTRAL, 0, False),
    _c("UNKNOWN",           "미분류",          NEUTRAL, 0, False),
]}


def label_of(code: str) -> str:
    c = CATEGORIES.get(code)
    return c.label if c else code


def is_expense(code: str) -> bool:
    """손익상 '비용'인가(리포트의 비용 합계에 넣을지)."""
    c = CATEGORIES.get(code)
    return bool(c and c.group in (FIXED, VARIABLE, FINANCING) and c.pnl)


def is_income(code: str) -> bool:
    c = CATEGORIES.get(code)
    return bool(c and c.group == INCOME)


# 리포트에서 이 코드들은 '비용/수입 합계'에 넣지 않는다(현금흐름엔 별도 표기).
NEUTRAL_CODES = {code for code, c in CATEGORIES.items() if c.group == NEUTRAL}
