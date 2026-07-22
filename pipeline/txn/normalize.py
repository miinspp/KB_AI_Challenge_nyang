"""레이어① 가맹점명·적요 정규화.

같은 거래처가 "㈜우아한형제들", "우아한형제들(주)", "배민 12345" 처럼 제각각
들어온다. 뒷 단계(규칙·개인규칙·집계)가 흔들리지 않도록 표준형으로 만든다.

여기선 의존성 없는 정규식 기반만 둔다. kiwipiepy 형태소 분석으로 명사만
남기는 고도화는 TODO(파이프라인에 이미 kiwipiepy 설치돼 있음).
"""
from __future__ import annotations

import re

# 법인 형태 표기 제거.
_CORP = re.compile(r"㈜|\(주\)|주식회사|\(유\)|유한회사|\(재\)|\(사\)")
# 카드 매입/승인 접두, POS 단말 꼬리표 등 잡음.
_NOISE = re.compile(r"(체크카드|신용카드|카드승인|카드매입|자동이체|CMS|펌뱅킹|간편결제)")
# 지점/단말 번호 꼬리(예: "스타벅스 강남2호점 0012").
_TAIL_NUM = re.compile(r"[\s\-_]*\d{2,}\s*$")
# 지점 표기.
_BRANCH = re.compile(r"\s*[가-힣A-Za-z0-9]+(점|지점|호점)\s*$")
_MULTISPACE = re.compile(r"\s+")


def normalize_merchant(raw: str) -> str:
    """상호/적요 원문 → 비교·매칭용 표준형.

    예) '㈜우아한형제들  배민12345' -> '우아한형제들 배민'
    """
    if not raw:
        return ""
    s = raw.strip()
    s = _CORP.sub(" ", s)
    s = _NOISE.sub(" ", s)
    s = _MULTISPACE.sub(" ", s).strip()
    s = _TAIL_NUM.sub("", s)
    s = _BRANCH.sub("", s)
    s = _MULTISPACE.sub(" ", s).strip()
    return s or raw.strip()


def norm_key(raw: str) -> str:
    """개인 거래처 규칙(레이어⑥)의 키. 공백 제거·소문자화해 안정적 매칭."""
    return normalize_merchant(raw).replace(" ", "").lower()
