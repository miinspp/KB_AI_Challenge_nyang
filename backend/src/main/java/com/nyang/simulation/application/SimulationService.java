package com.nyang.simulation.application;

import com.fasterxml.jackson.databind.JsonNode;
import com.nyang.simulation.application.dto.SimulationRequest;
import com.nyang.simulation.application.dto.SimulationResponse;
import com.nyang.simulation.repository.SimulationAssumptionRepository;
import com.nyang.simulation.repository.SimulationCatalogRepository;
import com.nyang.simulation.repository.SimulationCatalogRepository.CatalogItem;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Random;
import java.util.Set;

/** 보고서 보완 방향에 맞춘 12개월 자금흐름 시뮬레이션 엔진. */
@Service
public class SimulationService {
    private static final String KB_PRODUCT = "KB_PRODUCT";
    private static final String SEOUL_POLICY = "SEOUL_POLICY";
    private static final String CUSTOM = "CUSTOM";

    private static final String LOAN = "LOAN";
    private static final String GRANT = "GRANT";
    private static final String COST_REDUCTION = "COST_REDUCTION";
    private static final String SALES_UPLIFT = "SALES_UPLIFT";
    private static final String CASH_MANAGEMENT = "CASH_MANAGEMENT";

    private static final String EQUAL_PAYMENT = "EQUAL_PAYMENT";
    private static final String EQUAL_PRINCIPAL = "EQUAL_PRINCIPAL";
    private static final String BULLET = "BULLET";
    private static final String INTEREST_ONLY = "INTEREST_ONLY";
    private static final String NONE = "NONE";
    private static final String REIMBURSEMENT = "REIMBURSEMENT";

    private final SimulationCatalogRepository catalogRepository;
    private final SimulationAssumptionRepository assumptions;

    public SimulationService(SimulationCatalogRepository catalogRepository,
                             SimulationAssumptionRepository assumptions) {
        this.catalogRepository = catalogRepository;
        this.assumptions = assumptions;
    }

    public SimulationResponse simulate(SimulationRequest req) {
        validate(req);

        int horizon = bounded(req.horizonMonths(), assumptions.horizonMonths(), 1, 60);
        int simulationCount = bounded(req.simulationCount(), assumptions.monteCarloRuns(), 100, 10_000);
        long randomSeed = req.randomSeed() == null ? assumptions.randomSeed() : req.randomSeed();
        double taxReserveRatio = req.taxReserveRatio() == null
                ? assumptions.defaultTaxReserveRatio()
                : req.taxReserveRatio();
        double minimumCashBuffer = req.minimumCashBuffer() == null
                ? req.fixedCost() * assumptions.defaultBufferMonths()
                : req.minimumCashBuffer();

        SalesModel salesModel = buildSalesModel(req.monthlySales(), horizon);
        RiskModel riskModel = buildRiskModel(req);

        List<NormalizedItem> items = normalizeItems(req.selectedItems());
        ScenarioComputation baseline = computeScenario(req, horizon, taxReserveRatio, minimumCashBuffer,
                salesModel.expectedSales(), List.of());
        ScenarioComputation selected = computeScenario(req, horizon, taxReserveRatio, minimumCashBuffer,
                salesModel.expectedSales(), items);

        SimulationResponse.StochasticResult baselineStochastic = runMonteCarlo(req, horizon, taxReserveRatio,
                minimumCashBuffer, salesModel.expectedSales(), List.of(), riskModel.mixedCv(),
                simulationCount, randomSeed);
        SimulationResponse.StochasticResult selectedStochastic = runMonteCarlo(req, horizon, taxReserveRatio,
                minimumCashBuffer, salesModel.expectedSales(), items, riskModel.mixedCv(),
                simulationCount, randomSeed);

        SimulationResponse.ScenarioResult baselineResult = new SimulationResponse.ScenarioResult(
                baseline.deterministic(), baselineStochastic, baseline.monthlyCashFlows());
        SimulationResponse.ScenarioResult selectedResult = new SimulationResponse.ScenarioResult(
                selected.deterministic(), selectedStochastic, selected.monthlyCashFlows());

        double requiredFunding = items.stream().mapToDouble(NormalizedItem::requiredFundingAmount).sum();
        SimulationResponse.FinancingResult financing = new SimulationResponse.FinancingResult(
                round0(selected.totalInterest()),
                round0(selected.totalFees()),
                round0(selected.totalInterest() + selected.totalFees()),
                round0(selected.maxMonthlyRepayment()),
                round4(selected.maxRepaymentBurdenRatio()),
                round0(selected.totalFundingAmount()),
                round0(requiredFunding),
                round0(requiredFunding > 0 ? Math.max(0, selected.totalFundingAmount() - requiredFunding) : 0)
        );

        SimulationResponse.ConstraintResult constraints = evaluateConstraints(items, selected, financing);
        SimulationResponse.BaselineComparison comparison = new SimulationResponse.BaselineComparison(
                baselineStochastic.bufferBreachProbability(),
                selectedStochastic.bufferBreachProbability(),
                round4(selectedStochastic.bufferBreachProbability() - baselineStochastic.bufferBreachProbability()),
                baselineStochastic.negativeCashProbability(),
                selectedStochastic.negativeCashProbability(),
                round4(selectedStochastic.negativeCashProbability() - baselineStochastic.negativeCashProbability()),
                round0(selectedStochastic.endingCashP5() - baselineStochastic.endingCashP5())
        );

        SimulationResponse.AssumptionsUsed assumptionsUsed = new SimulationResponse.AssumptionsUsed(
                taxReserveRatio,
                round0(minimumCashBuffer),
                riskModel.industryCv(),
                riskModel.mixedCv(),
                riskModel.personalCv(),
                riskModel.personalWeight(),
                assumptions.maxMonthlyTrendRatio(),
                assumptions.repaymentBurdenLimit(),
                assumptions.excessFundingRatioLimit(),
                assumptions.seasonalitySource()
        );

        SimulationResponse.Confidence confidence = confidence(req.monthlySales().size());
        String status = decideStatus(selectedStochastic, selected, constraints);

        return new SimulationResponse(
                "SCENARIO_CUSTOM",
                items.isEmpty() ? "현상 유지" : "선택 정책·상품 조합",
                horizon,
                items.stream().map(this::toItemResult).toList(),
                baselineResult,
                selectedResult,
                comparison,
                financing,
                constraints,
                assumptionsUsed,
                confidence,
                status,
                warnings(confidence, items),
                agentHints(selectedStochastic, selected, constraints)
        );
    }

    private void validate(SimulationRequest req) {
        if (req.monthlySales() == null || req.monthlySales().size() < 3) {
            throw new IllegalArgumentException("최근 월매출은 최소 3개월 이상 필요합니다.");
        }
        double averageSales = req.monthlySales().stream().mapToDouble(Double::doubleValue).average().orElse(0);
        if (averageSales <= 0) {
            throw new IllegalArgumentException("최근 월매출 평균은 0보다 커야 합니다.");
        }
        if (req.variableCostRatio() + value(req.taxReserveRatio(), assumptions.defaultTaxReserveRatio()) >= 1.0) {
            throw new IllegalArgumentException("변동비율과 세금 적립률의 합은 1보다 작아야 합니다.");
        }
    }

    private SalesModel buildSalesModel(List<Double> monthlySales, int horizon) {
        int n = monthlySales.size();
        double baseSales = monthlySales.stream().mapToDouble(Double::doubleValue).average().orElse(0);
        double xAvg = (n - 1) / 2.0;
        double yAvg = baseSales;
        double numerator = 0;
        double denominator = 0;
        for (int i = 0; i < n; i++) {
            numerator += (i - xAvg) * (monthlySales.get(i) - yAvg);
            denominator += Math.pow(i - xAvg, 2);
        }
        double rawSlope = denominator == 0 ? 0 : numerator / denominator;
        double maxSlope = baseSales * assumptions.maxMonthlyTrendRatio();
        double slope = clamp(rawSlope, -maxSlope, maxSlope);

        double[] expectedSales = new double[horizon];
        for (int month = 1; month <= horizon; month++) {
            expectedSales[month - 1] = round0(Math.max(0, baseSales + slope * month));
        }
        return new SalesModel(baseSales, slope, expectedSales);
    }

    private RiskModel buildRiskModel(SimulationRequest req) {
        double personalCv = coefficientOfVariation(req.monthlySales());
        double industryCv = req.diagnosis() != null && req.diagnosis().industryCv() != null
                ? req.diagnosis().industryCv()
                : assumptions.industryCv();
        double personalWeight = Math.min(0.7, 0.7 * req.monthlySales().size() / 12.0);
        double mixedCv = personalWeight * personalCv + (1 - personalWeight) * industryCv;
        return new RiskModel(round4(personalCv), round4(industryCv), round4(personalWeight), round4(mixedCv));
    }

    private List<NormalizedItem> normalizeItems(List<SimulationRequest.SelectedItem> selectedItems) {
        if (selectedItems == null || selectedItems.isEmpty()) {
            return List.of();
        }
        List<NormalizedItem> result = new ArrayList<>();
        for (SimulationRequest.SelectedItem item : selectedItems) {
            String sourceType = upperOrDefault(item.sourceType(), CUSTOM);
            Optional<CatalogItem> catalog = catalogRepository.find(sourceType, item.id());
            String policyKey = inferPolicyDefaultKey(item, catalog.orElse(null));
            JsonNode defaults = defaultsFor(sourceType, item.id(), policyKey).orElse(null);

            String defaultType = text(defaults, "type");
            String inferredType = KB_PRODUCT.equals(sourceType) && defaults == null
                    ? CASH_MANAGEMENT
                    : inferType(sourceType, catalog.orElse(null));
            String type = upperOrDefault(firstNonBlank(item.type(), defaultType, inferredType), CASH_MANAGEMENT);
            double defaultAmount = number(defaults, "amount", type.equals(GRANT) ? 5_000_000 : 10_000_000);
            if (catalog.isPresent() && catalog.get().maxAmountWon() != null) {
                defaultAmount = Math.min(defaultAmount, catalog.get().maxAmountWon());
            }
            double amount = value(item.amount(), defaultAmount);
            int disbursementMonth = bounded(item.disbursementMonth(), integer(defaults, "disbursement_month", 1), 1, 60);
            double selfFundingRatio = value(item.selfFundingRatio(), number(defaults, "self_funding_ratio", 0));
            String paymentMethod = upperOrDefault(firstNonBlank(item.paymentMethod(), text(defaults, "payment_method")), "DIRECT");

            List<SimulationRequest.CashEvent> spending = item.projectSpendingSchedule() == null
                    ? defaultSpendingSchedule(type, amount, selfFundingRatio, paymentMethod)
                    : item.projectSpendingSchedule();

            result.add(new NormalizedItem(
                    sourceType,
                    item.id(),
                    firstNonBlank(item.name(), catalog.map(CatalogItem::name).orElse(null), item.id()),
                    type,
                    catalog.map(CatalogItem::category).orElse(null),
                    catalog.map(CatalogItem::sourceUrl).orElse(null),
                    catalog.map(CatalogItem::applicationUrl).orElse(null),
                    upperOrDefault(item.eligibilityStatus(), "UNKNOWN"),
                    amount,
                    value(item.annualRate(), number(defaults, "annual_rate", 0.0)),
                    value(item.totalTermMonths(), integer(defaults, "total_term_months", 0)),
                    value(item.graceMonths(), integer(defaults, "grace_months", 0)),
                    upperOrDefault(firstNonBlank(item.repaymentType(), text(defaults, "repayment_type")), NONE),
                    disbursementMonth,
                    value(item.upfrontFee(), number(defaults, "upfront_fee", 0.0)),
                    value(item.feeRate(), number(defaults, "fee_rate", 0.0)),
                    spending,
                    selfFundingRatio,
                    paymentMethod,
                    value(item.costReductionRatio(), number(defaults, "cost_reduction_ratio", 0.0)),
                    value(item.salesUpliftRatio(), number(defaults, "sales_uplift_ratio", 0.0)),
                    value(item.requiredFundingAmount(), 0.0),
                    firstNonBlank(item.duplicateGroup(), item.id()),
                    catalog.orElse(null),
                    policyKey
            ));
        }
        return List.copyOf(result);
    }

    private Optional<JsonNode> defaultsFor(String sourceType, String id, String policyKey) {
        if (KB_PRODUCT.equals(sourceType) && id != null) {
            return assumptions.kbProductDefault(id);
        }
        if (SEOUL_POLICY.equals(sourceType)) {
            return assumptions.policyDefault(policyKey);
        }
        return Optional.empty();
    }

    private String inferPolicyDefaultKey(SimulationRequest.SelectedItem item, CatalogItem catalog) {
        String explicit = upperOrDefault(item.type(), null);
        if (LOAN.equals(explicit)) return "LOAN";
        if (GRANT.equals(explicit)) return "GRANT";
        if (COST_REDUCTION.equals(explicit)) return "CONSULTING";
        if (SALES_UPLIFT.equals(explicit)) return "MARKETING";
        if (catalog != null) {
            if (catalog.supportTypes().contains("융자")) return "LOAN";
            if (catalog.supportTypes().contains("보증")) return "GUARANTEE";
            if (catalog.supportTypes().contains("보조금")) return "GRANT";
            if (catalog.supportTypes().contains("판로")) return "MARKETING";
            if (catalog.supportTypes().contains("컨설팅") || catalog.supportTypes().contains("교육")) return "CONSULTING";
        }
        return "CONSULTING";
    }

    private String inferType(String sourceType, CatalogItem catalog) {
        if (catalog == null) {
            return CASH_MANAGEMENT;
        }
        if (SEOUL_POLICY.equals(sourceType)) {
            String key = inferPolicyDefaultKey(new SimulationRequest.SelectedItem(sourceType, catalog.id(), null, null,
                    null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null),
                    catalog);
            return switch (key) {
                case "LOAN", "GUARANTEE" -> LOAN;
                case "GRANT" -> GRANT;
                case "MARKETING" -> SALES_UPLIFT;
                case "CONSULTING" -> COST_REDUCTION;
                default -> CASH_MANAGEMENT;
            };
        }
        String category = catalog.category() == null ? "" : catalog.category();
        if (category.contains("loan") || category.contains("finance") || category.contains("restructuring")) {
            return LOAN;
        }
        return CASH_MANAGEMENT;
    }

    private List<SimulationRequest.CashEvent> defaultSpendingSchedule(String type, double amount,
                                                                       double selfFundingRatio,
                                                                       String paymentMethod) {
        if (GRANT.equals(type) && REIMBURSEMENT.equals(paymentMethod)) {
            double projectCost = amount / Math.max(0.01, 1 - selfFundingRatio);
            return List.of(new SimulationRequest.CashEvent(1, round0(projectCost)));
        }
        return List.of();
    }

    private ScenarioComputation computeScenario(SimulationRequest req,
                                                int horizon,
                                                double taxReserveRatio,
                                                double minimumCashBuffer,
                                                double[] baseExpectedSales,
                                                List<NormalizedItem> items) {
        MonthlyVectors vectors = buildMonthlyVectors(items, horizon);
        double costReductionRatio = clamp(items.stream().mapToDouble(NormalizedItem::costReductionRatio).sum(),
                0, assumptions.maxCostReductionRatio());
        double salesUpliftRatio = clamp(items.stream().mapToDouble(NormalizedItem::salesUpliftRatio).sum(),
                0, assumptions.maxSalesUpliftRatio());

        List<SimulationResponse.MonthlyCashFlow> flows = new ArrayList<>();
        double cash = req.currentCash();
        double minCash = cash;
        Integer firstBuffer = null;
        Integer firstNegative = null;
        double maxRepayment = 0;
        double maxRepaymentBurden = 0;

        for (int i = 0; i < horizon; i++) {
            int month = i + 1;
            double opening = cash;
            double expectedSales = round0(baseExpectedSales[i] * (1 + salesUpliftRatio));
            double variableCost = round0(expectedSales * req.variableCostRatio());
            double fixedCost = round0(req.fixedCost() * (1 - costReductionRatio));
            double taxReserve = round0(expectedSales * taxReserveRatio);
            double operating = expectedSales - variableCost - fixedCost - taxReserve - req.existingMonthlyRepayment();
            double closing = opening
                    + vectors.financingInflow[i]
                    + vectors.subsidyInflow[i]
                    - vectors.projectSpending[i]
                    + operating
                    - vectors.newRepayment[i]
                    - vectors.financingFee[i];

            boolean bufferBreached = closing < minimumCashBuffer;
            boolean negativeCash = closing < 0;
            if (bufferBreached && firstBuffer == null) firstBuffer = month;
            if (negativeCash && firstNegative == null) firstNegative = month;
            minCash = Math.min(minCash, closing);
            maxRepayment = Math.max(maxRepayment, vectors.newRepayment[i]);
            maxRepaymentBurden = Math.max(maxRepaymentBurden,
                    (req.existingMonthlyRepayment() + vectors.newRepayment[i]) / Math.max(1, expectedSales));

            flows.add(new SimulationResponse.MonthlyCashFlow(
                    month,
                    round0(opening),
                    round0(vectors.financingInflow[i]),
                    round0(vectors.subsidyInflow[i]),
                    round0(vectors.projectSpending[i]),
                    round0(expectedSales),
                    round0(variableCost),
                    round0(fixedCost),
                    round0(taxReserve),
                    round0(req.existingMonthlyRepayment()),
                    round0(vectors.newRepayment[i]),
                    round0(vectors.financingFee[i]),
                    round0(operating),
                    round0(closing),
                    bufferBreached,
                    negativeCash
            ));
            cash = closing;
        }

        SimulationResponse.DeterministicResult deterministic = new SimulationResponse.DeterministicResult(
                firstBuffer,
                firstNegative,
                round0(cash),
                round0(minCash)
        );
        return new ScenarioComputation(
                deterministic,
                List.copyOf(flows),
                vectors.totalInterest,
                vectors.totalFees,
                maxRepayment,
                maxRepaymentBurden,
                vectors.totalFundingAmount
        );
    }

    private MonthlyVectors buildMonthlyVectors(List<NormalizedItem> items, int horizon) {
        double[] financingInflow = new double[horizon];
        double[] subsidyInflow = new double[horizon];
        double[] projectSpending = new double[horizon];
        double[] newRepayment = new double[horizon];
        double[] financingFee = new double[horizon];
        double totalInterest = 0;
        double totalFees = 0;
        double totalFunding = 0;

        for (NormalizedItem item : items) {
            int disbursementIndex = item.disbursementMonth() - 1;
            if (disbursementIndex >= 0 && disbursementIndex < horizon) {
                if (LOAN.equals(item.type())) {
                    financingInflow[disbursementIndex] += item.amount();
                    totalFunding += item.amount();
                    double fee = item.upfrontFee() + item.amount() * item.feeRate();
                    financingFee[disbursementIndex] += fee;
                    totalFees += fee;
                } else if (GRANT.equals(item.type())) {
                    subsidyInflow[disbursementIndex] += item.amount();
                    totalFunding += item.amount();
                }
            }

            for (SimulationRequest.CashEvent event : item.projectSpendingSchedule()) {
                if (event.month() != null && event.month() >= 1 && event.month() <= horizon) {
                    projectSpending[event.month() - 1] += event.amount();
                }
            }

            PaymentSchedule schedule = repaymentSchedule(item, horizon);
            for (int i = 0; i < horizon; i++) {
                newRepayment[i] += schedule.payment[i];
                totalInterest += schedule.interest[i];
            }
        }

        return new MonthlyVectors(financingInflow, subsidyInflow, projectSpending, newRepayment,
                financingFee, totalInterest, totalFees, totalFunding);
    }

    private PaymentSchedule repaymentSchedule(NormalizedItem item, int horizon) {
        double[] payment = new double[horizon];
        double[] interest = new double[horizon];
        if (!LOAN.equals(item.type()) || item.amount() <= 0 || item.totalTermMonths() <= 0) {
            return new PaymentSchedule(payment, interest);
        }

        double monthlyRate = item.annualRate() / 12.0;
        int totalTerm = item.totalTermMonths();
        int graceMonths = Math.min(item.graceMonths(), totalTerm);
        int amortizationMonths = Math.max(1, totalTerm - graceMonths);
        double remainingPrincipal = item.amount();
        double equalPayment = equalPayment(item.amount(), monthlyRate, amortizationMonths);
        double equalPrincipal = item.amount() / amortizationMonths;

        for (int month = item.disbursementMonth(); month < item.disbursementMonth() + totalTerm; month++) {
            if (month < 1 || month > horizon) {
                continue;
            }
            int elapsed = month - item.disbursementMonth() + 1;
            int i = month - 1;
            double monthlyInterest = remainingPrincipal * monthlyRate;
            double monthlyPrincipal = 0;

            if (elapsed <= graceMonths || INTEREST_ONLY.equals(item.repaymentType())) {
                monthlyPrincipal = 0;
            } else if (EQUAL_PAYMENT.equals(item.repaymentType())) {
                monthlyPrincipal = Math.min(remainingPrincipal, Math.max(0, equalPayment - monthlyInterest));
            } else if (EQUAL_PRINCIPAL.equals(item.repaymentType())) {
                monthlyPrincipal = Math.min(remainingPrincipal, equalPrincipal);
            } else if (BULLET.equals(item.repaymentType())) {
                monthlyPrincipal = elapsed == totalTerm ? remainingPrincipal : 0;
            } else if (NONE.equals(item.repaymentType())) {
                monthlyPrincipal = 0;
                monthlyInterest = 0;
            }

            interest[i] = monthlyInterest;
            payment[i] = monthlyInterest + monthlyPrincipal;
            remainingPrincipal = Math.max(0, remainingPrincipal - monthlyPrincipal);
        }
        return new PaymentSchedule(payment, interest);
    }

    private double equalPayment(double principal, double monthlyRate, int months) {
        if (months <= 0) return 0;
        if (monthlyRate == 0) return principal / months;
        double pow = Math.pow(1 + monthlyRate, months);
        return principal * monthlyRate * pow / (pow - 1);
    }

    private SimulationResponse.StochasticResult runMonteCarlo(SimulationRequest req,
                                                              int horizon,
                                                              double taxReserveRatio,
                                                              double minimumCashBuffer,
                                                              double[] baseExpectedSales,
                                                              List<NormalizedItem> items,
                                                              double mixedCv,
                                                              int simulationCount,
                                                              long seed) {
        MonthlyVectors vectors = buildMonthlyVectors(items, horizon);
        double costReductionRatio = clamp(items.stream().mapToDouble(NormalizedItem::costReductionRatio).sum(),
                0, assumptions.maxCostReductionRatio());
        double salesUpliftRatio = clamp(items.stream().mapToDouble(NormalizedItem::salesUpliftRatio).sum(),
                0, assumptions.maxSalesUpliftRatio());

        double sigma2 = Math.log(1 + mixedCv * mixedCv);
        double sigma = Math.sqrt(sigma2);
        double mu = -0.5 * sigma2;
        Random rng = new Random(seed);
        int bufferBreaches = 0;
        int negativeCashes = 0;
        double[] endingCash = new double[simulationCount];

        for (int run = 0; run < simulationCount; run++) {
            double cash = req.currentCash();
            boolean bufferBreached = false;
            boolean negativeCash = false;
            for (int i = 0; i < horizon; i++) {
                double shock = Math.exp(mu + sigma * rng.nextGaussian());
                double sales = Math.max(0, baseExpectedSales[i] * (1 + salesUpliftRatio) * shock);
                double variableCost = sales * req.variableCostRatio();
                double fixedCost = req.fixedCost() * (1 - costReductionRatio);
                double taxReserve = sales * taxReserveRatio;
                double operating = sales - variableCost - fixedCost - taxReserve - req.existingMonthlyRepayment();
                cash = cash
                        + vectors.financingInflow[i]
                        + vectors.subsidyInflow[i]
                        - vectors.projectSpending[i]
                        + operating
                        - vectors.newRepayment[i]
                        - vectors.financingFee[i];
                if (cash < minimumCashBuffer) bufferBreached = true;
                if (cash < 0) negativeCash = true;
            }
            if (bufferBreached) bufferBreaches++;
            if (negativeCash) negativeCashes++;
            endingCash[run] = cash;
        }
        java.util.Arrays.sort(endingCash);
        return new SimulationResponse.StochasticResult(
                simulationCount,
                seed,
                round4(bufferBreaches / (double) simulationCount),
                round4(negativeCashes / (double) simulationCount),
                round0(percentile(endingCash, 0.50)),
                round0(percentile(endingCash, 0.05))
        );
    }

    private SimulationResponse.ConstraintResult evaluateConstraints(List<NormalizedItem> items,
                                                                    ScenarioComputation selected,
                                                                    SimulationResponse.FinancingResult financing) {
        List<String> violations = new ArrayList<>();
        boolean repaymentPassed = selected.maxRepaymentBurdenRatio() <= assumptions.repaymentBurdenLimit();
        if (!repaymentPassed) {
            violations.add("월 상환부담이 내부 안전 기준(" + assumptions.repaymentBurdenLimit() + ")을 초과합니다.");
        }

        boolean eligibilityPassed = items.stream()
                .noneMatch(item -> "FAIL".equalsIgnoreCase(item.eligibilityStatus()));
        if (!eligibilityPassed) {
            violations.add("자격조건 FAIL 항목이 포함되어 있습니다.");
        }

        Set<String> groups = new LinkedHashSet<>();
        boolean duplicatePassed = true;
        for (NormalizedItem item : items) {
            String group = item.duplicateGroup();
            if (group != null && !group.isBlank() && !groups.add(group)) {
                duplicatePassed = false;
            }
        }
        if (!duplicatePassed) {
            violations.add("중복수혜 또는 중복재원 가능성이 있는 항목이 포함되어 있습니다.");
        }

        boolean excessPassed = financing.requiredFundingAmount() <= 0
                || financing.totalFundingAmount() <= financing.requiredFundingAmount() * (1 + assumptions.excessFundingRatioLimit());
        if (!excessPassed) {
            violations.add("필요금액 대비 초과 조달이 내부 허용 범위를 넘습니다.");
        }

        return new SimulationResponse.ConstraintResult(
                repaymentPassed,
                eligibilityPassed,
                duplicatePassed,
                excessPassed,
                List.copyOf(violations)
        );
    }

    private String decideStatus(SimulationResponse.StochasticResult stochastic,
                                ScenarioComputation selected,
                                SimulationResponse.ConstraintResult constraints) {
        if (!constraints.violations().isEmpty()) {
            return "REPLAN_REQUIRED";
        }
        if (stochastic.negativeCashProbability() >= 0.20 || stochastic.bufferBreachProbability() >= 0.50) {
            return "DANGER";
        }
        if (stochastic.bufferBreachProbability() >= 0.25
                || selected.maxRepaymentBurdenRatio() >= assumptions.repaymentBurdenLimit() * 0.8) {
            return "CAUTION";
        }
        return "SAFE";
    }

    private List<String> warnings(SimulationResponse.Confidence confidence, List<NormalizedItem> items) {
        List<String> warnings = new ArrayList<>();
        warnings.add("실제 금리와 한도는 개인별 심사 결과에 따라 달라질 수 있습니다.");
        warnings.add("정책 선정 여부와 지급 시점은 보장하지 않으며, 입력값과 가정값에 따른 시뮬레이션입니다.");
        warnings.add("매출 전망은 최근 매출 변동성과 업종 변동성 가정에 기반한 추정치입니다.");
        if ("LOW".equals(confidence.level())) {
            warnings.add(confidence.reason());
        }
        boolean hasAssumptionBasedItem = items.stream().anyMatch(item -> item.catalog() != null);
        if (hasAssumptionBasedItem) {
            warnings.add("레포의 정책·상품 데이터는 추천 후보와 출처 확인에 사용하며, 계산 조건은 공식값·사용자 입력·팀 가정값을 분리해 표시합니다.");
        }
        return List.copyOf(warnings);
    }

    private List<String> agentHints(SimulationResponse.StochasticResult stochastic,
                                    ScenarioComputation selected,
                                    SimulationResponse.ConstraintResult constraints) {
        List<String> hints = new ArrayList<>();
        if (!constraints.repaymentBurdenPassed()) {
            hints.add("상환부담 초과: 거치기간이 있는 정책자금 또는 더 낮은 조달액으로 재시뮬레이션하세요.");
        }
        if (stochastic.bufferBreachProbability() >= 0.25) {
            hints.add("버퍼 침해 가능성 높음: 비용절감형 정책 또는 지출 시점 분산 시나리오를 추가 비교하세요.");
        }
        if (stochastic.negativeCashProbability() >= 0.10) {
            hints.add("현금 고갈 가능성 존재: 실행 월을 앞당기거나 지원금 사후정산 대기기간을 반영한 대안을 탐색하세요.");
        }
        if (hints.isEmpty()) {
            hints.add("현재 조합은 내부 안전 기준을 통과했습니다. Agent는 숫자를 변경하지 않고 근거와 유의사항만 설명해야 합니다.");
        }
        return List.copyOf(hints);
    }

    private SimulationResponse.ItemResult toItemResult(NormalizedItem item) {
        Map<String, Object> verified = new LinkedHashMap<>();
        verified.put("amount", round0(item.amount()));
        if (LOAN.equals(item.type())) {
            verified.put("annualRate", item.annualRate());
            verified.put("totalTermMonths", item.totalTermMonths());
            verified.put("graceMonths", item.graceMonths());
            verified.put("repaymentType", item.repaymentType());
        }
        if (item.catalog() != null) {
            verified.put("catalogAvailabilityStatus", item.catalog().availabilityStatus());
            verified.put("catalogApplicationMode", item.catalog().applicationMode());
        }

        Map<String, Object> itemAssumptions = new LinkedHashMap<>();
        itemAssumptions.put("policyDefaultKey", item.policyDefaultKey());
        itemAssumptions.put("paymentMethod", item.paymentMethod());
        itemAssumptions.put("selfFundingRatio", item.selfFundingRatio());
        itemAssumptions.put("costReductionRatio", item.costReductionRatio());
        itemAssumptions.put("salesUpliftRatio", item.salesUpliftRatio());
        itemAssumptions.put("feeRate", item.feeRate());

        return new SimulationResponse.ItemResult(
                item.sourceType(),
                item.id(),
                item.name(),
                item.type(),
                item.category(),
                item.sourceUrl(),
                item.applicationUrl(),
                item.eligibilityStatus(),
                verified,
                itemAssumptions
        );
    }

    private SimulationResponse.Confidence confidence(int months) {
        if (months <= 6) {
            return new SimulationResponse.Confidence("LOW", "개인 매출 데이터가 6개월 이하라 업종 평균 변동성을 더 크게 반영했습니다.");
        }
        if (months < 12) {
            return new SimulationResponse.Confidence("MEDIUM", "개인 매출 데이터가 12개월 미만이라 계절성을 제한적으로 반영합니다.");
        }
        return new SimulationResponse.Confidence("MEDIUM_HIGH", "12개월 이상 매출 데이터가 제공되어 개인 변동성 반영 비중을 높였습니다.");
    }

    private double coefficientOfVariation(List<Double> values) {
        double mean = values.stream().mapToDouble(Double::doubleValue).average().orElse(0);
        if (mean <= 0) return 0;
        double variance = values.stream()
                .mapToDouble(v -> Math.pow(v - mean, 2))
                .sum() / values.size();
        return Math.sqrt(variance) / mean;
    }

    private double percentile(double[] sorted, double p) {
        if (sorted.length == 0) return 0;
        double pos = p * (sorted.length - 1);
        int lower = (int) Math.floor(pos);
        int upper = (int) Math.ceil(pos);
        if (lower == upper) return sorted[lower];
        double weight = pos - lower;
        return sorted[lower] * (1 - weight) + sorted[upper] * weight;
    }

    private static double clamp(double v, double min, double max) {
        return Math.max(min, Math.min(max, v));
    }

    private static int bounded(Integer value, int fallback, int min, int max) {
        int v = value == null ? fallback : value;
        return Math.max(min, Math.min(max, v));
    }

    private static int value(Integer value, int fallback) {
        return value == null ? fallback : value;
    }

    private static double value(Double value, double fallback) {
        return value == null ? fallback : value;
    }

    private static double number(JsonNode n, String field, double fallback) {
        if (n == null || n.path(field).isMissingNode() || n.path(field).isNull()) return fallback;
        return n.path(field).asDouble(fallback);
    }

    private static int integer(JsonNode n, String field, int fallback) {
        if (n == null || n.path(field).isMissingNode() || n.path(field).isNull()) return fallback;
        return n.path(field).asInt(fallback);
    }

    private static String text(JsonNode n, String field) {
        if (n == null || n.path(field).isMissingNode() || n.path(field).isNull()) return null;
        return n.path(field).asText();
    }

    private static String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) return value;
        }
        return null;
    }

    private static String upperOrDefault(String value, String fallback) {
        String v = firstNonBlank(value);
        return v == null ? fallback : v.toUpperCase();
    }

    private static double round0(double v) {
        return Math.round(v);
    }

    private static double round4(double v) {
        return Math.round(v * 10_000) / 10_000.0;
    }

    private record SalesModel(double baseSales, double slope, double[] expectedSales) {}

    private record RiskModel(double personalCv, double industryCv, double personalWeight, double mixedCv) {}

    private record PaymentSchedule(double[] payment, double[] interest) {}

    private record MonthlyVectors(double[] financingInflow,
                                  double[] subsidyInflow,
                                  double[] projectSpending,
                                  double[] newRepayment,
                                  double[] financingFee,
                                  double totalInterest,
                                  double totalFees,
                                  double totalFundingAmount) {}

    private record ScenarioComputation(SimulationResponse.DeterministicResult deterministic,
                                       List<SimulationResponse.MonthlyCashFlow> monthlyCashFlows,
                                       double totalInterest,
                                       double totalFees,
                                       double maxMonthlyRepayment,
                                       double maxRepaymentBurdenRatio,
                                       double totalFundingAmount) {}

    private record NormalizedItem(String sourceType,
                                  String id,
                                  String name,
                                  String type,
                                  String category,
                                  String sourceUrl,
                                  String applicationUrl,
                                  String eligibilityStatus,
                                  double amount,
                                  double annualRate,
                                  int totalTermMonths,
                                  int graceMonths,
                                  String repaymentType,
                                  int disbursementMonth,
                                  double upfrontFee,
                                  double feeRate,
                                  List<SimulationRequest.CashEvent> projectSpendingSchedule,
                                  double selfFundingRatio,
                                  String paymentMethod,
                                  double costReductionRatio,
                                  double salesUpliftRatio,
                                  double requiredFundingAmount,
                                  String duplicateGroup,
                                  CatalogItem catalog,
                                  String policyDefaultKey) {}
}
