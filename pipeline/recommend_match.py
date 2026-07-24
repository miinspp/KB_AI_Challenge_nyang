"""진단 결과(업종 내 상대 위치) 기반 추천 매칭 프로토타입.

RankService가 내는 신호(상위 %, 임대료 부담률, 매출 추세, 업력 등)를 자연어
프로필 문장으로 바꾸고, enrich_recommendables.py가 만든 임베딩과 코사인
유사도로 정책·KB상품을 랭킹한다. 자격요건(업력·지역·마감일)은 하드 필터.

실행:
  .venv/bin/python pipeline/recommend_match.py --profile struggling
  .venv/bin/python pipeline/recommend_match.py --profile growth --top 8
  .venv/bin/python pipeline/recommend_match.py --profile-json my_profile.json
"""
from __future__ import annotations

import argparse
import json
from datetime import date
from pathlib import Path

import numpy as np
from sentence_transformers import SentenceTransformer

ROOT = Path(__file__).resolve().parent.parent
ENRICHED_PATH = ROOT / "backend/src/main/resources/data/reco/enriched_items.json"
FINETUNED_MODEL = ROOT / "pipeline/models/ko-sroberta-reco"
# 항목 임베딩과 동일 공간을 쓰도록 파인튜닝 모델(있으면) 우선
EMBED_MODEL = str(FINETUNED_MODEL) if FINETUNED_MODEL.exists() else "jhgan/ko-sroberta-multitask"

# RankService 응답 + 입력폼에서 나오는 값들로 구성한 샘플 프로필.
# topPercent: 낮을수록 상위권. rentRatio: 매출 대비 임대료(0.10 이하 건전).
SAMPLE_PROFILES = {
    "struggling": {
        "industryLabel": "고기구이 전문 음식점",
        "region": "서울",
        "bizAgeYears": 3,
        "topPercent": 65,
        "rentRatio": 0.14,
        "salesTrend": "하락",
        "needs": "운영자금 부족과 임대료·이자 부담이 커서 긴급 경영안정 자금, 비용 절감, 금리 부담 완화가 필요",
    },
    "growth": {
        "industryLabel": "고기구이 전문 음식점",
        "region": "서울",
        "bizAgeYears": 5,
        "topPercent": 18,
        "rentRatio": 0.08,
        "salesTrend": "상승",
        "needs": "매장 확장과 시설 투자, 온라인 판로 확대를 위한 성장 자금과 마케팅 지원이 필요",
    },
    "startup": {
        "industryLabel": "커피 전문점",
        "region": "서울",
        "bizAgeYears": 1,
        "topPercent": 50,
        "rentRatio": 0.11,
        "salesTrend": "보합",
        "needs": "창업 초기 안정화를 위한 교육·컨설팅과 초기 운영자금 마련이 필요",
    },
}


def build_profile_sentence(p: dict) -> str:
    """진단 신호 → 임베딩용 자연어 프로필 문장."""
    tier = (
        "업종 내 상위권" if p["topPercent"] <= 30
        else "업종 내 중위권" if p["topPercent"] <= 60
        else "업종 내 하위권"
    )
    rent = (
        "임대료 부담률이 과중한 편" if p.get("rentRatio", 0) > 0.10
        else "임대료 부담은 건전한 수준"
    )
    return (
        f"{p['region']}에서 {p['industryLabel']}을 운영하는 업력 {p['bizAgeYears']}년차 소상공인. "
        f"동일 업종 내 매출 상위 {p['topPercent']}%로 {tier}, {rent}, "
        f"최근 매출은 {p['salesTrend']} 추세. {p['needs']}."
    )


def passes_filters(item: dict, profile: dict, today: date) -> bool:
    if not item.get("is_open", False):
        return False
    if item.get("deadline"):
        try:
            if date.fromisoformat(item["deadline"]) < today:
                return False
        except ValueError:
            pass
    if item.get("max_biz_age") is not None and profile["bizAgeYears"] > item["max_biz_age"]:
        return False
    region = item.get("region") or "전국"
    if region != "전국" and profile["region"] not in region:
        return False
    return True


CLOSURE_TERMS = ("폐업", "재기", "재도전", "사업정리")
CLOSURE_PENALTY = 0.10


def closure_penalty(item: dict, profile: dict) -> float:
    """폐업·재기 지원은 심각한 위기 신호가 있을 때만 추천 — 그 외엔 감점.

    임베딩만으로는 '경영이 어렵다'와 '폐업을 준비한다'가 잘 구분되지 않아서,
    진단 신호(하위 25% + 매출 하락)나 명시적 언급이 없으면 순위를 내린다.
    """
    text = item["title"] + " ".join(item.get("keywords", []))
    if not any(t in text for t in CLOSURE_TERMS):
        return 0.0
    if any(t in profile.get("needs", "") for t in CLOSURE_TERMS):
        return 0.0
    if profile["topPercent"] >= 75 and profile.get("salesTrend") == "하락":
        return 0.0
    return CLOSURE_PENALTY


def match(profile: dict, top_policies: int, top_products: int) -> dict[str, list[dict]]:
    data = json.loads(ENRICHED_PATH.read_text())
    sentence = build_profile_sentence(profile)
    print(f"\n[프로필 문장]\n  {sentence}\n")

    model = SentenceTransformer(EMBED_MODEL)
    q = model.encode([sentence], normalize_embeddings=True)[0]

    today = date.today()
    results = []
    for item in data["items"]:
        if not passes_filters(item, profile, today):
            continue
        sim = float(np.dot(q, np.asarray(item["embedding"])))
        sim -= closure_penalty(item, profile)
        results.append({**item, "score": sim})
    results.sort(key=lambda x: -x["score"])
    return {
        "policy": [r for r in results if r["source"] == "policy"][:top_policies],
        "kb_product": [r for r in results if r["source"] == "kb_product"][:top_products],
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--profile", choices=SAMPLE_PROFILES, default="struggling")
    ap.add_argument("--profile-json", type=Path, help="프로필 JSON 파일 경로 (샘플 대신 사용)")
    ap.add_argument("--top", type=int, default=5, help="정책 추천 개수")
    ap.add_argument("--top-products", type=int, default=3, help="KB상품 추천 개수")
    args = ap.parse_args()

    profile = (
        json.loads(args.profile_json.read_text()) if args.profile_json
        else SAMPLE_PROFILES[args.profile]
    )
    grouped = match(profile, args.top, args.top_products)

    for source, label in (("policy", "정책·지원제도"), ("kb_product", "KB 금융상품")):
        print(f"\n===== 추천 {label} top {len(grouped[source])} =====")
        for i, r in enumerate(grouped[source], 1):
            print(f"\n{i}. {r['title']}  (유사도 {r['score']:.3f})")
            print(f"   키워드: {', '.join(r['keywords'])}")
            if r.get("max_amount_manwon"):
                line = f"   최대지원: {r['max_amount_manwon']:,}만원"
                if r.get("deadline"):
                    line += f" | 마감: {r['deadline']}"
                print(line)
            elif r.get("deadline"):
                print(f"   마감: {r['deadline']}")
            if r.get("summary_short"):
                print("   " + r["summary_short"].replace("\n", "\n   "))
            else:
                print(f"   {r['summary'][:90]}…")


if __name__ == "__main__":
    main()
