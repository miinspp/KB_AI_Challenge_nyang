package com.nyang.simulation.forecast;

/** 외부 AI 예측 제공자가 실패하면 규칙 기반 제공자로 전환하는 조합기. */
public class FallbackSalesForecastProvider implements SalesForecastProvider {
    private final SalesForecastProvider primary;
    private final SalesForecastProvider fallback;

    public FallbackSalesForecastProvider(SalesForecastProvider primary, SalesForecastProvider fallback) {
        this.primary = primary;
        this.fallback = fallback;
    }

    @Override
    public SalesForecast forecast(SalesForecastInput input) {
        try {
            return primary.forecast(input);
        } catch (RuntimeException ignored) {
            SalesForecast result = fallback.forecast(input);
            return new SalesForecast(result.months(), result.provider(), result.modelVersion(),
                    result.dataSource(), true);
        }
    }
}
