"""mock 거래내역 — 실제 마이데이터/홈택스/KB API 연동 전 파이프라인 검증용.

'고기구이 전문 음식점' 사장님 계좌를 가정해 3개월(2026-05~07)치 거래를 만든다.
실제 응답의 결에 맞춰: 카드매출·배달정산 같은 수입, 월세·인건비 같은 정기 지출,
매입·공과금·세금 같은 변동 지출, 대출 원리금·내부이체·카드대금 같은 구조성 거래,
그리고 일부러 적요가 비거나 낯선 '애매한 거래'를 섞어 신뢰도 게이트를 시험한다.

random.seed 고정 → 실행마다 동일 데이터.
"""
from __future__ import annotations

import json
import random
from pathlib import Path

from schema import (
    Txn,
    ACCOUNT_OPERATING, ACCOUNT_LOAN,
    SRC_MYDATA_BANK, SRC_MYDATA_CARD, SRC_MYDATA_LOAN, SRC_HOMETAX,
)

RNG = random.Random(42)
MONTHS = ["2026-05", "2026-06", "2026-07"]

_seq = 0


def _id() -> str:
    global _seq
    _seq += 1
    return f"T{_seq:04d}"


def _d(month: str, day: int) -> str:
    return f"{month}-{day:02d}"


def _jitter(base: int, pct: float = 0.1) -> int:
    """base 금액에 ±pct 변동. 100원 단위 반올림."""
    lo, hi = 1 - pct, 1 + pct
    v = base * RNG.uniform(lo, hi)
    return int(round(v / 100) * 100)


def build_mock_transactions() -> list[Txn]:
    txns: list[Txn] = []

    def add(**kw):
        txns.append(Txn(txn_id=_id(), **kw))

    for m in MONTHS:
        # ── 수입 ─────────────────────────────────────────────
        # 카드매출 정산: 밴사에서 거의 매일 입금(영업일 가정, 20건).
        for day in RNG.sample(range(1, 29), 20):
            add(date=_d(m, day), amount=_jitter(380_000, 0.4), direction="IN",
                desc="나이스정보통신 카드매출", source=SRC_MYDATA_BANK,
                account_role=ACCOUNT_OPERATING, counterparty="나이스정보통신")
        # 배달매출 정산: 주 2회.
        for day in (5, 12, 19, 26):
            add(date=_d(m, day), amount=_jitter(540_000, 0.3), direction="IN",
                desc="배달의민족 정산금", source=SRC_MYDATA_BANK,
                account_role=ACCOUNT_OPERATING, counterparty="우아한형제들")
        # 현금 매출 입금(적요 빈약 — 규칙이 약하게 잡거나 애매).
        add(date=_d(m, 15), amount=_jitter(300_000, 0.5), direction="IN",
            desc="현금입금", source=SRC_MYDATA_BANK, account_role=ACCOUNT_OPERATING)

        # ── 고정비(정기) ─────────────────────────────────────
        # 월세: 매월 25일, 동일 금액·동일 수취인(정기성 신호).
        add(date=_d(m, 25), amount=2_800_000, direction="OUT",
            desc="상가월세 김영수", source=SRC_MYDATA_BANK,
            account_role=ACCOUNT_OPERATING, counterparty="김영수")
        # 인건비: 매월 10일, 직원 2명(개인 계좌 이체 — 적요에 '급여').
        add(date=_d(m, 10), amount=2_300_000, direction="OUT",
            desc="7월급여 이정민", source=SRC_MYDATA_BANK,
            account_role=ACCOUNT_OPERATING, counterparty="이정민")
        add(date=_d(m, 10), amount=1_650_000, direction="OUT",
            desc="급여 박서준", source=SRC_MYDATA_BANK,
            account_role=ACCOUNT_OPERATING, counterparty="박서준")
        # 통신비: 매월 18일.
        add(date=_d(m, 18), amount=_jitter(88_000, 0.05), direction="OUT",
            desc="KT 통신요금 자동이체", source=SRC_MYDATA_BANK,
            account_role=ACCOUNT_OPERATING, counterparty="KT")
        # 보험료: 매월 20일.
        add(date=_d(m, 20), amount=142_000, direction="OUT",
            desc="화재보험료 DB손해보험", source=SRC_MYDATA_BANK,
            account_role=ACCOUNT_OPERATING, counterparty="DB손해보험")

        # ── 변동비 ───────────────────────────────────────────
        # 공과금: 전기·가스.
        add(date=_d(m, 8), amount=_jitter(310_000, 0.25), direction="OUT",
            desc="한국전력 전기요금", source=SRC_MYDATA_BANK,
            account_role=ACCOUNT_OPERATING, counterparty="한국전력공사")
        add(date=_d(m, 8), amount=_jitter(180_000, 0.3), direction="OUT",
            desc="도시가스요금", source=SRC_MYDATA_BANK,
            account_role=ACCOUNT_OPERATING, counterparty="서울도시가스")
        # 매입(식자재·축산·주류): 월 6회.
        for day in RNG.sample(range(1, 29), 6):
            kind = RNG.choice([("한우축산 정육도매", "한우축산"),
                               ("식자재마트 세금계산서", "행복식자재마트"),
                               ("하이트진로 주류대금", "하이트진로")])
            add(date=_d(m, day), amount=_jitter(650_000, 0.5), direction="OUT",
                desc=kind[0], source=SRC_MYDATA_BANK,
                account_role=ACCOUNT_OPERATING, counterparty=kind[1])
        # 플랫폼 수수료.
        add(date=_d(m, 28), amount=_jitter(210_000, 0.2), direction="OUT",
            desc="배민 중개수수료", source=SRC_MYDATA_BANK,
            account_role=ACCOUNT_OPERATING, counterparty="우아한형제들")
        # 마케팅(가끔).
        if m != "2026-06":
            add(date=_d(m, 22), amount=_jitter(150_000, 0.3), direction="OUT",
                desc="네이버광고 파워링크", source=SRC_MYDATA_BANK,
                account_role=ACCOUNT_OPERATING, counterparty="네이버")

        # ── 세금·4대보험(홈택스 출처 → 구조적 확정) ───────────
        add(date=_d(m, 27), amount=_jitter(340_000, 0.2), direction="OUT",
            desc="국민연금 건강보험 고용산재", source=SRC_HOMETAX,
            account_role=ACCOUNT_OPERATING, counterparty="4대사회보험")

        # ── 금융(대출 계좌 → 구조적 확정) ─────────────────────
        add(date=_d(m, 5), amount=650_000, direction="OUT",
            desc="사업자대출 분할상환", source=SRC_MYDATA_LOAN,
            account_role=ACCOUNT_LOAN, counterparty="KB국민은행", loan_id="LN-2024-777")
        # 이자(적요에 명시).
        add(date=_d(m, 5), amount=_jitter(120_000, 0.05), direction="OUT",
            desc="대출이자 납부", source=SRC_MYDATA_BANK,
            account_role=ACCOUNT_OPERATING, counterparty="KB국민은행")

        # ── 구조성 거래(중립) ─────────────────────────────────
        # 내부이체: 본인 저축계좌로.
        add(date=_d(m, 16), amount=1_000_000, direction="OUT",
            desc="예비자금 이체", source=SRC_MYDATA_BANK,
            account_role=ACCOUNT_OPERATING, counterparty="본인 저축예금", is_own_account=True)
        # 카드대금 통합결제.
        add(date=_d(m, 14), amount=_jitter(720_000, 0.3), direction="OUT",
            desc="KB국민카드 카드대금", source=SRC_MYDATA_BANK,
            account_role=ACCOUNT_OPERATING, counterparty="KB국민카드", card_issuer="KB국민카드")

        # ── 일부러 애매하게 — 신뢰도 게이트 시험용 ─────────────
        add(date=_d(m, 21), amount=_jitter(95_000, 0.4), direction="OUT",
            desc="", source=SRC_MYDATA_CARD, account_role=ACCOUNT_OPERATING,
            counterparty="스마트스토어2314")
        add(date=_d(m, 23), amount=_jitter(60_000, 0.3), direction="OUT",
            desc="일반결제", source=SRC_MYDATA_CARD, account_role=ACCOUNT_OPERATING,
            counterparty="(주)케이지이니시스")

    txns.sort(key=lambda t: t.date)
    return txns


def dump_json(path: Path) -> None:
    txns = build_mock_transactions()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps([t.to_dict() for t in txns], ensure_ascii=False, indent=2),
        encoding="utf-8")
    print(f"[mock] {len(txns)}건 → {path}")


if __name__ == "__main__":
    dump_json(Path(__file__).resolve().parent / "data" / "mock_transactions.json")
