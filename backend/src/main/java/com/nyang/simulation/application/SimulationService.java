package com.nyang.simulation.application;

import com.fasterxml.jackson.databind.JsonNode;
import com.nyang.simulation.application.dto.SimulationRequest;
import com.nyang.simulation.application.dto.SimulationResponse;
import com.nyang.simulation.forecast.SalesForecast;
import com.nyang.simulation.forecast.SalesForecastInput;
import com.nyang.simulation.forecast.SalesForecastProvider;
import com.nyang.simulation.repository.SimulationAssumptionRepository;
import com.nyang.simulation.repository.SimulationCatalogRepository;
import com.nyang.simulation.repository.SimulationCatalogRepository.CatalogItem;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Random;
import java.util.Set;

@Service
public class SimulationService {
    private static final BigDecimal ZERO = BigDecimal.ZERO;
    private static final String KB_PRODUCT = "KB_PRODUCT";
    private static final String SEOUL_POLICY = "SEOUL_POLICY";
    private static final String CUSTOM = "CUSTOM";
    private static final String LOAN = "LOAN";
    private static final String GRANT = "GRANT";
    private static final String SAVINGS = "SAVINGS";
    private static final String MUTUAL_AID = "MUTUAL_AID";
    private static final String INSURANCE = "INSURANCE";
    private static final String COST_REDUCTION = "COST_REDUCTION";
    private static final String SALES_UPLIFT = "SALES_UPLIFT";
    private static final String CASH_MANAGEMENT = "CASH_MANAGEMENT";

    private final SimulationCatalogRepository catalogRepository;
    private final SimulationAssumptionRepository assumptions;
    private final SalesForecastProvider forecastProvider;

    public SimulationService(SimulationCatalogRepository catalogRepository,
                             SimulationAssumptionRepository assumptions,
                             SalesForecastProvider forecastProvider) {
        this.catalogRepository = catalogRepository;
        this.assumptions = assumptions;
        this.forecastProvider = forecastProvider;
    }

    public SimulationResponse simulate(SimulationRequest request) {
        validateBaseRequest(request);
        int horizon = bounded(request.horizonMonths(), assumptions.horizonMonths(), 1, 60);
        int runs = bounded(request.simulationCount(), assumptions.monteCarloRuns(), 100, 10_000);
        long seed = request.randomSeed() == null ? assumptions.randomSeed() : request.randomSeed();

        ResolvedInput input = resolveInput(request);
        RiskModel risk = buildRiskModel(request);
        SalesForecast forecast = forecastProvider.forecast(new SalesForecastInput(
                request.monthlySales(), horizon, assumptions.maxMonthlyTrendRatio(), risk.mixedCv(),
                request.diagnosis() == null ? null : request.diagnosis().industryCode(),
                request.diagnosis() == null ? null : request.diagnosis().region()));
        List<NormalizedItem> items = normalizeAndValidateItems(request.selectedItems(), input);

        ScenarioComputation baselineCalc = computeScenario(input, forecast, List.of(), horizon);
        ScenarioComputation selectedCalc = computeScenario(input, forecast, items, horizon);
        SimulationResponse.StochasticResult baselineRisk = runMonteCarlo(
                input, baselineCalc, risk, runs, seed);
        SimulationResponse.StochasticResult selectedRisk = runMonteCarlo(
                input, selectedCalc, risk, runs, seed);

        SimulationResponse.ScenarioResult baseline = scenarioResult(input, baselineCalc, baselineRisk);
        SimulationResponse.ScenarioResult selected = scenarioResult(input, selectedCalc, selectedRisk);
        SimulationResponse.ConstraintResult constraints = evaluateConstraints(input, items, selectedCalc);
        SimulationResponse.Confidence confidence = confidence(request.monthlySales().size());
        List<String> warnings = warnings(input, forecast, items, constraints, confidence);

        return new SimulationResponse(
                "SIM-" + Long.toUnsignedString(seed, 36).toUpperCase(Locale.ROOT),
                items.isEmpty() ? "Baseline" : "Selected product portfolio",
                horizon,
                items.stream().map(this::toItemResult).toList(),
                baseline,
                selected,
                comparison(baselineRisk, selectedRisk),
                financingResult(input, items, selectedCalc),
                constraints,
                new SimulationResponse.AssumptionsUsed(
                        input.taxReserveRatio(), money(input.safetyThreshold()).doubleValue(), input.safetyThresholdType(),
                        risk.industryCv(), risk.mixedCv(), risk.personalCv(), risk.personalWeight(),
                        assumptions.maxMonthlyTrendRatio(), assumptions.salesShockAutocorrelation(),
                        assumptions.repaymentBurdenLimit(), assumptions.excessFundingRatioLimit(), assumptions.seasonalitySource()),
                inputAssumptions(input),
                protectionResult(items),
                forecastInfo(forecast),
                confidence,
                decideStatus(selectedRisk, constraints),
                warnings,
                agentHints(selectedRisk, selectedCalc, constraints)
        );
    }

    private void validateBaseRequest(SimulationRequest request) {
        if (request == null || request.monthlySales() == null || request.monthlySales().size() < 3) {
            throw new IllegalArgumentException("At least three months of sales are required.");
        }
        if (request.monthlySales().stream().anyMatch(v -> v == null || v.signum() < 0)) {
            throw new IllegalArgumentException("Monthly sales cannot be negative.");
        }
        if (average(request.monthlySales()).signum() <= 0) {
            throw new IllegalArgumentException("Average monthly sales must be greater than zero.");
        }
        requireNonNegative(request.currentCash(), "currentCash");
        requireNonNegative(request.existingDebtBalance(), "existingDebtBalance");
        requireNonNegative(request.existingMonthlyPayment(), "existingMonthlyPayment");
    }

    private ResolvedInput resolveInput(SimulationRequest request) {
        BigDecimal averageSales = average(request.monthlySales());
        CostModel cost = resolveCostModel(request, averageSales);
        double taxRatio = request.taxReserveRatio() == null
                ? assumptions.defaultTaxReserveRatio() : request.taxReserveRatio();
        if (taxRatio < 0 || taxRatio >= 1 || cost.variableCostRatio() + taxRatio >= 1) {
            throw new IllegalArgumentException("Variable cost ratio plus tax reserve ratio must be below 100%.");
        }

        boolean currentCashAssumed = request.currentCash() == null;
        boolean debtAssumed = request.existingDebtBalance() == null;
        boolean paymentAssumed = request.existingMonthlyPayment() == null;
        BigDecimal currentCash = value(request.currentCash(), cost.fixedCost());
        BigDecimal existingDebt = value(request.existingDebtBalance(), ZERO);
        BigDecimal existingPayment = value(request.existingMonthlyPayment(), ZERO);

        String thresholdType;
        BigDecimal threshold;
        if (request.minimumCashBuffer() != null) {
            thresholdType = "LEGACY_CUSTOM";
            threshold = request.minimumCashBuffer();
        } else {
            thresholdType = upper(request.safetyThresholdType(), "ONE_MONTH_FIXED_COST");
            threshold = switch (thresholdType) {
                case "FIXED_COST_PLUS_DEBT_PAYMENT" -> cost.fixedCost().add(existingPayment);
                case "CUSTOM" -> {
                    if (request.customSafetyThreshold() == null) {
                        throw new IllegalArgumentException("customSafetyThreshold is required for CUSTOM safety threshold.");
                    }
                    yield request.customSafetyThreshold();
                }
                case "ONE_MONTH_FIXED_COST" -> cost.fixedCost();
                default -> throw new IllegalArgumentException("Unsupported safetyThresholdType: " + thresholdType);
            };
        }

        return new ResolvedInput(
                request.monthlySales(), currentCash, existingDebt, existingPayment,
                value(request.existingLoanInterestRate(), 0), value(request.existingLoanRemainingMonths(), 0),
                cost.fixedCost(), cost.variableCostRatio(), taxRatio, threshold, thresholdType,
                currentCashAssumed, debtAssumed, paymentAssumed, cost.legacy(), cost.messages());
    }

    private CostModel resolveCostModel(SimulationRequest request, BigDecimal averageSales) {
        SimulationRequest.CostStructure structure = request.costStructure();
        if (structure == null) {
            if (request.fixedCost() == null || request.variableCostRatio() == null) {
                throw new IllegalArgumentException("fixedCost and variableCostRatio are required when costStructure is absent.");
            }
            return new CostModel(request.fixedCost(), request.variableCostRatio(), true,
                    List.of("Legacy fixedCost/variableCostRatio cost model was used."));
        }

        BigDecimal rent = value(structure.rent(), ZERO);
        BigDecimal labor = value(structure.laborCost(), ZERO);
        BigDecimal otherFixed = value(structure.otherFixedExpense(), ZERO);
        BigDecimal material = value(structure.materialCost(), ZERO);
        double linkedRatio = value(structure.salesLinkedExpenseRate(), 0);
        BigDecimal fixed = rent.add(labor).add(otherFixed);
        BigDecimal variableAtBaseline = material.add(averageSales.multiply(BigDecimal.valueOf(linkedRatio)));
        BigDecimal componentTotal = fixed.add(variableAtBaseline);
        List<String> messages = new ArrayList<>();

        if (structure.totalExpense() != null) {
            BigDecimal tolerance = structure.totalExpense().multiply(BigDecimal.valueOf(0.03)).max(BigDecimal.valueOf(10_000));
            BigDecimal difference = structure.totalExpense().subtract(componentTotal);
            if (difference.compareTo(tolerance.negate()) < 0) {
                throw new IllegalArgumentException("Cost components exceed totalExpense; check for duplicated expenses.");
            }
            if (difference.compareTo(tolerance) > 0) {
                if (structure.otherFixedExpense() == null) {
                    fixed = fixed.add(difference);
                    messages.add("Unclassified total expense was treated as other fixed expense.");
                } else {
                    throw new IllegalArgumentException("Cost components do not reconcile with totalExpense.");
                }
            }
        }

        if (fixed.signum() == 0 && structure.totalExpense() != null && material.signum() == 0 && linkedRatio == 0) {
            double legacyVariableRatio = value(request.variableCostRatio(), 0);
            fixed = structure.totalExpense().multiply(BigDecimal.valueOf(1 - legacyVariableRatio));
            linkedRatio = legacyVariableRatio;
            messages.add("totalExpense was split using variableCostRatio because no breakdown was supplied.");
        } else if (averageSales.signum() > 0 && material.signum() > 0) {
            linkedRatio += material.divide(averageSales, 8, RoundingMode.HALF_UP).doubleValue();
        }
        if (linkedRatio < 0 || linkedRatio > 1) {
            throw new IllegalArgumentException("Resolved variable cost ratio must be between 0 and 1.");
        }
        return new CostModel(money(fixed), linkedRatio, false, List.copyOf(messages));
    }

    private List<NormalizedItem> normalizeAndValidateItems(List<SimulationRequest.SelectedItem> selected, ResolvedInput input) {
        if (selected == null || selected.isEmpty()) return List.of();
        List<NormalizedItem> result = new ArrayList<>();
        Set<String> ids = new LinkedHashSet<>();
        Set<String> duplicateGroups = new LinkedHashSet<>();

        for (SimulationRequest.SelectedItem raw : selected) {
            String source = upper(raw.sourceType(), CUSTOM);
            Optional<CatalogItem> catalog = catalogRepository.find(source, raw.id());
            if (catalog.isPresent() && "CLOSED".equalsIgnoreCase(catalog.get().availabilityStatus())) {
                throw new IllegalArgumentException("Selected product is closed: " + raw.id());
            }
            if (!ids.add(source + ":" + raw.id())) {
                throw new IllegalArgumentException("Duplicate product selection: " + raw.id());
            }
            if ("FAIL".equalsIgnoreCase(raw.eligibilityStatus())) {
                throw new IllegalArgumentException("Eligibility failed for product: " + raw.id());
            }

            String policyKey = inferPolicyKey(raw, catalog.orElse(null));
            JsonNode defaults = defaultsFor(source, raw.id(), policyKey).orElse(null);
            String type = upper(firstNonBlank(raw.type(), text(defaults, "type"), inferType(source, catalog.orElse(null))), CASH_MANAGEMENT);
            BigDecimal amount = value(raw.amount(), decimal(defaults, "amount", defaultAmount(type)));
            BigDecimal monthlyContribution = value(raw.monthlyContribution(),
                    decimal(defaults, "monthly_contribution", (SAVINGS.equals(type) || MUTUAL_AID.equals(type) || INSURANCE.equals(type)) ? amount : ZERO));
            int term = value(raw.totalTermMonths(), integer(defaults, "total_term_months", 0));
            int grace = value(raw.graceMonths(), integer(defaults, "grace_months", 0));
            int disbursement = bounded(raw.disbursementMonth(), integer(defaults, "disbursement_month", 1), 1, 60);
            String duplicateGroup = firstNonBlank(raw.duplicateGroup(), raw.id());
            if (duplicateGroup != null && !duplicateGroups.add(duplicateGroup)) {
                throw new IllegalArgumentException("Duplicate benefit group selected: " + duplicateGroup);
            }

            Double catalogMax = catalog.map(CatalogItem::maxAmountWon).orElse(null);
            BigDecimal defaultMax = decimal(defaults, "max_amount", null);
            BigDecimal maxAmount = catalogMax == null ? defaultMax : BigDecimal.valueOf(catalogMax);
            if (maxAmount != null && amount.compareTo(maxAmount) > 0) {
                throw new IllegalArgumentException("Requested amount exceeds product maximum: " + raw.id());
            }
            BigDecimal minContribution = decimal(defaults, "min_monthly_contribution", null);
            BigDecimal maxContribution = decimal(defaults, "max_monthly_contribution", null);
            if (minContribution != null && monthlyContribution.compareTo(minContribution) < 0) {
                throw new IllegalArgumentException("Monthly contribution is below product minimum: " + raw.id());
            }
            if (maxContribution != null && monthlyContribution.compareTo(maxContribution) > 0) {
                throw new IllegalArgumentException("Monthly contribution exceeds product maximum: " + raw.id());
            }
            if (LOAN.equals(type) && (amount.signum() <= 0 || term <= 0 || grace >= term)) {
                throw new IllegalArgumentException("Loan amount/term/grace conditions are invalid: " + raw.id());
            }

            boolean refinance = isRefinance(raw, catalog.orElse(null));
            if (refinance && input.existingDebt().signum() <= 0) {
                throw new IllegalArgumentException("Refinancing requires an existing debt balance.");
            }
            if (refinance && amount.compareTo(input.existingDebt()) > 0) {
                throw new IllegalArgumentException("Refinancing amount cannot exceed existing debt balance.");
            }

            double selfFunding = value(raw.selfFundingRatio(), number(defaults, "self_funding_ratio", 0));
            String paymentMethod = upper(firstNonBlank(raw.paymentMethod(), text(defaults, "payment_method")), "DIRECT");
            List<SimulationRequest.CashEvent> spending = raw.projectSpendingSchedule() == null
                    ? defaultSpending(type, amount, selfFunding, paymentMethod, refinance)
                    : List.copyOf(raw.projectSpendingSchedule());
            validateSpending(spending);

            result.add(new NormalizedItem(
                    source, raw.id(), firstNonBlank(raw.name(), catalog.map(CatalogItem::name).orElse(null), raw.id()), type,
                    catalog.map(CatalogItem::category).orElse(null), catalog.map(CatalogItem::sourceUrl).orElse(null),
                    catalog.map(CatalogItem::applicationUrl).orElse(null), upper(raw.eligibilityStatus(), "UNKNOWN"),
                    amount, value(raw.annualRate(), number(defaults, "annual_rate", 0)), term, grace,
                    upper(firstNonBlank(raw.repaymentType(), text(defaults, "repayment_type")), "NONE"), disbursement,
                    value(raw.upfrontFee(), decimal(defaults, "upfront_fee", ZERO)),
                    value(raw.feeRate(), number(defaults, "fee_rate", 0)), spending, selfFunding, paymentMethod,
                    value(raw.costReductionRatio(), number(defaults, "cost_reduction_ratio", 0)),
                    value(raw.salesUpliftRatio(), number(defaults, "sales_uplift_ratio", 0)),
                    value(raw.requiredFundingAmount(), ZERO), duplicateGroup,
                    monthlyContribution, value(raw.assetAnnualRate(), number(defaults, "asset_annual_rate", 0)),
                    value(raw.maturityMonth(), integer(defaults, "maturity_month", 0)),
                    raw.protectionType(), raw.protectionBasis(), refinance, catalog.orElse(null)));
        }
        return List.copyOf(result);
    }

    private ScenarioComputation computeScenario(ResolvedInput input, SalesForecast forecast,
                                                List<NormalizedItem> items, int horizon) {
        MonthlyVectors vectors = buildMonthlyVectors(items, horizon);
        double costReduction = clamp(items.stream().mapToDouble(NormalizedItem::costReductionRatio).sum(), 0, assumptions.maxCostReductionRatio());
        double salesUplift = clamp(items.stream().mapToDouble(NormalizedItem::salesUpliftRatio).sum(), 0, assumptions.maxSalesUpliftRatio());
        Map<String, BigDecimal> assetBalances = new LinkedHashMap<>();
        List<SimulationResponse.MonthlyCashFlow> flows = new ArrayList<>();
        BigDecimal cash = input.currentCash();
        BigDecimal minimumCash = cash;
        Integer firstBuffer = null;
        Integer firstNegative = null;
        BigDecimal maxDebtPayment = ZERO;
        BigDecimal totalInterest = ZERO;
        BigDecimal totalFees = ZERO;

        for (int i = 0; i < horizon; i++) {
            int month = i + 1;
            BigDecimal opening = cash;
            BigDecimal sales = money(forecast.months().get(i).p50().multiply(BigDecimal.valueOf(1 + salesUplift)));
            BigDecimal variableCost = money(sales.multiply(BigDecimal.valueOf(input.variableCostRatio())));
            BigDecimal fixedCost = money(input.fixedCost().multiply(BigDecimal.valueOf(1 - costReduction)));
            BigDecimal taxReserve = money(sales.multiply(BigDecimal.valueOf(input.taxReserveRatio())));
            BigDecimal existingPayment = vectors.refinanceEffectiveMonth() > 0 && month >= vectors.refinanceEffectiveMonth()
                    ? ZERO : input.existingMonthlyPayment();

            AssetMonth assetMonth = assetMonth(items, assetBalances, month);
            BigDecimal operating = sales.subtract(variableCost).subtract(fixedCost).subtract(taxReserve).subtract(existingPayment);
            cash = opening.add(vectors.financingInflow()[i]).add(vectors.subsidyInflow()[i])
                    .subtract(vectors.projectSpending()[i]).subtract(vectors.newRepayment()[i]).subtract(vectors.financingFee()[i])
                    .subtract(assetMonth.contribution()).add(assetMonth.maturityInflow()).add(operating);
            cash = money(cash);
            minimumCash = minimumCash.min(cash);
            if (firstBuffer == null && cash.compareTo(input.safetyThreshold()) < 0) firstBuffer = month;
            if (firstNegative == null && cash.signum() < 0) firstNegative = month;
            maxDebtPayment = maxDebtPayment.max(existingPayment.add(vectors.newRepayment()[i]));
            totalInterest = totalInterest.add(vectors.interest()[i]);
            totalFees = totalFees.add(vectors.financingFee()[i]);

            flows.add(new SimulationResponse.MonthlyCashFlow(
                    month, d(opening), d(vectors.financingInflow()[i]), d(vectors.subsidyInflow()[i]), d(vectors.projectSpending()[i]),
                    d(sales), d(variableCost), d(fixedCost), d(taxReserve), d(existingPayment), d(vectors.newRepayment()[i]),
                    d(vectors.financingFee()[i]), d(operating), d(cash), cash.compareTo(input.safetyThreshold()) < 0, cash.signum() < 0,
                    d(assetMonth.contribution()), d(assetMonth.interest()), d(assetMonth.maturityInflow()), d(assetMonth.balance())));
        }

        BigDecimal finalAssetBalance = assetBalances.values().stream().reduce(ZERO, BigDecimal::add);
        return new ScenarioComputation(
                new SimulationResponse.DeterministicResult(firstBuffer, firstNegative, d(cash), d(minimumCash), d(finalAssetBalance)),
                List.copyOf(flows), money(totalInterest), money(totalFees), money(maxDebtPayment),
                items.stream().filter(i -> LOAN.equals(i.type()) || GRANT.equals(i.type())).map(NormalizedItem::amount).reduce(ZERO, BigDecimal::add));
    }

    private MonthlyVectors buildMonthlyVectors(List<NormalizedItem> items, int horizon) {
        BigDecimal[] financing = zeros(horizon);
        BigDecimal[] subsidy = zeros(horizon);
        BigDecimal[] spending = zeros(horizon);
        BigDecimal[] repayment = zeros(horizon);
        BigDecimal[] interest = zeros(horizon);
        BigDecimal[] fees = zeros(horizon);
        int refinanceMonth = 0;

        for (NormalizedItem item : items) {
            int index = item.disbursementMonth() - 1;
            if (index < horizon && LOAN.equals(item.type())) financing[index] = financing[index].add(item.amount());
            if (index < horizon && GRANT.equals(item.type())) subsidy[index] = subsidy[index].add(item.amount());
            if (index < horizon) fees[index] = fees[index].add(item.upfrontFee()).add(item.amount().multiply(BigDecimal.valueOf(item.feeRate())));
            for (SimulationRequest.CashEvent event : item.spending()) {
                if (event.month() != null && event.month() >= 1 && event.month() <= horizon) {
                    spending[event.month() - 1] = spending[event.month() - 1].add(event.amount());
                }
            }
            if (item.refinance()) refinanceMonth = refinanceMonth == 0 ? item.disbursementMonth() : Math.min(refinanceMonth, item.disbursementMonth());
            if (LOAN.equals(item.type())) addRepaymentSchedule(item, repayment, interest, horizon);
        }
        return new MonthlyVectors(financing, subsidy, spending, repayment, interest, fees, refinanceMonth);
    }

    private void addRepaymentSchedule(NormalizedItem item, BigDecimal[] payments, BigDecimal[] interest, int horizon) {
        BigDecimal balance = item.amount();
        double monthlyRate = item.annualRate() / 12.0;
        int amortizingMonths = Math.max(1, item.termMonths() - item.graceMonths());
        BigDecimal equalPrincipal = item.amount().divide(BigDecimal.valueOf(amortizingMonths), 8, RoundingMode.HALF_UP);
        BigDecimal equalPayment = equalPayment(item.amount(), monthlyRate, amortizingMonths);

        for (int elapsed = 0; elapsed < item.termMonths(); elapsed++) {
            int index = item.disbursementMonth() - 1 + elapsed;
            if (index >= horizon) break;
            BigDecimal monthInterest = money(balance.multiply(BigDecimal.valueOf(monthlyRate)));
            BigDecimal principal = ZERO;
            if (elapsed >= item.graceMonths()) {
                int amortized = elapsed - item.graceMonths();
                principal = switch (item.repaymentType()) {
                    case "EQUAL_PAYMENT" -> equalPayment.subtract(monthInterest).max(ZERO).min(balance);
                    case "BULLET" -> amortized == amortizingMonths - 1 ? balance : ZERO;
                    case "INTEREST_ONLY" -> ZERO;
                    default -> equalPrincipal.min(balance);
                };
            }
            BigDecimal payment = monthInterest.add(principal);
            payments[index] = payments[index].add(payment);
            interest[index] = interest[index].add(monthInterest);
            balance = balance.subtract(principal).max(ZERO);
        }
    }

    private AssetMonth assetMonth(List<NormalizedItem> items, Map<String, BigDecimal> balances, int month) {
        BigDecimal contribution = ZERO;
        BigDecimal interest = ZERO;
        BigDecimal maturityInflow = ZERO;
        for (NormalizedItem item : items) {
            if (INSURANCE.equals(item.type())) {
                contribution = contribution.add(item.monthlyContribution());
                continue;
            }
            if (!SAVINGS.equals(item.type()) && !MUTUAL_AID.equals(item.type())) continue;
            int maturity = item.maturityMonth();
            if (maturity > 0 && month > maturity) continue;
            BigDecimal balance = balances.getOrDefault(item.key(), ZERO).add(item.monthlyContribution());
            BigDecimal monthInterest = money(balance.multiply(BigDecimal.valueOf(item.assetAnnualRate() / 12.0)));
            balance = balance.add(monthInterest);
            contribution = contribution.add(item.monthlyContribution());
            interest = interest.add(monthInterest);
            if (maturity > 0 && month == maturity) {
                maturityInflow = maturityInflow.add(balance);
                balance = ZERO;
            }
            balances.put(item.key(), balance);
        }
        BigDecimal aggregate = balances.values().stream().reduce(ZERO, BigDecimal::add);
        return new AssetMonth(money(contribution), money(interest), money(maturityInflow), money(aggregate));
    }

    private SimulationResponse.StochasticResult runMonteCarlo(ResolvedInput input, ScenarioComputation scenario,
                                                               RiskModel risk, int runs, long seed) {
        Random random = new Random(seed);
        int horizon = scenario.flows().size();
        int[] cumulativeBuffer = new int[horizon];
        int[] cumulativeNegative = new int[horizon];
        int[] atBuffer = new int[horizon];
        int[] atNegative = new int[horizon];
        double[] endings = new double[runs];
        double rho = clamp(assumptions.salesShockAutocorrelation(), 0, 0.95);
        double innovationScale = Math.sqrt(1 - rho * rho);

        for (int run = 0; run < runs; run++) {
            double cash = input.currentCash().doubleValue();
            boolean everBuffer = false;
            boolean everNegative = false;
            double previousShock = 0;
            for (int i = 0; i < horizon; i++) {
                SimulationResponse.MonthlyCashFlow flow = scenario.flows().get(i);
                previousShock = rho * previousShock + innovationScale * random.nextGaussian();
                double sales = Math.max(0, flow.expectedSales() * (1 + previousShock * risk.mixedCv()));
                double variable = sales * input.variableCostRatio();
                double tax = sales * input.taxReserveRatio();
                cash += flow.financingInflow() + flow.subsidyInflow() - flow.projectSpending()
                        - flow.existingRepayment() - flow.newRepayment() - flow.financingFee()
                        - flow.financialAssetContribution() + flow.financialAssetMaturityInflow()
                        + sales - variable - flow.fixedCost() - tax;
                boolean bufferNow = cash < input.safetyThreshold().doubleValue();
                boolean negativeNow = cash < 0;
                if (bufferNow) atBuffer[i]++;
                if (negativeNow) atNegative[i]++;
                everBuffer |= bufferNow;
                everNegative |= negativeNow;
                if (everBuffer) cumulativeBuffer[i]++;
                if (everNegative) cumulativeNegative[i]++;
            }
            endings[run] = cash;
        }
        Arrays.sort(endings);
        List<SimulationResponse.MonthlyRisk> monthly = new ArrayList<>();
        for (int i = 0; i < horizon; i++) {
            monthly.add(new SimulationResponse.MonthlyRisk(i + 1,
                    ratio(cumulativeBuffer[i], runs), ratio(cumulativeNegative[i], runs),
                    ratio(atBuffer[i], runs), ratio(atNegative[i], runs)));
        }
        double buffer = ratio(cumulativeBuffer[horizon - 1], runs);
        double negative = ratio(cumulativeNegative[horizon - 1], runs);
        return new SimulationResponse.StochasticResult(runs, seed, buffer, negative,
                percentile(endings, .50), percentile(endings, .05), List.copyOf(monthly),
                displayPercent(buffer), displayPercent(negative));
    }

    private SimulationResponse.ScenarioResult scenarioResult(ResolvedInput input, ScenarioComputation calculation,
                                                              SimulationResponse.StochasticResult stochastic) {
        BigDecimal averageNet = money(BigDecimal.valueOf(calculation.flows().stream()
                .mapToDouble(f -> f.closingCash() - f.openingCash()).average().orElse(0)));
        SimulationResponse.ScenarioMetrics metrics = new SimulationResponse.ScenarioMetrics(
                averageNet, money(calculation.deterministic().endingCash()), money(calculation.deterministic().minimumCashBalance()),
                calculation.deterministic().firstBufferBreachMonth(), stochastic.bufferBreachProbability(),
                stochastic.bufferBreachProbabilityDisplayPercent(), money(stochastic.endingCashP5()),
                calculation.maxDebtPayment(), money(calculation.deterministic().financialAssetBalance()));
        return new SimulationResponse.ScenarioResult(calculation.deterministic(), stochastic, calculation.flows(), metrics);
    }

    private SimulationResponse.ConstraintResult evaluateConstraints(ResolvedInput input, List<NormalizedItem> items,
                                                                    ScenarioComputation selected) {
        List<String> violations = new ArrayList<>();
        double maxBurden = selected.flows().stream().mapToDouble(f ->
                (f.existingRepayment() + f.newRepayment()) / Math.max(1, f.expectedSales())).max().orElse(0);
        boolean burdenPassed = maxBurden <= assumptions.repaymentBurdenLimit();
        if (!burdenPassed) violations.add("Maximum monthly debt payment exceeds the configured sales burden limit.");
        boolean eligibility = items.stream().noneMatch(i -> "FAIL".equals(i.eligibilityStatus()));
        boolean duplicates = items.stream().map(NormalizedItem::duplicateGroup).filter(v -> v != null).distinct().count()
                == items.stream().map(NormalizedItem::duplicateGroup).filter(v -> v != null).count();
        BigDecimal required = items.stream().map(NormalizedItem::requiredFundingAmount).reduce(ZERO, BigDecimal::add);
        BigDecimal funded = selected.totalFunding();
        boolean excess = required.signum() == 0 || funded.compareTo(required.multiply(BigDecimal.valueOf(1 + assumptions.excessFundingRatioLimit()))) <= 0;
        if (!excess) violations.add("Selected funding exceeds the required amount tolerance.");
        return new SimulationResponse.ConstraintResult(burdenPassed, eligibility, duplicates, excess, List.copyOf(violations));
    }

    private SimulationResponse.FinancingResult financingResult(ResolvedInput input, List<NormalizedItem> items,
                                                                ScenarioComputation selected) {
        BigDecimal required = items.stream().map(NormalizedItem::requiredFundingAmount).reduce(ZERO, BigDecimal::add);
        BigDecimal excess = selected.totalFunding().subtract(required).max(ZERO);
        double maxBurden = selected.flows().stream().mapToDouble(f ->
                (f.existingRepayment() + f.newRepayment()) / Math.max(1, f.expectedSales())).max().orElse(0);
        return new SimulationResponse.FinancingResult(d(selected.totalInterest()), d(selected.totalFees()),
                d(selected.totalInterest().add(selected.totalFees())), d(selected.maxDebtPayment()), maxBurden,
                d(selected.totalFunding()), d(required), d(excess));
    }

    private SimulationResponse.BaselineComparison comparison(SimulationResponse.StochasticResult before,
                                                              SimulationResponse.StochasticResult after) {
        return new SimulationResponse.BaselineComparison(before.bufferBreachProbability(), after.bufferBreachProbability(),
                after.bufferBreachProbability() - before.bufferBreachProbability(), before.negativeCashProbability(),
                after.negativeCashProbability(), after.negativeCashProbability() - before.negativeCashProbability(),
                after.endingCashP5() - before.endingCashP5());
    }

    private SimulationResponse.InputAssumptions inputAssumptions(ResolvedInput input) {
        List<String> messages = new ArrayList<>(input.costMessages());
        if (input.currentCashAssumed()) messages.add("currentCash was missing and one month of fixed cost was used.");
        if (input.debtAssumed()) messages.add("existingDebtBalance was missing and assumed to be zero.");
        if (input.paymentAssumed()) messages.add("existingMonthlyPayment was missing and assumed to be zero.");
        return new SimulationResponse.InputAssumptions(input.currentCashAssumed(), input.debtAssumed(),
                input.paymentAssumed(), input.legacyCostModel(), List.copyOf(messages));
    }

    private SimulationResponse.ProtectionResult protectionResult(List<NormalizedItem> items) {
        List<SimulationResponse.ProtectionItem> protections = items.stream().filter(i -> INSURANCE.equals(i.type()))
                .map(i -> new SimulationResponse.ProtectionItem(i.id(), i.name(), i.protectionType(), i.protectionBasis())).toList();
        return new SimulationResponse.ProtectionResult(!protections.isEmpty(), null,
                protections.isEmpty() ? "NOT_SELECTED" : "NOT_ESTIMATED", protections);
    }

    private SimulationResponse.SalesForecastInfo forecastInfo(SalesForecast forecast) {
        return new SimulationResponse.SalesForecastInfo(forecast.provider(), forecast.modelVersion(), forecast.dataSource(),
                forecast.fallback(), forecast.months().stream().map(p ->
                new SimulationResponse.SalesForecastPoint(p.month(), p.p10(), p.p50(), p.p90())).toList());
    }

    private SimulationResponse.ItemResult toItemResult(NormalizedItem item) {
        Map<String, Object> verified = new LinkedHashMap<>();
        verified.put("amount", item.amount());
        verified.put("annualRate", item.annualRate());
        verified.put("totalTermMonths", item.termMonths());
        verified.put("graceMonths", item.graceMonths());
        verified.put("repaymentType", item.repaymentType());
        verified.put("monthlyContribution", item.monthlyContribution());
        verified.put("maturityMonth", item.maturityMonth());
        Map<String, Object> itemAssumptions = new LinkedHashMap<>();
        itemAssumptions.put("costReductionRatio", item.costReductionRatio());
        itemAssumptions.put("salesUpliftRatio", item.salesUpliftRatio());
        itemAssumptions.put("protectionNotMonetized", INSURANCE.equals(item.type()));
        return new SimulationResponse.ItemResult(item.sourceType(), item.id(), item.name(), item.type(), item.category(),
                item.sourceUrl(), item.applicationUrl(), item.eligibilityStatus(), Map.copyOf(verified), Map.copyOf(itemAssumptions));
    }

    private List<String> warnings(ResolvedInput input, SalesForecast forecast, List<NormalizedItem> items,
                                  SimulationResponse.ConstraintResult constraints, SimulationResponse.Confidence confidence) {
        List<String> result = new ArrayList<>(inputAssumptions(input).messages());
        result.add("Sales forecast provider is " + forecast.provider() + "; this is not a trained credit decision model.");
        if (items.stream().anyMatch(i -> "UNKNOWN".equals(i.eligibilityStatus()))) {
            result.add("Final product eligibility requires review against official terms.");
        }
        if (items.stream().anyMatch(i -> INSURANCE.equals(i.type()))) {
            result.add("Insurance premiums affect cash flow, but claim benefits are not estimated without actuarial evidence.");
        }
        result.addAll(constraints.violations());
        if (!"HIGH".equals(confidence.level())) result.add("Short sales history reduces forecast confidence.");
        return List.copyOf(new LinkedHashSet<>(result));
    }

    private List<String> agentHints(SimulationResponse.StochasticResult risk, ScenarioComputation selected,
                                    SimulationResponse.ConstraintResult constraints) {
        List<String> hints = new ArrayList<>();
        hints.add("Use numeric engine outputs as source of truth; an LLM may only explain them.");
        if (risk.bufferBreachProbability() >= .3) hints.add("Explain the cash buffer breach risk and show a lower-obligation alternative.");
        if (selected.deterministic().firstBufferBreachMonth() != null) hints.add("Highlight the first projected cash shortage month.");
        if (!constraints.repaymentBurdenPassed()) hints.add("Warn that the debt payment burden limit is exceeded.");
        return List.copyOf(hints);
    }

    private String decideStatus(SimulationResponse.StochasticResult risk, SimulationResponse.ConstraintResult constraints) {
        if (!constraints.violations().isEmpty()) return "REVIEW_REQUIRED";
        if (risk.bufferBreachProbability() >= .5) return "HIGH_RISK";
        if (risk.bufferBreachProbability() >= .2) return "CAUTION";
        return "STABLE";
    }

    private RiskModel buildRiskModel(SimulationRequest request) {
        double personal = coefficientOfVariation(request.monthlySales());
        double industry = request.diagnosis() != null && request.diagnosis().industryCv() != null
                ? request.diagnosis().industryCv() : assumptions.industryCv();
        double weight = Math.min(.7, .7 * request.monthlySales().size() / 12.0);
        return new RiskModel(round4(personal), round4(industry), round4(weight), round4(weight * personal + (1 - weight) * industry));
    }

    private SimulationResponse.Confidence confidence(int salesMonths) {
        if (salesMonths >= 12) return new SimulationResponse.Confidence("HIGH", "At least 12 months of sales history is available.");
        if (salesMonths >= 6) return new SimulationResponse.Confidence("MEDIUM", "Six to eleven months of sales history is available.");
        return new SimulationResponse.Confidence("LOW", "Fewer than six months of sales history is available.");
    }

    private Optional<JsonNode> defaultsFor(String source, String id, String policyKey) {
        if (KB_PRODUCT.equals(source) && id != null) return assumptions.kbProductDefault(id);
        if (SEOUL_POLICY.equals(source)) return assumptions.policyDefault(policyKey);
        return Optional.empty();
    }

    private String inferPolicyKey(SimulationRequest.SelectedItem item, CatalogItem catalog) {
        String explicit = upper(item.type(), null);
        if (LOAN.equals(explicit)) return "LOAN";
        if (GRANT.equals(explicit)) return "GRANT";
        if (COST_REDUCTION.equals(explicit)) return "CONSULTING";
        if (SALES_UPLIFT.equals(explicit)) return "MARKETING";
        if (catalog != null) {
            String haystack = (String.join(" ", catalog.supportTypes()) + " " + catalog.category() + " " + catalog.summary()).toLowerCase(Locale.ROOT);
            if (haystack.contains("loan") || haystack.contains("finance") || haystack.contains("guarantee")) return "LOAN";
            if (haystack.contains("grant") || haystack.contains("subsid")) return "GRANT";
            if (haystack.contains("marketing")) return "MARKETING";
        }
        return "CONSULTING";
    }

    private String inferType(String source, CatalogItem catalog) {
        if (catalog == null) return CASH_MANAGEMENT;
        if (SEOUL_POLICY.equals(source)) {
            return switch (inferPolicyKey(new SimulationRequest.SelectedItem(source, catalog.id(), null, null,
                    null, null, null, null, null, null, null, null, null, null, null, null, null,
                    null, null, null, null, null, null, null, null), catalog)) {
                case "LOAN", "GUARANTEE" -> LOAN;
                case "GRANT" -> GRANT;
                case "MARKETING" -> SALES_UPLIFT;
                default -> COST_REDUCTION;
            };
        }
        String category = catalog.category() == null ? "" : catalog.category().toLowerCase(Locale.ROOT);
        return category.contains("loan") || category.contains("finance") || category.contains("debt") ? LOAN : CASH_MANAGEMENT;
    }

    private boolean isRefinance(SimulationRequest.SelectedItem item, CatalogItem catalog) {
        String text = ((item.id() == null ? "" : item.id()) + " " + (item.name() == null ? "" : item.name())
                + " " + (catalog == null ? "" : catalog.category()) + " " + (catalog == null ? "" : catalog.summary())).toLowerCase(Locale.ROOT);
        return text.contains("refi") || text.contains("restructur") || text.contains("대환");
    }

    private List<SimulationRequest.CashEvent> defaultSpending(String type, BigDecimal amount, double selfFunding,
                                                               String paymentMethod, boolean refinance) {
        if (refinance) return List.of(new SimulationRequest.CashEvent(1, amount));
        if (GRANT.equals(type) && "REIMBURSEMENT".equals(paymentMethod)) {
            BigDecimal projectCost = amount.divide(BigDecimal.valueOf(Math.max(.01, 1 - selfFunding)), 0, RoundingMode.HALF_UP);
            return List.of(new SimulationRequest.CashEvent(1, projectCost));
        }
        return List.of();
    }

    private void validateSpending(List<SimulationRequest.CashEvent> events) {
        for (SimulationRequest.CashEvent event : events) {
            if (event.month() == null || event.month() < 1 || event.amount() == null || event.amount().signum() < 0) {
                throw new IllegalArgumentException("Project spending events require a positive month and non-negative amount.");
            }
        }
    }

    private BigDecimal equalPayment(BigDecimal principal, double monthlyRate, int months) {
        if (monthlyRate == 0) return principal.divide(BigDecimal.valueOf(months), 8, RoundingMode.HALF_UP);
        double factor = Math.pow(1 + monthlyRate, months);
        return BigDecimal.valueOf(principal.doubleValue() * monthlyRate * factor / (factor - 1));
    }

    private static BigDecimal[] zeros(int size) {
        BigDecimal[] result = new BigDecimal[size];
        Arrays.fill(result, ZERO);
        return result;
    }

    private static BigDecimal average(List<BigDecimal> values) {
        return values.stream().reduce(ZERO, BigDecimal::add).divide(BigDecimal.valueOf(values.size()), 8, RoundingMode.HALF_UP);
    }

    private static double coefficientOfVariation(List<BigDecimal> values) {
        double average = values.stream().mapToDouble(BigDecimal::doubleValue).average().orElse(0);
        if (average == 0) return 0;
        double variance = values.stream().mapToDouble(v -> Math.pow(v.doubleValue() - average, 2)).average().orElse(0);
        return Math.sqrt(variance) / average;
    }

    private static BigDecimal decimal(JsonNode node, String field, BigDecimal fallback) {
        return node != null && node.path(field).isNumber() ? node.path(field).decimalValue() : fallback;
    }

    private static double number(JsonNode node, String field, double fallback) {
        return node != null && node.path(field).isNumber() ? node.path(field).asDouble() : fallback;
    }

    private static int integer(JsonNode node, String field, int fallback) {
        return node != null && node.path(field).isNumber() ? node.path(field).asInt() : fallback;
    }

    private static String text(JsonNode node, String field) {
        return node != null && node.path(field).isTextual() ? node.path(field).asText() : null;
    }

    private static BigDecimal defaultAmount(String type) {
        return GRANT.equals(type) ? BigDecimal.valueOf(5_000_000) : LOAN.equals(type) ? BigDecimal.valueOf(10_000_000) : ZERO;
    }

    private static BigDecimal value(BigDecimal value, BigDecimal fallback) { return value == null ? fallback : value; }
    private static double value(Double value, double fallback) { return value == null ? fallback : value; }
    private static int value(Integer value, int fallback) { return value == null ? fallback : value; }
    private static int bounded(Integer value, int fallback, int min, int max) { return Math.max(min, Math.min(max, value(value, fallback))); }
    private static String upper(String value, String fallback) { return value == null || value.isBlank() ? fallback : value.toUpperCase(Locale.ROOT); }
    private static String firstNonBlank(String... values) { for (String value : values) if (value != null && !value.isBlank()) return value; return null; }
    private static double clamp(double value, double min, double max) { return Math.max(min, Math.min(max, value)); }
    private static double d(BigDecimal value) { return money(value).doubleValue(); }
    private static BigDecimal money(double value) { return money(BigDecimal.valueOf(value)); }
    private static BigDecimal money(BigDecimal value) { return value.setScale(0, RoundingMode.HALF_UP); }
    private static double ratio(int count, int total) { return Math.round((count / (double) total) * 10_000d) / 10_000d; }
    private static int displayPercent(double value) { return (int) Math.round(value * 100); }
    private static double round4(double value) { return Math.round(value * 10_000d) / 10_000d; }
    private static double percentile(double[] sorted, double p) { int i = (int) Math.floor((sorted.length - 1) * p); return Math.rint(sorted[Math.max(0, Math.min(sorted.length - 1, i))]); }
    private static void requireNonNegative(BigDecimal value, String field) { if (value != null && value.signum() < 0) throw new IllegalArgumentException(field + " cannot be negative."); }

    private record CostModel(BigDecimal fixedCost, double variableCostRatio, boolean legacy, List<String> messages) {}
    private record RiskModel(double personalCv, double industryCv, double personalWeight, double mixedCv) {}
    private record ResolvedInput(List<BigDecimal> monthlySales, BigDecimal currentCash, BigDecimal existingDebt,
                                 BigDecimal existingMonthlyPayment, double existingLoanRate, int existingLoanRemainingMonths,
                                 BigDecimal fixedCost, double variableCostRatio, double taxReserveRatio,
                                 BigDecimal safetyThreshold, String safetyThresholdType, boolean currentCashAssumed,
                                 boolean debtAssumed, boolean paymentAssumed, boolean legacyCostModel, List<String> costMessages) {}
    private record MonthlyVectors(BigDecimal[] financingInflow, BigDecimal[] subsidyInflow, BigDecimal[] projectSpending,
                                  BigDecimal[] newRepayment, BigDecimal[] interest, BigDecimal[] financingFee,
                                  int refinanceEffectiveMonth) {}
    private record AssetMonth(BigDecimal contribution, BigDecimal interest, BigDecimal maturityInflow, BigDecimal balance) {}
    private record ScenarioComputation(SimulationResponse.DeterministicResult deterministic,
                                       List<SimulationResponse.MonthlyCashFlow> flows, BigDecimal totalInterest,
                                       BigDecimal totalFees, BigDecimal maxDebtPayment, BigDecimal totalFunding) {}
    private record NormalizedItem(String sourceType, String id, String name, String type, String category,
                                  String sourceUrl, String applicationUrl, String eligibilityStatus, BigDecimal amount,
                                  double annualRate, int termMonths, int graceMonths, String repaymentType,
                                  int disbursementMonth, BigDecimal upfrontFee, double feeRate,
                                  List<SimulationRequest.CashEvent> spending, double selfFundingRatio, String paymentMethod,
                                  double costReductionRatio, double salesUpliftRatio, BigDecimal requiredFundingAmount,
                                  String duplicateGroup, BigDecimal monthlyContribution, double assetAnnualRate,
                                  int maturityMonth, String protectionType, String protectionBasis, boolean refinance,
                                  CatalogItem catalog) {
        String key() { return sourceType + ":" + id; }
    }
}
