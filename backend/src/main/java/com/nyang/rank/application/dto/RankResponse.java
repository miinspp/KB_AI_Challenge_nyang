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

    /** 동종 업종 참고 정보 */
    public record Peer(int nAreas, int nStores, double medianMonthlySales) {}

    /** 동일 상권유형(골목/발달/전통시장) 내 보조 순위. 요청에 areaType 이 없거나 표본 미달이면 null. */
    public record AreaRank(String areaType, double compositeScore, double topPercent,
                           double salesPercentile, double salesTopPercent,
                           int nAreas, int nStores, double peerMedian) {}
}
