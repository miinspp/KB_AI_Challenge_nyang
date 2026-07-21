package com.nyang.rank.application;

import com.nyang.industry.domain.Industry;
import com.nyang.rank.application.dto.RankRequest;
import com.nyang.rank.application.dto.RankResponse;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 상대적 위치(상위 %) 산출 로직.
 *
 * 기본 3축 (항상 산출):
 * 1) 매출 퍼센타일 — 서울시 추정매출 실측 분포(점포수 가중 백분위 격자)에서 역보간.
 * 2) 순수익 퍼센타일 — 동일 매출 분포에 소상공인실태조사 업종 평균 영업이익률을 적용해
 *    유도한 동종 순수익 분포에서 역보간. (개별 점포의 이익률 분산은 반영하지 못함 — 한계 명시)
 * 3) 비용 효율 점수 — 사용자 영업이익률 / 업종 벤치마크 이익률 비율을 50점 기준으로 환산한
 *    휴리스틱 (벤치마크와 같으면 50점, 2배면 100점, 0 이하면 0점).
 * 기본 종합 = 가중평균(기본 0.5/0.3/0.2).
 *
 * v2 보정축 (입력이 있을 때만 활성화, 각 15% — "규모가 크면 무조건 상위" 편향을 상쇄하는 정규화 지표):
 * 4) 비용 구조 건전성 — 임대료 부담률(임대료÷매출). 10% 이하 건전 경험칙, 25% 이상 0점 선형.
 * 5) 매출 안정성 — 최근 월별 매출(3개월 이상)의 추세(월평균 성장률)·변동성(변동계수) 50:50.
 *
 * 종합점수 = (1 − 활성 보정축 가중치 합) × 기본 종합 + Σ(보정축 가중치 × 점수)
 * 상위% = 100 − 종합점수. 보정 입력이 없으면 v1 과 동일한 결과를 낸다(하위호환).
 */
@Service
public class RankService {

    private static final double W_SALES = 0.5, W_PROFIT = 0.3, W_MARGIN = 0.2;
    private static final double W_COST = 0.15, W_STABILITY = 0.15;

    // 비용 구조: 임대료 부담률 경험칙 (10% 이하 건전 → 만점, 25% 이상 → 0점)
    private static final double RENT_HEALTHY = 0.10, RENT_CRITICAL = 0.25;
    // 안정성: 월평균 성장률 ±5%/월에서 포화, 변동계수 5% 이하 안정 ~ 30% 이상 불안정
    private static final double TREND_SATURATION = 0.05;
    private static final double CV_STABLE = 0.05, CV_CRITICAL = 0.30;
    private static final int MIN_HISTORY_MONTHS = 3;

    /**
     * 백분위 격자(quantiles[0..100], 비감소)에서 값 v의 퍼센타일을 역보간으로 구한다.
     * 동일값 구간(플랫 구간)은 구간 중앙 퍼센타일을 돌려준다.
     */
    public double percentileOf(List<Double> q, double v) {
        int n = q.size() - 1; // 100
        if (v <= q.get(0)) return 0.0;
        if (v >= q.get(n)) return 100.0;
        // i = q[i] <= v 인 가장 큰 인덱스
        int lo = 0, hi = n;
        while (lo < hi) {
            int mid = (lo + hi + 1) >>> 1;
            if (q.get(mid) <= v) lo = mid; else hi = mid - 1;
        }
        int i = lo;
        // j = q[j] >= v 인 가장 작은 인덱스
        lo = 0; hi = n;
        while (lo < hi) {
            int mid = (lo + hi) >>> 1;
            if (q.get(mid) >= v) hi = mid; else lo = mid + 1;
        }
        int j = lo;
        if (j <= i) return (i + j) / 2.0;           // v가 격자값과 정확히 일치 (플랫 구간 중앙)
        double qi = q.get(i), qj = q.get(j);        // j == i + 1, qi < v < qj
        return i + (v - qi) / (qj - qi);
    }

    /** 벤치마크 이익률 대비 비율을 0~100 점수로 환산 (같으면 50, 2배 이상 100, 0 이하 0). */
    public double marginScore(double userMargin, double benchmark) {
        if (benchmark <= 0) return 0;
        if (userMargin <= 0) return 0;
        return Math.min(100.0, 50.0 * userMargin / benchmark);
    }

    /** 임대료 부담률 → 0~100 점수. 10% 이하 100점, 25% 이상 0점, 사이 선형. */
    public double rentBurdenScore(double rentBurden) {
        return clamp(100.0 * (RENT_CRITICAL - rentBurden) / (RENT_CRITICAL - RENT_HEALTHY));
    }

    /** 월평균 성장률 → 0~100 점수. 0%/월 = 50점, ±5%/월에서 포화. */
    public double trendScore(double growthPerMonth) {
        return clamp(50.0 + 50.0 * (growthPerMonth / TREND_SATURATION));
    }

    /** 변동계수(CV) → 0~100 점수. 5% 이하 100점, 30% 이상 0점, 사이 선형. */
    public double volatilityScore(double cv) {
        return clamp(100.0 * (CV_CRITICAL - cv) / (CV_CRITICAL - CV_STABLE));
    }

    /** 비용 구조 축 — rent 가 있어야 산출, 없으면 null. */
    RankResponse.CostHealth costHealth(RankRequest.CostBreakdown cb, double sales) {
        if (cb == null || cb.rent() == null || sales <= 0) return null;
        double rentBurden = cb.rent() / sales;
        Double laborRatio = cb.laborCost() == null ? null : round4(cb.laborCost() / sales);
        Double purchaseRatio = cb.purchaseCost() == null ? null : round4(cb.purchaseCost() / sales);
        return new RankResponse.CostHealth(
                round4(rentBurden), laborRatio, purchaseRatio, round1(rentBurdenScore(rentBurden)));
    }

    /** 매출 안정성 축 — 유효 매출 3개월 이상이어야 산출, 없으면 null. */
    RankResponse.Stability stability(List<RankRequest.MonthlyAmount> history) {
        if (history == null) return null;
        double[] y = history.stream().filter(m -> m != null && m.amount() > 0)
                .mapToDouble(RankRequest.MonthlyAmount::amount).toArray();
        int n = y.length;
        if (n < MIN_HISTORY_MONTHS) return null;

        double mean = 0;
        for (double v : y) mean += v;
        mean /= n;
        if (mean <= 0) return null;

        // OLS 기울기 (x = 0..n-1) ÷ 평균 = 월평균 성장률
        double xMean = (n - 1) / 2.0, cov = 0, var = 0;
        for (int i = 0; i < n; i++) {
            cov += (i - xMean) * (y[i] - mean);
            var += (i - xMean) * (i - xMean);
        }
        double growth = (cov / var) / mean;

        // 변동계수 CV = 표준편차 ÷ 평균
        double sq = 0;
        for (double v : y) sq += (v - mean) * (v - mean);
        double cv = Math.sqrt(sq / n) / mean;

        double ts = trendScore(growth), vs = volatilityScore(cv);
        return new RankResponse.Stability(
                n, round4(growth), round4(cv), round1(ts), round1(vs), round1(0.5 * ts + 0.5 * vs));
    }

    public RankResponse rank(Industry ind, RankRequest req) {
        double sales = req.monthlySales();
        double expense = req.monthlyExpense();
        double netProfit = sales - expense;
        double userMargin = sales > 0 ? netProfit / sales : 0;

        List<Double> q = ind.quantiles();

        double salesPct = percentileOf(q, sales);

        // 동종 순수익 유도 분포: 매출 분포 × 업종 평균 영업이익률 (단조 변환 → 격자 그대로 스케일)
        List<Double> profitQ = q.stream().map(x -> x * ind.marginBenchmark()).toList();
        double profitPct = percentileOf(profitQ, netProfit);

        double mScore = marginScore(userMargin, ind.marginBenchmark());

        double ws = W_SALES, wp = W_PROFIT, wm = W_MARGIN;
        if (req.weights() != null) {
            double s = req.weights().sales(), p = req.weights().profit(), m = req.weights().margin();
            double sum = s + p + m;
            if (s >= 0 && p >= 0 && m >= 0 && sum > 0) {
                ws = s / sum; wp = p / sum; wm = m / sum;
            }
        }

        // v2 보정축 — 입력이 있을 때만 활성화
        RankResponse.CostHealth costHealth = costHealth(req.costBreakdown(), sales);
        RankResponse.Stability stability = stability(req.salesHistory());
        double extraW = (costHealth != null ? W_COST : 0) + (stability != null ? W_STABILITY : 0);
        double extraSum = (costHealth != null ? W_COST * costHealth.score() : 0)
                + (stability != null ? W_STABILITY * stability.score() : 0);

        double base = ws * salesPct + wp * profitPct + wm * mScore;
        double composite = (1 - extraW) * base + extraSum;
        double topPercent = round1(Math.max(0.1, 100.0 - composite));

        RankResponse.Component salesC = new RankResponse.Component(
                sales, round1(salesPct), round1(100 - salesPct),
                q.get(50), q.get(25), q.get(75));
        RankResponse.Component profitC = new RankResponse.Component(
                netProfit, round1(profitPct), round1(100 - profitPct),
                profitQ.get(50), profitQ.get(25), profitQ.get(75));
        RankResponse.MarginComponent marginC = new RankResponse.MarginComponent(
                round4(userMargin), ind.marginBenchmark(), round1(mScore));

        Map<String, Double> weightsUsed = new LinkedHashMap<>();
        weightsUsed.put("sales", round4(ws * (1 - extraW)));
        weightsUsed.put("profit", round4(wp * (1 - extraW)));
        weightsUsed.put("margin", round4(wm * (1 - extraW)));
        if (costHealth != null) weightsUsed.put("cost", W_COST);
        if (stability != null) weightsUsed.put("stability", W_STABILITY);

        List<String> notes = new ArrayList<>(List.of(
                "매출 퍼센타일은 서울시 상권분석서비스 추정매출 실측 분포 기준입니다.",
                "순수익 퍼센타일은 매출 분포에 소상공인실태조사 업종 평균 영업이익률("
                        + Math.round(ind.marginBenchmark() * 1000) / 10.0 + "%, "
                        + ind.groupLabel() + ")을 적용해 유도한 분포 기준으로, 점포별 이익률 편차는 반영되지 않습니다.",
                "비용 효율 점수는 업종 평균 이익률 대비 비율 환산 휴리스틱입니다(평균=50점)."
        ));
        if (costHealth != null) {
            notes.add("비용 구조 점수는 임대료 부담률(임대료÷매출 = "
                    + Math.round(costHealth.rentBurden() * 1000) / 10.0
                    + "%) 기반 경험칙입니다 — 10% 이하 건전(100점), 25% 이상 위험(0점), 선형 환산. "
                    + "매입·인건비 비율은 업종별 기준 분포 데이터가 없어 참고 지표로만 제공합니다.");
        }
        if (stability != null) {
            notes.add("매출 안정성 점수는 최근 " + stability.months() + "개월 매출의 월평균 성장률("
                    + Math.round(stability.trendPerMonth() * 1000) / 10.0 + "%/월, ±5%에서 포화)과 변동계수("
                    + Math.round(stability.volatility() * 1000) / 10.0 + "%, 5% 이하 안정~30% 이상 불안정)를 50:50 합산한 지표입니다.");
        }
        if (extraW > 0) {
            notes.add("종합점수 = 기본 3축(매출·순수익·비용효율) " + Math.round((1 - extraW) * 100)
                    + "% + 보정축(" + (costHealth != null ? "비용구조 15%" : "")
                    + (costHealth != null && stability != null ? " · " : "")
                    + (stability != null ? "매출안정성 15%" : "")
                    + ") — 규모 편향을 줄이기 위한 정규화 보정입니다.");
        }

        // 상권유형(골목/발달/전통시장) 지정 시 동일 유형 분포로 보조 순위 산출 (같은 가중치·보정 적용)
        RankResponse.AreaRank areaRank = null;
        if (req.areaType() != null && !req.areaType().isBlank()) {
            Industry.AreaTypeDist at = ind.areaTypes() == null ? null : ind.areaTypes().get(req.areaType());
            if (at != null) {
                double atSalesPct = percentileOf(at.quantiles(), sales);
                List<Double> atProfitQ = at.quantiles().stream().map(x -> x * ind.marginBenchmark()).toList();
                double atProfitPct = percentileOf(atProfitQ, netProfit);
                double atBase = ws * atSalesPct + wp * atProfitPct + wm * mScore;
                double atComposite = (1 - extraW) * atBase + extraSum;
                areaRank = new RankResponse.AreaRank(
                        req.areaType(), round1(atComposite), round1(Math.max(0.1, 100.0 - atComposite)),
                        round1(atSalesPct), round1(100 - atSalesPct),
                        at.nAreas(), at.nStores(), at.quantiles().get(50));
                notes.add("상권유형 비교는 동일 업종 중 " + req.areaType()
                        + " 점포 분포만으로 같은 방식(동일 가중치)으로 산출한 보조 지표입니다.");
            } else {
                notes.add("이 업종은 '" + req.areaType() + "' 표본 상권이 부족해 상권유형 비교를 제공하지 않습니다.");
            }
        }

        return new RankResponse(
                ind.code(), ind.name(), ind.groupLabel(),
                round1(composite), topPercent,
                salesC, profitC, marginC,
                costHealth, stability,
                weightsUsed,
                new RankResponse.Peer(ind.nAreas(), ind.nStores(), ind.medianMonthlySales()),
                areaRank,
                notes);
    }

    private static double clamp(double v) { return Math.max(0.0, Math.min(100.0, v)); }
    private static double round1(double v) { return Math.round(v * 10) / 10.0; }
    private static double round4(double v) { return Math.round(v * 10000) / 10000.0; }
}
