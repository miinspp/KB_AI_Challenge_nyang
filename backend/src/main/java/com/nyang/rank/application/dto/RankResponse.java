package com.nyang.rank.application.dto;

import java.util.List;
import java.util.Map;

/** 순위 산출 결과. percentile: 0~100 (높을수록 상위), topPercent = 100 - percentile. */
public record RankResponse(
        String industryCode,
        String industryName,
        String benchmarkGroupLabel,
        double compositeScore,
        double topPercent,
        Component sales,
        Component profit,
        MarginComponent margin,
        CostHealth costHealth,     // 비용 구조 축 (costBreakdown.rent 제공 시, 아니면 null)
        Stability stability,       // 매출 안정성 축 (salesHistory 3개월 이상 제공 시, 아니면 null)
        Map<String, Double> weightsUsed,
        Peer peer,
        AreaRank areaRank,
        List<String> notes
) {
    /** 실측 분포 기반 구성요소 (매출, 순수익) */
    public record Component(double value, double percentile, double topPercent,
                            double peerMedian, double peerP25, double peerP75) {}

    /** 벤치마크 대비 휴리스틱 점수 (비용 효율 = 영업이익률) */
    public record MarginComponent(double value, double benchmark, double score) {}

    /**
     * 비용 구조 건전성 — 사용자 비용 비율을 업종 벤치마크와 비교한 점수.
     * benchmark != null (public_benchmarks.json 로드됨): 임차료율·인건비율·원가율 중 입력된 항목을
     *   각각 업종 실측 평균과 비교(평균이면 50, 절반이면 75, 2배면 0)해 평균낸 점수.
     * benchmark == null (벤치마크 미로드): 임대료 부담률 10%이하 건전 경험칙(10%→100, 25%→0).
     */
    public record CostHealth(double rentBurden, Double laborRatio, Double purchaseRatio,
                             double score, Benchmark benchmark) {
        /**
         * 업종 실측 비용 벤치마크(0~1 비율). 참고·비교 표기용.
         * areaType/areaRentMultiplier/rentRatioAdjusted 는 상권유형 지역 보정이 적용된 경우에만 채워지며,
         * 채워지면 임차료율 채점은 rentRatio 가 아니라 rentRatioAdjusted 기준으로 이뤄진 것이다.
         */
        public record Benchmark(String industryLabel, Double rentRatio, Double laborRatio,
                                Double purchaseRatio, Integer monthlyRentManwon,
                                String areaType, Double areaRentMultiplier, Double rentRatioAdjusted) {}
    }

    /**
     * 매출 안정성 — 최근 월별 매출의 추세와 변동성.
     *  trendPerMonth   : 월평균 성장률 (OLS 기울기 ÷ 평균, ±5%/월에서 점수 포화)
     *  volatility      : 변동계수 CV = 표준편차 ÷ 평균 (5% 이하 안정 ~ 30% 이상 불안정)
     *  score = trendScore·volatilityScore 50:50 합산
     */
    public record Stability(int months, double trendPerMonth, double volatility,
                            double trendScore, double volatilityScore, double score) {}

    /** 동종 업종 참고 정보 */
    public record Peer(int nAreas, int nStores, double medianMonthlySales) {}

    /** 동일 상권유형(골목/발달/전통시장) 내 보조 순위. 요청에 areaType 이 없거나 표본 미달이면 null. */
    public record AreaRank(String areaType, double compositeScore, double topPercent,
                           double salesPercentile, double salesTopPercent,
                           int nAreas, int nStores, double peerMedian) {}
}
