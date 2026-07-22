#!/usr/bin/env python3
"""
공공데이터 벤치마크 수집 — 산출식 v2 비용구조·임대료 근거 데이터.

수집원 (모두 인증키 불필요)
  ① KOSIS 소상공인실태조사 (중소벤처기업부, orgId=142)
     - DT_3ME0144  시도/산업중분류별/영업비용 (2023, 기업체당 연간 백만원,
                   비목: 매출원가·급여총액·임차료·기타)
     - DT_3ME0132  시도/산업중분류별/기업체당 보증금 및 월세 (최신연도, 임차 기업체 평균 만원)
     ※ KOSIS statHtml 뷰어의 내부 렌더링 URL(statHtmlContent.do)이 세션 없이 응답한다.
  ② 한국부동산원 상업용부동산 임대동향조사 (R-ONE)
     - 소규모상가 T248223134698125 / 중대형상가 T244363134858603 / 집합상가 T244913134948657
       분기별 지역별 임대료 (천원/㎡, 2024Q3~) — 서울 상권별 행만 보관
     ※ R-ONE easyStat 뷰어의 내부 JSON URL(sttsDataPreviewList.do)이 세션 없이 응답한다.

업종별 매출액·영업이익(2023)은 KOSIS에 기업체당 평균 표가 없어
중소벤처기업부 보도자료(2023년 소상공인실태조사 잠정결과, 2025-02-27) 수치를 상수로 두고,
KOSIS 영업비용과 `매출액 − 영업이익 == 영업비용` 항등식을 검증한다(불일치 시 실패).

출력: ../backend/src/main/resources/data/public_benchmarks.json
사용처: 백엔드 RankService 비용구조 축(임차료율·인건비율·원가율 벤치마크), 리포트 참고 표기.
"""
import json
import re
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

KOSIS_URL = "https://kosis.kr/statHtml/html.do"
RONE_URL = "https://www.reb.or.kr/r-one/portal/stat/sttsDataPreviewList.do"

# KOSIS 시도 코드(OV_L1)와 산업 대분류 코드(OV_L2) — 소상공인실태조사 공통
KOSIS_SIDO = ["00", "11", "21", "22", "23", "24", "25", "26", "29",
              "31", "32", "33", "34", "35", "36", "37", "38", "39"]
KOSIS_IND1 = ["0", "C", "F", "G", "I", "J", "L", "M", "N", "P", "R", "S"]

# 실태조사 산업 대분류 → 서비스 벤치마크 그룹 키
GROUP_MAP = {
    "전산업": "overall",
    "숙박 및 음식점업": "food",
    "도매 및 소매업": "retail",
    "교육 서비스업": "education",
    "예술, 스포츠 및 여가관련 서비스업": "leisure",
    "협회 및 단체, 수리 및 기타 개인서비스업": "repair_personal",
}

# 2023년 기업체당 연간 매출액·영업이익 (백만원) — 중기부 보도자료 (모집단: 기업통계등록부 596.1만)
# https://www.mss.go.kr/site/smba/ex/bbs/View.do?cbIdx=86&bcIdx=1057002
MSS_2023 = {
    "overall": {"sales": 199, "profit": 25},
    "food": {"sales": 151, "profit": 32},
    "retail": {"sales": 260, "profit": 24},
    "education": {"sales": 75, "profit": 24},
    "leisure": {"sales": 92, "profit": 23},
    "repair_personal": {"sales": 67, "profit": 20},
}

RONE_TABLES = {
    "small": ("T248223134698125", "소규모상가"),
    "mediumLarge": ("T244363134858603", "중대형상가"),
    "collective": ("T244913134948657", "집합상가"),
}


def http(url, data=None, headers=None):
    req = urllib.request.Request(url, data=data, headers={"User-Agent": "Mozilla/5.0", **(headers or {})})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode("utf-8")


class KosisTable(HTMLParser):
    """statHtmlContent.do 의 #mainTable 을 (시도, 산업1, 산업2, 값들) 행으로 복원.

    행 구조: 헤더 셀(trHeader/merge) 뒤 값 셀(value, title 속성에 수치).
    시도·산업1은 rowspan 병합이라 등장할 때만 갱신하며 이후 행에 이어진다.
    """

    def __init__(self):
        super().__init__()
        self.in_table = self.in_row = False
        self.cur_heads, self.cur_vals = [], []
        self.rows = []
        self.headers = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "table" and a.get("id") == "mainTable":
            self.in_table = True
        if not self.in_table:
            return
        if tag == "tr":
            self.in_row = True
            self.cur_heads, self.cur_vals = [], []
        if tag == "th" and a.get("title"):
            self.headers.append(a["title"])
        if self.in_row and tag == "td":
            cls = a.get("class", "")
            title = a.get("title")
            if "value" in cls:
                self.cur_vals.append((title or "").replace(",", ""))
            elif title:  # trHeader/merge — 병합 셀도 title 은 유지된다
                self.cur_heads.append(title)

    def handle_endtag(self, tag):
        if tag == "table" and self.in_table:
            self.in_table = False
        if tag == "tr" and self.in_row:
            self.in_row = False
            if self.cur_vals:
                self.rows.append((list(self.cur_heads), list(self.cur_vals)))


def kosis_body(tbl, year, items):
    """statHtml 뷰어가 내부적으로 보내는 html.do POST 파라미터를 재구성한다.
    (뷰어 요청을 관찰해 확인 — 인증키·세션 불필요. 전국+시도 × 산업 대분류 소계, 단일 연도.)
    """
    field = [{"targetId": "PRD", "targetValue": "", "prdValue": f"Y,{year},@"}]
    field += [{"targetId": "ITM_ID", "targetValue": t, "prdValue": ""} for t in items]
    field += [{"targetId": "OV_L1_ID", "targetValue": c, "prdValue": ""} for c in KOSIS_SIDO]
    field += [{"targetId": "OV_L2_ID", "targetValue": c, "prdValue": ""} for c in KOSIS_IND1]
    cells = len(KOSIS_SIDO) * len(KOSIS_IND1) * len(items)
    params = {
        "jsonStr": "", "orgId": "142", "tblId": tbl, "language": "ko",
        "fieldList": json.dumps(field, separators=(",", ":")),
        "colAxis": "TIME,ITEM", "rowAxis": "A,B", "isFirst": "N", "contextPath": "/statHtml",
        "vwCd": "MT_ZTITLE", "statId": "2019021", "pubLog": "0", "viewKind": "1",
        "doAnal": "N", "dataOpt": "ko", "view": "table", "mobChk": "false",
        "defaulPeriodArr": json.dumps({"Y": [int(year)]}, separators=(",", ":")),
        "defaultClassArr": json.dumps([
            {"objVarId": "A", "data": KOSIS_SIDO, "classType": 1, "classLvlCnt": len(KOSIS_SIDO)},
            {"objVarId": "B", "data": KOSIS_IND1, "classType": 1, "classLvlCnt": len(KOSIS_IND1)},
        ], separators=(",", ":")),
        "defaultItmArr": json.dumps([{"data": items}], separators=(",", ":")),
        "existStblCmmtKor": "Y", "existStblCmmtEng": "N",
        "classAllArr": '[{"objVarId":"A","ovlSn":"1"},{"objVarId":"B","ovlSn":"2"}]',
        "classSet": '[{"objVarId":"A","ovlSn":"1","visible":"true"},{"objVarId":"B","ovlSn":"2","visible":"true"}]',
        "selectAllFlag": "N", "periodStr": "Y", "funcPrdSe": "Y", "tblNm": tbl,
        "dbUser": "NSI.", "usePivot": "N", "itemMultiply": str(cells),
        "p_classAllChkYn": "N", "p_classAllSelectYn": "N", "cmmtChk": "Y",
        "diviSearchYn": "N", "orderStr": "OV_L1_ID,OV_L2_ID,TIME,CHAR_ITM_ID",
        "startNum": "1", "endNum": str(cells), "reqCellCnt": str(cells),
        "lastChk": "N", "colClsAt": "N", "analyzable": "true", "expDash": "Y",
        "downGridFileType": "xlsx", "downGridCellMerge": "Y", "downGridMeta": "Y",
        "downSort": "asc", "pointType": "screen", "downLargeFileType": "excel",
        "downLargeExprType": "1", "downLargeSort": "asc", "format": "xml",
        "prdseSelect": "N", "prdSortPop": "asc", "assayLeft": "none",
        "assayselectType": "none", "assayRight": "none", "tableType": "default",
        "dataOpt2": "ko", "enableLevelExpr": "Y", "prdSort": "asc",
        "isChangedDataOpt": "", "isChangedTableType": "N", "isChangedPeriodCo": "N",
        "isChangedPrdSort": "N", "inheritYn": "N", "labelOriginData": "원자료 함께 보기",
    }
    body = urllib.parse.urlencode(params)
    body += "&naviInfo=tabItemText&naviInfo=A&naviInfo=B&naviInfo=tabTimeText"
    return body.encode()


def fetch_kosis(tbl, year, items):
    raw = http(KOSIS_URL, data=kosis_body(tbl, year, items),
               headers={"Content-Type": "application/x-www-form-urlencoded",
                        "X-Requested-With": "XMLHttpRequest",
                        "Referer": "https://kosis.kr/statHtml/statHtml.do"})
    resp = json.loads(raw)
    if "result" not in resp:
        raise SystemExit(f"KOSIS {tbl}: 예상 밖 응답 {str(resp)[:200]}")
    parser = KosisTable()
    parser.feed("".join(resp["result"]))
    # 병합 셀도 title 을 유지하므로 각 행의 heads = [시도, 산업...]. 전국 행만 채택.
    out = {}
    for heads, vals in parser.rows:
        if not heads or heads[0] != "전국":
            continue
        name = heads[-1] if heads[-1] != "소계" else heads[-2]
        out.setdefault(name, vals)
    if not out:
        raise SystemExit(f"KOSIS {tbl}: 전국 행을 찾지 못함")
    return out, parser.headers


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
    seoul = []
    for r in rows:
        if r.get("CATE1") != "서울":
            continue
        series = {q: (float(r[c]) if r.get(c) not in (None, "", "-") else None)
                  for q, c in zip(quarters, cols)}
        seoul.append({"district": r["CATE2"], "area": r["CATE3"], "rentPerSqm": series})
    if not seoul:
        raise SystemExit(f"R-ONE {statbl_id}: 서울 행 없음")
    return quarters, seoul


def main():
    # ① 영업비용 비목 (2023) — [기업체수, 영업비용, 매출원가, 급여총액, 임차료, 기타]
    cost_rows, cost_headers = fetch_kosis("DT_3ME0144", "2023", ["T01", "T02", "T06", "T03", "T04", "T05"])
    if not any("임차료" in h for h in cost_headers):
        raise SystemExit(f"영업비용 표 헤더 이상: {cost_headers}")
    cost_year = next((h for h in cost_headers if re.fullmatch(r"20\d\d", h)), "2023")
    # ② 보증금·월세 (2024) — [보증금있는월세_보증금, 월세, 보증금없는월세, 전세, 비율지급액, 비율%]
    rent_rows, rent_headers = fetch_kosis("DT_3ME0132", "2024", ["T01", "T02", "T06", "T03", "T04", "T05"])
    if not any("월세" in h for h in rent_headers):
        raise SystemExit(f"보증금·월세 표 헤더 이상: {rent_headers}")
    rent_year = next((h for h in rent_headers if re.fullmatch(r"20\d\d", h)), "2024")

    groups = {}
    for ind_name, key in GROUP_MAP.items():
        c = cost_rows.get(ind_name)
        r = rent_rows.get(ind_name)
        if not c:
            raise SystemExit(f"영업비용 표에 '{ind_name}' 없음")
        n, cost, cogs, labor, rent, other = (float(x) for x in c[:6])
        sales = float(MSS_2023[key]["sales"])
        profit = float(MSS_2023[key]["profit"])
        # 항등식 검증: 보도자료 매출-이익 = KOSIS 영업비용 (반올림 ±1백만원 허용)
        if abs((sales - profit) - cost) > 1:
            raise SystemExit(f"{ind_name}: 매출({sales})-이익({profit}) != 영업비용({cost})")
        groups[key] = {
            "industryLabel": ind_name,
            "nFirms": int(n),
            "annualSalesMillionKrw": sales,
            "annualProfitMillionKrw": profit,
            "annualCostMillionKrw": cost,
            "operatingMargin": round(profit / sales, 4),
            "costStructure": {
                "purchaseCost": cogs, "laborCost": labor, "rent": rent, "otherCost": other,
                "purchaseRatio": round(cogs / sales, 4),   # 원가율 (÷매출)
                "laborRatio": round(labor / sales, 4),     # 인건비율
                "rentRatio": round(rent / sales, 4),       # 임차료율
            },
            "tenancy": None if not r else {
                "depositManwon": float(r[0]),          # 보증금 있는 월세 평균 보증금
                "monthlyRentManwon": float(r[1]),      # 평균 월세 (임차 기업체 기준)
                "year": rent_year,
            },
        }

    # ③ 서울 상가 임대료 (R-ONE)
    seoul_rent = {}
    for key, (statbl, label) in RONE_TABLES.items():
        quarters, rows = fetch_rone(statbl)
        seoul_row = next(x for x in rows if x["district"] == "서울")
        seoul_rent[key] = {
            "label": label, "statblId": statbl, "quarters": quarters,
            "seoulAvgPerSqm": seoul_row["rentPerSqm"],   # 천원/㎡, 분기별
            "byArea": rows,                               # 서울 하위 상권 전체
        }

    out = {
        "meta": {
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "sources": [
                {"name": "소상공인실태조사 시도/산업중분류별 영업비용", "org": "중소벤처기업부(KOSIS)",
                 "tblId": "DT_3ME0144", "period": cost_year,
                 "url": "https://kosis.kr/statHtml/statHtml.do?orgId=142&tblId=DT_3ME0144",
                 "note": "기업체당 연간(백만원). 모집단=기업통계등록부(등록기반 개편, 2023~)."},
                {"name": "소상공인실태조사 기업체당 보증금 및 월세", "org": "중소벤처기업부(KOSIS)",
                 "tblId": "DT_3ME0132", "period": rent_year,
                 "url": "https://kosis.kr/statHtml/statHtml.do?orgId=142&tblId=DT_3ME0132",
                 "note": "임차 기업체 평균(만원)."},
                {"name": "2023년 소상공인실태조사 잠정결과 발표(매출액·영업이익)", "org": "중소벤처기업부",
                 "period": "2023",
                 "url": "https://www.mss.go.kr/site/smba/ex/bbs/View.do?cbIdx=86&bcIdx=1057002",
                 "note": "업종별 기업체당 매출액·영업이익. KOSIS 영업비용과 항등식 검증 완료."},
                {"name": "상업용부동산 임대동향조사 분기별 지역별 임대료", "org": "한국부동산원(R-ONE)",
                 "period": "2024Q3~", "unit": "천원/㎡/월",
                 "url": "https://www.reb.or.kr/r-one/portal/stat/easyStatPage/T248223134698125.do",
                 "note": "소규모·중대형·집합상가 3종, 서울 상권별."},
            ],
        },
        "groups": groups,
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
              + (f" · 평균월세 {g['tenancy']['monthlyRentManwon']:.0f}만원" if g["tenancy"] else ""))


if __name__ == "__main__":
    main()
