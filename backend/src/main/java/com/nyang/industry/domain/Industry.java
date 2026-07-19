package com.nyang.industry.domain;

import java.util.List;

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
        List<Double> quantiles
) {}
