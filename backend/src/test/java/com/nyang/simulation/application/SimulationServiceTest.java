package com.nyang.simulation.application;

import com.nyang.simulation.application.dto.SimulationRequest;
import com.nyang.simulation.application.dto.SimulationResponse;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
class SimulationServiceTest {

    @Autowired
    private SimulationService service;

    @Test
    void kbPolicyLoanDefaultUsesGraceInterestOnlyInFirstYear() {
        SimulationRequest req = baseRequest(List.of(new SimulationRequest.SelectedItem(
                "KB_PRODUCT", "L006", null, null,
                null, null, null, null, null, null,
                null, null, null, null, null, null, null,
                15_000_000.0, "UNKNOWN", "policy-fund"
        )));

        SimulationResponse res = service.simulate(req);

        SimulationResponse.MonthlyCashFlow firstMonth = res.selectedScenario().monthlyCashFlows().get(0);
        assertEquals(15_000_000, firstMonth.financingInflow(), 1);
        assertEquals(43_750, firstMonth.newRepayment(), 1); // 15,000,000 * 3.5% / 12
        assertEquals(150_000, firstMonth.financingFee(), 1); // 보증료 가정 1%
        assertTrue(res.financingResult().maxRepaymentBurdenRatio() < 0.3);
    }

    @Test
    void reimbursementGrantSpendsProjectCostBeforeSubsidyInflow() {
        SimulationRequest req = baseRequest(List.of(new SimulationRequest.SelectedItem(
                "CUSTOM", "GRANT_DEMO", "사후정산 보조금", "GRANT",
                4_000_000.0, null, null, null, null, 3,
                null, null, null, 0.2, "REIMBURSEMENT", null, null,
                5_000_000.0, "UNKNOWN", "grant-demo"
        )));

        SimulationResponse res = service.simulate(req);

        assertEquals(5_000_000, res.selectedScenario().monthlyCashFlows().get(0).projectSpending(), 1);
        assertEquals(4_000_000, res.selectedScenario().monthlyCashFlows().get(2).subsidyInflow(), 1);
        assertTrue(res.warnings().stream().anyMatch(w -> w.contains("정책 선정 여부")));
    }

    @Test
    void monteCarloResultIsReproducibleWithSameSeed() {
        SimulationRequest req = baseRequest(List.of());

        SimulationResponse a = service.simulate(req);
        SimulationResponse b = service.simulate(req);

        assertEquals(a.baseline().stochastic().bufferBreachProbability(),
                b.baseline().stochastic().bufferBreachProbability());
        assertEquals(a.baseline().stochastic().endingCashP5(),
                b.baseline().stochastic().endingCashP5());
    }

    private SimulationRequest baseRequest(List<SimulationRequest.SelectedItem> items) {
        return new SimulationRequest(
                List.of(8_200_000.0, 7_900_000.0, 8_500_000.0, 8_800_000.0, 9_100_000.0, 8_700_000.0),
                4_200_000,
                0.38,
                6_000_000,
                900_000,
                12_000_000,
                0.08,
                4_000_000.0,
                12,
                1000,
                42L,
                new SimulationRequest.Diagnosis(0.15, "MEDIUM"),
                items
        );
    }
}
