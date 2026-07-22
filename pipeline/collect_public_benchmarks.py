#!/usr/bin/env python3
"""
공공데이터 벤치마크 수집 — 산출식 v2 비용구조·임대료 근거 데이터.

두 종류의 출처를 하나의 산출물(public_benchmarks.json)로 합친다.

  ① 서울 상가 임대료 (동적, 분기별) — LIVE 수집
     한국부동산원 상업용부동산 임대동향조사(R-ONE) 뷰어의 내부 JSON 엔드포인트
     sttsDataPreviewList.do 를 인증키·세션 없이 그대로 호출한다(관찰로 확인).
       소규모상가 T248223134698125 / 중대형상가 T244363134858603 / 집합상가 T244913134948657
     서울 및 서울 하위 상권 행만 보관 (천원/㎡/월, 2024Q3~ 최신).

  ② 업종별 비용구조·임대료 (연 1회, 거의 불변) — 문서화된 스냅샷
     소상공인실태조사(중소벤처기업부, KOSIS orgId=142) 는 공개 열람은 되지만
     내부 뷰어 POST(html.do)가 세션 토큰 없이는 재현이 불안정하다. 따라서
     KOSIS 뷰어에서 실제 조회해 추출한 '전국·산업대분류 소계' 값을 아래 상수로 고정하고,
     표ID·기준연도·추출일과 함께 남긴다. 재검증은 KOSIS_2023_COST 와
     중기부 보도자료 매출·이익의 항등식(매출 − 이익 == 영업비용)으로 자동 수행한다.
       - DT_3ME0144  시도/산업중분류별/영업비용 (2023, 기업체당 연간 백만원)
       - MSS 보도자료  2023년 소상공인실태조사 잠정결과 (업종별 매출액·영업이익)

출력: ../backend/src/main/resources/data/public_benchmarks.json
사용처: 백엔드 RankService 비용구조 축(임차료율/인건비율/원가율 업종 벤치마크) + 리포트 참고 표기.
"""
import argparse
import json
import urllib.parse
import urllib.request
from datetime import date, datetime, timezone
from pathlib import Path

RONE_URL = "https://www.reb.or.kr/r-one/portal/stat/sttsDataPreviewList.do"
RONE_TABLES = {
    "small": ("T248223134698125", "소규모상가"),
    "mediumLarge": ("T244363134858603", "중대형상가"),
    "collective": ("T244913134948657", "집합상가"),
}

# 상권유형(서울시 상권분석서비스) → R-ONE 상가유형 대응.
# 임차료율 지역 보정 계수는 서울 상가유형별 ㎡ 임대료를 소규모상가(=골목 기준) 대비로 환산해 만든다.
# ㎡ 임대료와 임차료율(임차료÷매출)은 1:1 비례하지 않으므로(번화가는 매출도 높음)
# 상가유형 간 완만한 실측 격차(대개 ±10% 내)를 그대로 계수로 쓴다(임의 감쇠 계수 없음).
AREATYPE_SHOPTYPE = {
    "골목상권": "small",        # 가로변 소형 점포
    "발달상권": "mediumLarge",  # 번화가 중대형 건물
    "전통시장": "collective",   # 시장 내 구분(집합) 점포
}

# ── KOSIS 소상공인실태조사 스냅샷 (뷰어 실측 추출) ─────────────────────────
# DT_3ME0144 시도/산업중분류별/영업비용 · 2023 · 전국 소계 · 기업체당 연간(백만원)
# 컬럼: [기업체수, 영업비용, 매출원가, 급여총액, 임차료, 기타비용]
KOSIS_SNAPSHOT_DATE = "2026-07-21"  # KOSIS 뷰어에서 조회·추출한 날짜
KOSIS_2023_COST = {
    # group_key: (industryLabel, nFirms, cost, cogs, labor, rent, other)
    "overall":         ("전산업",                              5960788, 174, 113, 30, 14, 17),
    "food":            ("숙박 및 음식점업",                      790003, 119,  70, 24, 14, 11),
    "retail":          ("도매 및 소매업",                       1999887, 236, 170, 29, 16, 20),
    "education":       ("교육 서비스업",                         231896,  51,  15, 19, 11,  6),
    "leisure":         ("예술, 스포츠 및 여가관련 서비스업",       118522,  69,  27, 17, 14, 11),
    "repair_personal": ("협회 및 단체, 수리 및 기타 개인서비스업",  398179,  47,  27,  8,  7,  6),
}
# DT_3ME0132 시도/산업중분류별/기업체당 보증금 및 월세 · 2024 · 전국 소계 (임차 기업체 평균, 만원)
# 컬럼 채택: [보증금 있는 월세_보증금, 월세]
KOSIS_2024_RENT = {
    "overall":         (2575, 101),
    "food":            (2789, 102),
    "retail":          (2478,  99),
    "education":       (3072,  92),
    "leisure":         (3879, 144),
    "repair_personal": (2544,  74),
}
# 2023년 기업체당 연간 매출액·영업이익(백만원) — 중기부 보도자료(잠정, 2025-02-27 발표)
# https://www.mss.go.kr/site/smba/ex/bbs/View.do?cbIdx=86&bcIdx=1057002
MSS_2023_SALES = {
    "overall": (199, 25), "food": (151, 32), "retail": (260, 24),
    "education": (75, 24), "leisure": (92, 23), "repair_personal": (67, 20),
}


def http(url, data=None, headers=None):
    req = urllib.request.Request(url, data=data,
                                 headers={"User-Agent": "Mozilla/5.0", **(headers or {})})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode("utf-8")


def build_groups():
    """KOSIS 스냅샷 + MSS 보도자료를 합쳐 그룹별 비용구조 벤치마크를 만든다.
    매출 − 영업이익 == 영업비용 항등식으로 두 출처의 정합성을 검증한다."""
    groups = {}
    for key, (label, n, cost, cogs, labor, rent, other) in KOSIS_2023_COST.items():
        sales, profit = MSS_2023_SALES[key]
        if abs((sales - profit) - cost) > 1:  # 반올림 오차 ±1백만원 허용
            raise SystemExit(f"{label}: 매출({sales}) − 이익({profit}) != 영업비용({cost}) — 스냅샷 검증 실패")
        dep, monthly = KOSIS_2024_RENT[key]
        groups[key] = {
            "industryLabel": label,
            "nFirms": n,
            "annualSalesMillionKrw": sales,
            "annualProfitMillionKrw": profit,
            "annualCostMillionKrw": cost,
            "operatingMargin": round(profit / sales, 4),
            "costStructure": {
                "purchaseCost": cogs, "laborCost": labor, "rent": rent, "otherCost": other,
                "purchaseRatio": round(cogs / sales, 4),  # 원가율 (÷매출)
                "laborRatio": round(labor / sales, 4),     # 인건비율
                "rentRatio": round(rent / sales, 4),       # 임차료율 (연간 임차료 ÷ 연간 매출)
            },
            "tenancy": {"depositManwon": dep, "monthlyRentManwon": monthly, "year": "2024"},
        }
    return groups


def fetch_rone(statbl_id):
    body = urllib.parse.urlencode({
        "statblId": statbl_id, "viewLocOpt": "B", "wrttimeType": "L", "dtadvsVal": "OD",
        "wrttimeLastestVal": "10", "wrttimeOrder": "A", "dtacycleCd": "QY",
        "wrttimeMinYear": "2024", "wrttimeMaxYear": "2100",
        "wrttimeStartQt": "01", "wrttimeEndQt": "04", "wrttimeMinQt": "01", "wrttimeMaxQt": "04",
        "optDivVal": "00", "isRegionData": "Y", "searchType": "S", "locale": "ko_KR", "sysTag": "K",
    }).encode()
    data = json.loads(http(RONE_URL, data=body,
                           headers={"Content-Type": "application/x-www-form-urlencoded"}))
    rows = data["DATA"]
    cols = sorted(k for k in rows[0] if k.startswith("COL_"))
    quarters = [f"{c[4:8]}Q{int(c[8:10])}" for c in cols]
    seoul, national = [], None
    for r in rows:
        series = {q: (float(r[c]) if r.get(c) not in (None, "", "-") else None)
                  for q, c in zip(quarters, cols)}
        if r.get("CATE1") == "전국" and r.get("CATE3") == "전국":
            national = series
        if r.get("CATE1") != "서울":
            continue
        seoul.append({"district": r["CATE2"], "area": r["CATE3"], "rentPerSqm": series})
    if not seoul:
        raise SystemExit(f"R-ONE {statbl_id}: 서울 행 없음")
    return quarters, seoul, national


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--skip-rone", action="store_true", help="R-ONE 임대료 수집 생략(그룹 벤치마크만)")
    args = ap.parse_args()

    groups = build_groups()

    seoul_rent = {}
    rent_adjustment = None
    if not args.skip_rone:
        national_by_type = {}
        for key, (statbl, label) in RONE_TABLES.items():
            quarters, rows, national = fetch_rone(statbl)
            seoul_row = next(x for x in rows if x["district"] == "서울")
            seoul_rent[key] = {
                "label": label, "statblId": statbl, "quarters": quarters,
                "seoulAvgPerSqm": seoul_row["rentPerSqm"],  # 천원/㎡, 분기별
                "nationalAvgPerSqm": national,               # 전국 평균(참고)
                "byArea": rows,                              # 서울 하위 상권 전체
            }
            national_by_type[key] = national

        # 상권유형별 임차료율 지역 보정 계수 (최신 분기, 소규모=골목 기준으로 정규화)
        latest = seoul_rent["small"]["quarters"][-1]
        base = seoul_rent["small"]["seoulAvgPerSqm"][latest]  # 골목 기준 = 소규모상가 서울 평균
        multipliers = {}
        for atype, shop in AREATYPE_SHOPTYPE.items():
            r = seoul_rent[shop]["seoulAvgPerSqm"][latest]
            multipliers[atype] = round(r / base, 4)
        seoul_avg = base
        nat_avg = national_by_type.get("small")
        rent_adjustment = {
            "quarter": latest,
            "reference": "골목상권(소규모상가 서울 평균)",
            "areaTypeShopType": AREATYPE_SHOPTYPE,
            "seoulPerSqm": {a: seoul_rent[s]["seoulAvgPerSqm"][latest] for a, s in AREATYPE_SHOPTYPE.items()},
            "areaTypeRentMultiplier": multipliers,     # 골목 1.0 기준, 발달/전통 상대 배수
            "seoulVsNationalSmall": round(seoul_avg / nat_avg[latest], 3) if nat_avg and nat_avg.get(latest) else None,
            "note": "임차료율(임차료÷매출) 벤치마크에 곱하는 상권유형 지역 보정. "
                    "㎡ 임대료와 임차료율이 1:1 비례하지 않아 상가유형 간 실측 격차만 반영(감쇠 계수 없음). "
                    "서울 전체(상권유형 미선택)에는 보정을 적용하지 않는다(전국 벤치마크 그대로).",
        }

    out = {
        "meta": {
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "sources": [
                {"name": "소상공인실태조사 시도/산업중분류별/영업비용", "org": "중소벤처기업부(KOSIS)",
                 "tblId": "DT_3ME0144", "period": "2023", "collection": "snapshot",
                 "snapshotDate": KOSIS_SNAPSHOT_DATE,
                 "url": "https://kosis.kr/statHtml/statHtml.do?orgId=142&tblId=DT_3ME0144",
                 "note": "기업체당 연간(백만원), 전국·산업대분류 소계. 뷰어 실측 추출 스냅샷"
                         "(html.do 내부 POST가 세션 의존적이라 라이브 미채택)."},
                {"name": "소상공인실태조사 기업체당 보증금 및 월세", "org": "중소벤처기업부(KOSIS)",
                 "tblId": "DT_3ME0132", "period": "2024", "collection": "snapshot",
                 "snapshotDate": KOSIS_SNAPSHOT_DATE,
                 "url": "https://kosis.kr/statHtml/statHtml.do?orgId=142&tblId=DT_3ME0132",
                 "note": "임차 기업체 평균 보증금·월세(만원)."},
                {"name": "2023년 소상공인실태조사 잠정결과(매출액·영업이익)", "org": "중소벤처기업부",
                 "period": "2023", "collection": "snapshot",
                 "url": "https://www.mss.go.kr/site/smba/ex/bbs/View.do?cbIdx=86&bcIdx=1057002",
                 "note": "업종별 기업체당 매출액·영업이익. KOSIS 영업비용과 항등식 검증 완료."},
                {"name": "상업용부동산 임대동향조사 분기별 지역별 임대료", "org": "한국부동산원(R-ONE)",
                 "period": "2024Q3~", "unit": "천원/㎡/월", "collection": "live",
                 "url": "https://www.reb.or.kr/r-one/portal/stat/easyStatPage/T248223134698125.do",
                 "note": "소규모·중대형·집합상가 3종, 서울 상권별 — 실행 시점 최신 분기 라이브 수집."},
            ],
        },
        "groups": groups,
        "rentAdjustment": rent_adjustment,
        "seoulRent": seoul_rent,
    }

    out_path = Path(__file__).resolve().parent.parent / "backend/src/main/resources/data/public_benchmarks.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)

    print(f"그룹 {len(groups)}개, 서울 임대료 {len(seoul_rent)}종 → {out_path}")
    for k, g in groups.items():
        cs = g["costStructure"]
        print(f"  {k:16s} 이익률 {g['operatingMargin']:.1%} · 원가율 {cs['purchaseRatio']:.1%}"
              f" · 인건비율 {cs['laborRatio']:.1%} · 임차료율 {cs['rentRatio']:.1%}"
              f" · 평균월세 {g['tenancy']['monthlyRentManwon']}만원")
    if seoul_rent:
        q = seoul_rent["small"]["quarters"][-1]
        print(f"  서울 임대료({q}, 천원/㎡): "
              + " · ".join(f"{v['label']} {v['seoulAvgPerSqm'][q]}" for v in seoul_rent.values()))
    if rent_adjustment:
        print("  임차료율 지역 보정 계수(골목=1.0): "
              + " · ".join(f"{a} ×{m}" for a, m in rent_adjustment["areaTypeRentMultiplier"].items()))


if __name__ == "__main__":
    main()
