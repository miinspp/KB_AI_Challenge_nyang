"""
추천 풀 빌더 — 서울 정책(정제) + KB 금융상품(24종)을 한 파일로 합친다.
출력: data/reco_pool.json  (app.py가 로드하는 추천 대상 풀)

정제 기준 (소상공인 무관 분야 제거):
  - 접수 마감(is_open=False)
  - 분야 '수출' 전체 (수출기업 대상 — 소상공인 무관)
  - 분야 '기타'
  - 분야 '기술' 중 R&D/학회/전시/소재부품형 (디지털·스마트·소상공인 관련만 잔류)
  - 카테고리 무관하게 학회/박람회/전시/바이오 등 이벤트성 공고
"""
import json, re
from pathlib import Path

HERE = Path(__file__).parent
POLICIES = HERE / "data" / "seoul_policies_enriched.json"
KB = Path("../backend/src/main/resources/data/kb-products/recommendable_products.json")
OUT = HERE / "data" / "reco_pool.json"

# 소상공인과 무관한 이벤트/R&D 신호
EVENT_KW = ["학회", "박람회", "전시회", "바이오유럽", "bio-europe", "이차전지", "소재부품",
            "소재·부품", "반도체", "나노", "해외인증", "수출등록", "글로벌 엑셀러", "참가지원",
            "참가 지원", "wclc", "특허", "논문", "포상", "유공자"]
# 기술 분야 중 소상공인에게 유효한 신호(디지털 전환 등)
TECH_KEEP_KW = ["디지털", "스마트", "온라인", "키오스크", "전환", "상점", "점포",
                "소상공인", "컨설팅", "배달", "플랫폼", "pos", "간편결제"]
DROP_CATEGORIES = {"수출", "기타"}

# 전국 정책은 '제목에 소상공인이 명시된 것'만 유지 (요약문 보일러플레이트 오탐 방지)
SOHO_TITLE = ["소상공인", "자영업", "소공인", "전통시장", "골목상권", "상점가", "가맹점",
              "1인 자영", "생계형"]
# 특정 산업·집단용은 제외
EXC_TITLE = ["의료기기", "치과", "바이오", "헬스", "로봇", "뿌리산업", "콘텐츠ip", "반도체",
             "소재부품", "제조혁신", "기술개발", "r&d", "스타트업", "벤처", "수출", "esg",
             "장애인기업", "사회적기업", "연구", "실증", "특허"]


def is_event(text):
    t = text.lower()
    return any(k.lower() in t for k in EVENT_KW)


def title_soho(p):
    t = p.get("title", "").lower()
    if any(k in t for k in EXC_TITLE):
        return False
    return any(k in t for k in SOHO_TITLE)


def base_clean(p):
    """1차 정제: 마감·수출·기타·기술R&D·이벤트성 제거"""
    if not p.get("is_open", True):
        return False
    cat = p.get("category")
    text = f"{p.get('title','')} {p.get('summary','')}"
    if cat in DROP_CATEGORIES:
        return False
    if is_event(text):
        return False
    if cat == "기술":
        return any(k in text.lower() for k in TECH_KEEP_KW)
    return True


def keep_policy(p):
    """서울 지역 정책 + 전국 중 소상공인 명시 정책만 유지."""
    if not base_clean(p):
        return False
    region = p.get("region")
    if region == "서울":
        return True
    if region == "전국":
        return title_soho(p)   # 전국은 소상공인 명시된 것만
    return False               # 그 외 지역은 애초에 없음(안전장치)


def parse_amount_manwon(text):
    best = None
    for m in re.finditer(r"(\d+(?:[.,]\d+)?)\s*(억|천만|백만|만)\s*원", text or ""):
        n = float(m.group(1).replace(",", ""))
        unit = {"억": 10000, "천만": 1000, "백만": 100, "만": 1}[m.group(2)]
        best = max(best or 0, int(n * unit))
    return best


def kb_to_item(p):
    name = p["product_name"]
    cat_ko = p.get("category_ko", "")
    cond = p.get("public_conditions_summary", "")
    summary = f"{p.get('summary','')} {cond}".strip()
    lending = any(k in cat_ko for k in ["대출", "채무조정", "셀러", "공급망"])
    stypes = []
    if lending:
        stypes.append("융자")
    if "보증" in name:
        stypes.append("보증")
    return {
        "id": p["product_id"],
        "title": name,
        "region": "전국",
        "category": "금융",
        "subcategory": cat_ko,
        "target": p.get("target_customer", "소상공인"),
        "summary": summary,
        "hashtags": f"KB,금융,{cat_ko},{name}",
        "apply_period": None,
        "deadline": None,
        "is_open": p.get("availability_status") in ("AVAILABLE_APPLY", "AVAILABLE_CONSULT"),
        "agency": "KB국민은행",
        "exec_agency": "KB국민은행",
        "apply_method": ", ".join(p.get("application_channels", []) or ["KB스타뱅킹"]),
        "url": p.get("application_url") or p.get("official_url"),
        "support_types": stypes or ["금융"],
        "target_tags": ["소상공인"],
        "max_biz_age": None,
        "max_amount_manwon": parse_amount_manwon(cond),
        "is_finance": bool(lending),
        "source": "KB",   # 프론트/디버그용 출처 마커
    }


def main():
    policies = json.loads(POLICIES.read_text(encoding="utf-8"))
    kept = [p for p in policies if keep_policy(p)]
    for p in kept:
        p.setdefault("source", "GOV")

    kb_raw = json.loads(KB.read_text(encoding="utf-8")).get("products", [])
    kb_items = [kb_to_item(p) for p in kb_raw]

    pool = kept + kb_items
    OUT.write_text(json.dumps(pool, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"정책 {len(policies)} → 정제 후 {len(kept)}건 (제거 {len(policies)-len(kept)})")
    print(f"KB 상품 {len(kb_items)}건 추가")
    print(f"최종 추천 풀: {len(pool)}건 → {OUT.name}")


if __name__ == "__main__":
    main()
