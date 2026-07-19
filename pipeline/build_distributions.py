#!/usr/bin/env python3
"""
서울시 상권분석서비스 '추정매출-상권' 데이터를 업종별 점포당 월매출 분포로 가공한다.

입력
  1) 매출 CSV (둘 중 하나의 스키마)
     - 구버전(파일 내려받기, EUC-KR): 기준_년_코드, 기준_분기_코드, 상권_코드, 서비스_업종_코드,
       서비스_업종_코드_명, 당월_매출_금액(분기 매출), 점포수
     - 신버전(Open API 수집): STDR_YYQU_CD, TRDAR_CD, SVC_INDUTY_CD, SVC_INDUTY_CD_NM,
       THSMON_SELNG_AMT (분기 매출)  ※ 점포수 없음 → --stores 파일과 조인
  2) (선택) 점포 CSV: '점포-상권' 데이터 (STDR_YYQU_CD, TRDAR_CD, SVC_INDUTY_CD, STOR_CO)

핵심 가정 (README '방법론' 참고)
  - 당월_매출_금액(THSMON_SELNG_AMT)은 해당 분기의 상권×업종 전체 추정매출액이다.
    (검증: 편의점 점포당 분기 매출 중위값 1.6억 → 월 5.4천만원, 업계 공지 평균과 일치)
  - 점포당 월매출 = 분기매출 / 3 / 점포수
  - 상권×업종 단위 관측치를 점포수로 가중하여 업종별 분포(가중 백분위)를 만든다.

출력: industry_distributions.json (백엔드가 그대로 로드)
"""
import argparse
import json
import sys
from datetime import datetime, timezone

import numpy as np
import pandas as pd

# 한글 스키마 → 표준 스키마 매핑
KO_COLS = {
    "기준_년_코드": "year",
    "기준_분기_코드": "quarter",
    "기준_년분기_코드": "yyqu",
    "상권_코드": "area_cd",
    "상권_코드_명": "area_nm",
    "서비스_업종_코드": "svc_cd",
    "서비스_업종_코드_명": "svc_nm",
    "당월_매출_금액": "q_sales",
    "점포수": "stores",
}
EN_COLS = {
    "STDR_YYQU_CD": "yyqu",
    "TRDAR_CD": "area_cd",
    "TRDAR_CD_NM": "area_nm",
    "SVC_INDUTY_CD": "svc_cd",
    "SVC_INDUTY_CD_NM": "svc_nm",
    "THSMON_SELNG_AMT": "q_sales",
    "STOR_CO": "stores",
}


def read_any(path):
    for enc in ("utf-8-sig", "utf-8", "euc-kr", "cp949"):
        try:
            return pd.read_csv(path, encoding=enc, low_memory=False)
        except (UnicodeDecodeError, UnicodeError):
            continue
    raise SystemExit(f"인코딩을 인식할 수 없습니다: {path}")


def normalize(df):
    ren = {}
    for src, dst in {**KO_COLS, **EN_COLS}.items():
        if src in df.columns:
            ren[src] = dst
    df = df.rename(columns=ren)
    if "yyqu" not in df.columns:
        if {"year", "quarter"} <= set(df.columns):
            df["yyqu"] = df["year"].astype(int).astype(str) + df["quarter"].astype(int).astype(str)
        else:
            raise SystemExit("기준 년분기 컬럼을 찾을 수 없습니다.")
    df["yyqu"] = df["yyqu"].astype(str)
    return df


def weighted_quantiles(values, weights, probs):
    """가중 백분위 (선형 보간). values 오름차순 정렬 후 누적가중치 기반."""
    order = np.argsort(values)
    v = np.asarray(values)[order].astype(float)
    w = np.asarray(weights)[order].astype(float)
    cw = np.cumsum(w) - 0.5 * w  # 중앙 배치 규칙
    cw /= np.sum(w)
    return np.interp(probs, cw, v, left=v[0], right=v[-1])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sales", required=True, help="추정매출-상권 CSV")
    ap.add_argument("--stores", help="점포-상권 CSV (매출 CSV에 점포수가 없을 때)")
    ap.add_argument("--benchmarks", default="benchmarks.json")
    ap.add_argument("--out", default="industry_distributions.json")
    ap.add_argument("--min-areas", type=int, default=30,
                    help="분포 신뢰를 위해 필요한 최소 상권 수 (미달 업종 제외)")
    args = ap.parse_args()

    sales = normalize(read_any(args.sales))
    if "stores" not in sales.columns:
        if not args.stores:
            raise SystemExit("매출 데이터에 점포수가 없습니다. --stores 로 '점포-상권' CSV를 지정하세요.")
        st = normalize(read_any(args.stores))
        st = st[["yyqu", "area_cd", "svc_cd", "stores"]]
        sales = sales.merge(st, on=["yyqu", "area_cd", "svc_cd"], how="inner")

    need = {"yyqu", "area_cd", "svc_cd", "svc_nm", "q_sales", "stores"}
    missing = need - set(sales.columns)
    if missing:
        raise SystemExit(f"필수 컬럼 누락: {missing}")

    d = sales[(sales["stores"] > 0) & (sales["q_sales"] > 0)].copy()
    d["monthly_per_store"] = d["q_sales"] / 3.0 / d["stores"]

    # 상권×업종 단위: 여러 분기 → 평균 (계절성 완화)
    grp = d.groupby(["svc_cd", "svc_nm", "area_cd"], as_index=False).agg(
        monthly_per_store=("monthly_per_store", "mean"),
        stores=("stores", "mean"),
    )

    with open(args.benchmarks, encoding="utf-8") as f:
        bm = json.load(f)
    groups = bm["groups"]
    imap = bm["industryGroupMap"]
    prefx = bm["prefixDefaults"]

    def group_of(code):
        return imap.get(code) or prefx.get(code[:3], "overall")

    probs = np.linspace(0, 1, 101)
    industries = []
    skipped = []
    for (svc_cd, svc_nm), g in grp.groupby(["svc_cd", "svc_nm"]):
        if len(g) < args.min_areas:
            skipped.append(f"{svc_cd} {svc_nm} (상권 {len(g)}개)")
            continue
        q = weighted_quantiles(g["monthly_per_store"].values, g["stores"].values, probs)
        gkey = group_of(svc_cd)
        ginfo = groups[gkey]
        industries.append({
            "code": svc_cd,
            "name": svc_nm,
            "group": gkey,
            "groupLabel": ginfo["label"],
            "marginBenchmark": ginfo["operatingMargin"],
            "nAreas": int(len(g)),
            "nStores": int(round(g["stores"].sum())),
            "medianMonthlySales": float(q[50]),
            "meanMonthlySales": float(np.average(g["monthly_per_store"], weights=g["stores"])),
            "quantiles": [float(x) for x in q],
        })

    quarters = sorted(d["yyqu"].unique().tolist())
    out = {
        "meta": {
            "sourceDataset": "서울시 상권분석서비스(추정매출-상권), 서울 열린데이터광장 OA-15572",
            "sourceUrl": "https://data.seoul.go.kr/dataList/OA-15572/S/1/datasetView.do",
            "quartersCovered": quarters,
            "unit": "KRW / month / store",
            "methodology": "점포당 월매출 = 분기 추정매출 ÷ 3 ÷ 점포수. 상권×업종 관측치를 점포수로 가중한 백분위 분포.",
            "benchmarkSource": bm["source"],
            "generatedAt": datetime.now(timezone.utc).isoformat(),
        },
        "benchmarkGroups": groups,
        "industries": sorted(industries, key=lambda x: x["code"]),
    }
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)

    print(f"업종 {len(industries)}개 생성, 제외 {len(skipped)}개 → {args.out}")
    for s in skipped:
        print("  제외:", s, file=sys.stderr)


if __name__ == "__main__":
    main()
