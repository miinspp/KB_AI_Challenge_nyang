#!/usr/bin/env python3
"""
서울 열린데이터광장 Open API에서 최신 '추정매출-상권'(VwsmTrdarSelngQq)과
'점포-상권'(VwsmTrdarStorQq) 데이터를 전량 수집해 CSV로 저장한다.

사용법
  # 방법 1) 프로젝트 루트 .env 에 SEOUL_OPENAPI_KEY=... 를 넣어두면 자동 로드 (python-dotenv 필요)
  # 방법 2) 셸 환경변수:  export SEOUL_OPENAPI_KEY=발급받은키
  #   키 발급: https://data.seoul.go.kr → 인증키 신청 (즉시 발급, 무료)
  python3 collect_seoul_sales.py --out-dir raw

수집 후:
  python3 build_distributions.py \
      --sales raw/sales_latest.csv --stores raw/stores_latest.csv \
      --out ../backend/src/main/resources/data/industry_distributions.json
"""
import argparse
import csv
import json
import os
import sys
import time
import urllib.request

# 프로젝트 루트 .env 자동 로드 (python-dotenv 설치 시). 미설치면 실제 환경변수(export/source)를 사용.
try:
    from pathlib import Path
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
except ImportError:
    pass

BASE = "http://openapi.seoul.go.kr:8088"
PAGE = 1000  # API 1회 최대 조회 건수

SERVICES = {
    "VwsmTrdarSelngQq": ("sales", ["STDR_YYQU_CD", "TRDAR_SE_CD", "TRDAR_SE_CD_NM", "TRDAR_CD",
                                    "TRDAR_CD_NM", "SVC_INDUTY_CD", "SVC_INDUTY_CD_NM",
                                    "THSMON_SELNG_AMT", "THSMON_SELNG_CO"]),
    "VwsmTrdarStorQq": ("stores", ["STDR_YYQU_CD", "TRDAR_SE_CD", "TRDAR_SE_CD_NM", "TRDAR_CD",
                                    "TRDAR_CD_NM", "SVC_INDUTY_CD", "SVC_INDUTY_CD_NM", "STOR_CO"]),
}


def fetch(url, retries=3):
    for i in range(retries):
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:  # noqa: BLE001
            if i == retries - 1:
                raise
            print(f"  재시도 {i + 1}: {e}", file=sys.stderr)
            time.sleep(3 * (i + 1))


def collect(key, service, out_path, keep_cols):
    start, total, rows = 1, None, 0
    writer = None
    with open(out_path, "w", newline="", encoding="utf-8-sig") as f:
        while total is None or start <= total:
            end = start + PAGE - 1
            url = f"{BASE}/{key}/json/{service}/{start}/{end}/"
            data = fetch(url)
            body = data.get(service)
            if body is None:
                res = data.get("RESULT", {})
                raise SystemExit(f"API 오류: {res.get('CODE')} {res.get('MESSAGE')}")
            if total is None:
                total = int(body["list_total_count"])
                print(f"{service}: 총 {total:,}건")
            for row in body.get("row", []):
                if writer is None:
                    cols = [c for c in keep_cols if c in row] or list(row.keys())
                    writer = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
                    writer.writeheader()
                writer.writerow(row)
                rows += 1
            print(f"  {min(end, total):,}/{total:,}")
            start = end + 1
            time.sleep(0.2)  # 호출 간격 (서버 부하 방지)
    print(f"→ {out_path} ({rows:,}건)")


def latest_quarters(path, n=4):
    """수집본에서 최신 n개 분기만 남긴 *_latest.csv 생성 (전 분기 데이터가 큰 경우 대비)."""
    import pandas as pd
    df = pd.read_csv(path, dtype={"STDR_YYQU_CD": str})
    qs = sorted(df["STDR_YYQU_CD"].unique())[-n:]
    out = path.replace(".csv", "_latest.csv").replace("_all", "")
    df[df["STDR_YYQU_CD"].isin(qs)].to_csv(out, index=False, encoding="utf-8-sig")
    print(f"→ {out} (분기 {qs})")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out-dir", default="raw")
    ap.add_argument("--quarters", type=int, default=4, help="분포 계산에 사용할 최신 분기 수")
    args = ap.parse_args()

    key = os.environ.get("SEOUL_OPENAPI_KEY")
    if not key:
        raise SystemExit("환경변수 SEOUL_OPENAPI_KEY 가 필요합니다. data.seoul.go.kr에서 무료 발급.")

    os.makedirs(args.out_dir, exist_ok=True)
    for service, (name, cols) in SERVICES.items():
        all_path = os.path.join(args.out_dir, f"{name}_all.csv")
        collect(key, service, all_path, cols)
        latest_quarters(all_path, args.quarters)


if __name__ == "__main__":
    main()
