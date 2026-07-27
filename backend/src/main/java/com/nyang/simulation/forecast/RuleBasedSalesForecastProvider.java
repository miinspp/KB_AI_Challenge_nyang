package com.nyang.simulation.forecast;

import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

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
        // A range is only meaningful when it comes from observed sales variation.
        // With no variation evidence, P10/P50/P90 remain equal instead of inventing a fixed range.
        double spread = Math.max(0, input.volatility()) * 1.2816;
        Map<Integer, Double> seasonality = monthlySeasonality(input, average, slope, xAverage);
        int lastObservedMonth = observedMonth(input.monthlySalesMonths(), n - 1);

        List<SalesForecast.MonthlyForecast> months = new ArrayList<>();
        for (int month = 1; month <= input.horizonMonths(); month++) {
            // Forecast from the month after the final observation, not from the regression origin.
            double forecastIndex = (n - 1) + month;
            int calendarMonth = lastObservedMonth == 0 ? 0 : ((lastObservedMonth - 1 + month) % 12) + 1;
            double seasonalFactor = seasonality.getOrDefault(calendarMonth, 1d);
            BigDecimal p50 = won(Math.max(0, (average + slope * (forecastIndex - xAverage)) * seasonalFactor));
            BigDecimal p10 = won(Math.max(0, p50.doubleValue() * (1 - spread)));
            BigDecimal p90 = won(Math.max(p50.doubleValue(), p50.doubleValue() * (1 + spread)));
            months.add(new SalesForecast.MonthlyForecast(month, p10, p50, p90));
        }
        boolean seasonal = !seasonality.isEmpty();
        return new SalesForecast(months, "RULE_BASED", seasonal ? "trend-seasonality-v2" : "trend-v1",
                seasonal ? "RECENT_SALES_WITH_MONTHLY_SEASONALITY" : "RECENT_SALES", false);
    }

    private Map<Integer, Double> monthlySeasonality(SalesForecastInput input, double average,
                                                     double slope, double xAverage) {
        List<String> months = input.monthlySalesMonths();
        List<BigDecimal> sales = input.monthlySales();
        if (months == null || months.size() != sales.size() || months.size() < 12) return Map.of();
        Map<Integer, List<Double>> ratios = new HashMap<>();
        for (int i = 0; i < sales.size(); i++) {
            int calendarMonth = observedMonth(months, i);
            if (calendarMonth == 0) return Map.of();
            double trendValue = Math.max(1, average + slope * (i - xAverage));
            ratios.computeIfAbsent(calendarMonth, ignored -> new ArrayList<>())
                    .add(sales.get(i).doubleValue() / trendValue);
        }
        Map<Integer, Double> result = new HashMap<>();
        ratios.forEach((month, values) -> {
            double factor = values.stream().mapToDouble(Double::doubleValue).average().orElse(1);
            result.put(month, Math.max(.85, Math.min(1.15, factor)));
        });
        return Map.copyOf(result);
    }

    private int observedMonth(List<String> months, int index) {
        if (months == null || index < 0 || index >= months.size()) return 0;
        String value = months.get(index);
        if (value == null || !value.matches("\\d{4}-(0[1-9]|1[0-2])")) return 0;
        return Integer.parseInt(value.substring(5, 7));
    }

    private static BigDecimal won(double value) {
        return BigDecimal.valueOf(value).setScale(0, RoundingMode.HALF_UP);
    }
}
