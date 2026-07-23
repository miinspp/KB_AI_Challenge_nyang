package com.nyang.simulation.forecast;

import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;

/** 실제 학습 모델이 연결되기 전 사용하는 평균·선형추세 기반 제공자. */
@Component
public class RuleBasedSalesForecastProvider implements SalesForecastProvider {
    @Override
    public SalesForecast forecast(SalesForecastInput input) {
        List<BigDecimal> history = input.monthlySales();
        int n = history.size();
        double average = history.stream().mapToDouble(BigDecimal::doubleValue).average().orElse(0);
        double xAverage = (n - 1) / 2.0;
        double numerator = 0;
        double denominator = 0;
        for (int i = 0; i < n; i++) {
            numerator += (i - xAverage) * (history.get(i).doubleValue() - average);
            denominator += Math.pow(i - xAverage, 2);
        }
        double rawSlope = denominator == 0 ? 0 : numerator / denominator;
        double maximumSlope = average * input.maximumMonthlyTrendRatio();
        double slope = Math.max(-maximumSlope, Math.min(maximumSlope, rawSlope));
        double spread = Math.max(0.05, input.volatility()) * 1.2816;

        List<SalesForecast.MonthlyForecast> months = new ArrayList<>();
        for (int month = 1; month <= input.horizonMonths(); month++) {
            BigDecimal p50 = won(Math.max(0, average + slope * month));
            BigDecimal p10 = won(Math.max(0, p50.doubleValue() * (1 - spread)));
            BigDecimal p90 = won(Math.max(p50.doubleValue(), p50.doubleValue() * (1 + spread)));
            months.add(new SalesForecast.MonthlyForecast(month, p10, p50, p90));
        }
        return new SalesForecast(months, "RULE_BASED", "trend-v1", "RECENT_SALES", false);
    }

    private static BigDecimal won(double value) {
        return BigDecimal.valueOf(value).setScale(0, RoundingMode.HALF_UP);
    }
}
