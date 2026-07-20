package com.nyang.rank.application;

import com.nyang.industry.domain.Industry;
import com.nyang.rank.application.dto.RankRequest;
import com.nyang.rank.application.dto.RankResponse;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 상대적 위치(상위 %) 산출 로직.
 *
 * 1) 매출 퍼센타일 — 서울시 추정매출 실측 분포(점포수 가중 백분위 격자)에서 역보간.
 * 2) 순수익 퍼센타일 — 동일 매출 분포에 소상공인실태조사 업종 평균 영업이익률을 적용해
 *    유도한 동종 순수익 분포에서 역보간. (개별 점포의 이익률 분산은 반영하지 못함 — 한계 명시)
 * 3) 비용 효율 점수 — 사용자 영업이익률 / 업종 벤치마크 이익률 비율을 50점 기준으로 환산한
 *    휴리스틱 (벤치마크와 같으면 50점, 2배면 100점, 0 이하면 0점).
 * 종합점수 = 가중평균(기본 0.5/0.3/0.2), 상위% = 100 - 종합점수.
 */
@Service
public class RankService {

    private static final double W_SALES = 0.5, W_PROFIT = 0.3, W_MARGIN = 0.2;

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

        double composite = ws * salesPct + wp * profitPct + wm * mScore;
        double topPercent = round1(Math.max(0.1, 100.0 - composite));

        RankResponse.Component salesC = new RankResponse.Component(
                sales, round1(salesPct), round1(100 - salesPct),
                q.get(50), q.get(25), q.get(75));
        RankResponse.Component profitC = new RankResponse.Component(
                netProfit, round1(profitPct), round1(100 - profitPct),
                profitQ.get(50), profitQ.get(25), profitQ.get(75));
        RankResponse.MarginComponent marginC = new RankResponse.MarginComponent(
                round4(userMargin), ind.marginBenchmark(), round1(mScore));

        List<String> notes = new ArrayList<>(List.of(
                "매출 퍼센타일은 서울시 상권분석서비스 추정매출 실측 분포 기준입니다.",
                "순수익 퍼센타일은 매출 분포에 소상공인실태조사 업종 평균 영업이익률("
                        + Math.round(ind.marginBenchmark() * 1000) / 10.0 + "%, "
                        + ind.groupLabel() + ")을 적용해 유도한 분포 기준으로, 점포별 이익률 편차는 반영되지 않습니다.",
                "비용 효율 점수는 업종 평균 이익률 대비 비율 환산 휴리스틱입니다(평균=50점)."
        ));

        // 상권유형(골목/발달/전통시장) 지정 시 동일 유형 분포로 보조 순위 산출 (같은 가중치 적용)
        RankResponse.AreaRank areaRank = null;
        if (req.areaType() != null && !req.areaType().isBlank()) {
            Industry.AreaTypeDist at = ind.areaTypes() == null ? null : ind.areaTypes().get(req.areaType());
            if (at != null) {
                double atSalesPct = percentileOf(at.quantiles(), sales);
                List<Double> atProfitQ = at.quantiles().stream().map(x -> x * ind.marginBenchmark()).toList();
                double atProfitPct = percentileOf(atProfitQ, netProfit);
                double atComposite = ws * atSalesPct + wp * atProfitPct + wm * mScore;
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
                Map.of("sales", ws, "profit", wp, "margin", wm),
                new RankResponse.Peer(ind.nAreas(), ind.nStores(), ind.medianMonthlySales()),
                areaRank,
                notes);
    }

    private static double round1(double v) { return Math.round(v * 10) / 10.0; }
    private static double round4(double v) { return Math.round(v * 10000) / 10000.0; }
}
