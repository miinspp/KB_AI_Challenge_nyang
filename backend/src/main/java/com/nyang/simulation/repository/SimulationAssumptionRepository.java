package com.nyang.simulation.repository;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Repository;

import java.io.InputStream;
import java.util.Optional;

/** 시뮬레이션의 팀 가정값을 코드와 분리해 로드한다. */
@Repository
public class SimulationAssumptionRepository {
    private final ObjectMapper mapper = new ObjectMapper();
    private volatile JsonNode root;

    @PostConstruct
    public void load() {
        try (InputStream in = new ClassPathResource("data/simulation_assumptions.json").getInputStream()) {
            this.root = mapper.readTree(in);
        } catch (Exception e) {
            throw new IllegalStateException("시뮬레이션 가정값 로드 실패", e);
        }
    }

    public int horizonMonths() {
        return root.path("horizon_months").asInt(12);
    }

    public int monteCarloRuns() {
        return root.path("monte_carlo_runs").asInt(1000);
    }

    public long randomSeed() {
        return root.path("random_seed").asLong(42L);
    }

    public double industryCv() {
        return root.path("industry_cv").asDouble(0.15);
    }

    public double maxMonthlyTrendRatio() {
        return root.path("max_monthly_trend_ratio").asDouble(0.05);
    }

    public double repaymentBurdenLimit() {
        return root.path("repayment_burden_limit").asDouble(0.3);
    }

    public double excessFundingRatioLimit() {
        return root.path("excess_funding_ratio_limit").asDouble(0.3);
    }

    public double defaultTaxReserveRatio() {
        return root.path("default_tax_reserve_ratio").asDouble(0.08);
    }

    public double defaultBufferMonths() {
        return root.path("default_buffer_months").asDouble(1.0);
    }

    public String seasonalitySource() {
        return root.path("seasonality_source").asText("MVP_DEFAULT_1.0");
    }

    public double maxSalesUpliftRatio() {
        return root.path("max_sales_uplift_ratio").asDouble(0.15);
    }

    public double maxCostReductionRatio() {
        return root.path("max_cost_reduction_ratio").asDouble(0.2);
    }

    public Optional<JsonNode> kbProductDefault(String productId) {
        JsonNode n = root.path("kb_product_defaults").path(productId);
        return n.isMissingNode() ? Optional.empty() : Optional.of(n);
    }

    public Optional<JsonNode> policyDefault(String key) {
        JsonNode n = root.path("policy_type_defaults").path(key);
        return n.isMissingNode() ? Optional.empty() : Optional.of(n);
    }
}
