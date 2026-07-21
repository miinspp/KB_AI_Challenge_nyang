package com.nyang.industry.domain;

import java.util.List;
import java.util.Map;

/** 파이프라인이 생성한 industry_distributions.json 의 업종 항목. */
public record Industry(
        String code,
        String name,
        String group,
        String groupLabel,
        double marginBenchmark,
        int nAreas,
        int nStores,
        double medianMonthlySales,
        double meanMonthlySales,
        List<Double> quantiles,
        Map<String, AreaTypeDist> areaTypes   // 상권유형(골목/발달/전통시장)별 보조 분포, 표본 미달 유형 없음
) {
    /** 상권유형별 점포당 월매출 분포 (표본 상권 30개 이상인 유형만 생성됨). */
    public record AreaTypeDist(int nAreas, int nStores, double medianMonthlySales, List<Double> quantiles) {}
}
