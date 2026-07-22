package com.nyang.simulation.forecast;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class SalesForecastProviderTest {
    private final RuleBasedSalesForecastProvider provider = new RuleBasedSalesForecastProvider();

    @Test
    void forecastProducesOrderedQuantilesForEveryMonth() {
        SalesForecast result = provider.forecast(input());

        assertEquals(12, result.months().size());
        assertEquals("RULE_BASED", result.provider());
        for (SalesForecast.MonthlyForecast month : result.months()) {
            assertTrue(month.p10().compareTo(month.p50()) <= 0);
            assertTrue(month.p50().compareTo(month.p90()) <= 0);
            assertTrue(month.p10().signum() >= 0);
        }
    }

    @Test
    void decliningHistoryProducesDecliningMedianScenario() {
        SalesForecastInput input = new SalesForecastInput(
                List.of(bd(10_000_000), bd(9_000_000), bd(8_000_000), bd(7_000_000)),
                6, .05, .15, "CAFE", "SEOUL");
        SalesForecast result = provider.forecast(input);

        assertTrue(result.months().get(5).p50().compareTo(result.months().get(0).p50()) < 0);
    }

    @Test
    void fallbackProviderMarksFallbackWhenPrimaryFails() {
        SalesForecastProvider failing = ignored -> {
            throw new IllegalStateException("external model unavailable");
        };
        SalesForecast result = new FallbackSalesForecastProvider(failing, provider).forecast(input());

        assertTrue(result.fallback());
        assertEquals("RULE_BASED", result.provider());
    }

    private SalesForecastInput input() {
        return new SalesForecastInput(
                List.of(bd(8_000_000), bd(8_200_000), bd(8_100_000), bd(8_400_000)),
                12, .05, .15, "CAFE", "SEOUL");
    }

    private static BigDecimal bd(long value) {
        return BigDecimal.valueOf(value);
    }
}
