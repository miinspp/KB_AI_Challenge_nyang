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
                request.diagnosis() == null ? null : request.diagnosis().region(),
                request.monthlySalesMonths()));
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
        SimulationResponse.Confidence confidence = confidence(request, input);
        List<String> warnings = warnings(input, forecast, items, constraints, confidence, request.monthlySales().size());

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
                        assumptions.assumptionVersion(), assumptions.officialTermsAsOf(),
                        input.taxReserveRatio(), money(input.safetyThreshold()).doubleValue(), input.safetyThresholdType(),
                        risk.industryCv(), risk.mixedCv(), risk.personalCv(), risk.personalWeight(),
                        assumptions.maxMonthlyTrendRatio(), assumptions.salesShockAutocorrelation(),
                        input.observedFixedCostCv() == null ? assumptions.fixedCostCv() : input.observedFixedCostCv(),
                        input.observedVariableCostCv() == null ? assumptions.variableCostCv() : input.observedVariableCostCv(),
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
        if (request.currentCash() == null) {
            throw new IllegalArgumentException("currentCash is required.");
        }
        if (request.existingDebtBalance() == null) {
            throw new IllegalArgumentException("existingDebtBalance is required. Send zero only after the user explicitly selects no debt.");
        }
        if (request.existingMonthlyPayment() == null) {
            throw new IllegalArgumentException("existingMonthlyPayment is required. Send zero only after the user explicitly selects no debt.");
        }
        requireNonNegative(request.currentCash(), "currentCash");
        requireNonNegative(request.existingDebtBalance(), "existingDebtBalance");
        requireNonNegative(request.existingMonthlyPayment(), "existingMonthlyPayment");
        if (request.existingDebtBalance().signum() > 0
                && (request.existingLoanInterestRate() == null || request.existingLoanInterestRate() <= 0
                || request.existingLoanRemainingMonths() == null || request.existingLoanRemainingMonths() <= 0)) {
            throw new IllegalArgumentException("Existing debt requires a positive interest rate and remaining term.");
        }
        if (request.existingDebtBalance().signum() == 0 && request.existingMonthlyPayment().signum() > 0) {
            throw new IllegalArgumentException("existingMonthlyPayment must be zero when existingDebtBalance is zero.");
        }
    }

    private ResolvedInput resolveInput(SimulationRequest request) {
        BigDecimal averageSales = average(request.monthlySales());
        CostModel cost = resolveCostModel(request, averageSales);
        double taxRatio = request.taxReserveRatio() == null ? 0 : request.taxReserveRatio();
        if (taxRatio < 0 || taxRatio >= 1 || cost.variableCostRatio() + taxRatio >= 1) {
            throw new IllegalArgumentException("Variable cost ratio plus tax reserve ratio must be below 100%.");
        }

        boolean currentCashAssumed = false;
        boolean debtAssumed = false;
        boolean paymentAssumed = false;
        BigDecimal currentCash = request.currentCash();
        List<SimulationRequest.ExistingLoan> existingLoans = resolveExistingLoans(request);
        BigDecimal existingDebt = existingLoans.isEmpty()
                ? request.existingDebtBalance()
                : existingLoans.stream().map(SimulationRequest.ExistingLoan::balance).reduce(ZERO, BigDecimal::add);
        BigDecimal existingPayment = existingLoans.isEmpty()
                ? request.existingMonthlyPayment()
                : existingLoans.stream().map(loan -> value(loan.monthlyPayment(), ZERO)).reduce(ZERO, BigDecimal::add);
        double existingRate = existingLoans.isEmpty()
                ? value(request.existingLoanInterestRate(), 0)
                : weightedLoanRate(existingLoans);
        int existingRemainingMonths = existingLoans.isEmpty()
                ? value(request.existingLoanRemainingMonths(), 0)
                : existingLoans.stream().mapToInt(loan -> value(loan.remainingMonths(), 0)).max().orElse(0);
        Map<Integer, BigDecimal> scheduledTaxes = resolveScheduledTaxes(request.scheduledTaxPayments());
        Double observedCashFlowResidualCv = resolveAccountCashFlowResidualCv(
                request, averageSales, existingPayment);
        List<String> inputMessages = new ArrayList<>(cost.messages());
        if (!existingLoans.isEmpty()) inputMessages.add("Linked loan-level repayment schedules were used.");
        if (!scheduledTaxes.isEmpty()) inputMessages.add("Linked scheduled tax payments were applied in their due months.");
        if (observedCashFlowResidualCv != null) {
            inputMessages.add("Linked monthly account cash flows were used to calibrate unclassified cash-flow volatility.");
        }
        if (request.taxReserveRatio() == null && scheduledTaxes.isEmpty()) {
            inputMessages.add("Tax reserve was not estimated because verified tax payment history was unavailable.");
        }

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
                existingRate, existingRemainingMonths, existingLoans,
                cost.fixedCost(), cost.variableCostRatio(), taxRatio, threshold, thresholdType,
                scheduledTaxes, cost.observedFixedCostCv(), cost.observedVariableCostCv(),
                observedCashFlowResidualCv,
                currentCashAssumed, debtAssumed, paymentAssumed, cost.legacy(), List.copyOf(inputMessages));
    }

    private Double resolveAccountCashFlowResidualCv(SimulationRequest request, BigDecimal averageSales,
                                                    BigDecimal existingPayment) {
        List<SimulationRequest.MonthlyAccountCashFlow> cashFlows = request.monthlyAccountCashFlows();
        List<SimulationRequest.MonthlyExpense> expenses = request.monthlyExpenseHistory();
        List<String> months = request.monthlySalesMonths();
        if (cashFlows == null || cashFlows.size() < 3 || expenses == null || expenses.size() < 3
                || months == null || months.size() != request.monthlySales().size()
                || averageSales.signum() <= 0) {
            return null;
        }

        Map<String, BigDecimal> salesByMonth = new LinkedHashMap<>();
        for (int i = 0; i < months.size(); i++) {
            if (months.get(i) != null) salesByMonth.put(months.get(i), request.monthlySales().get(i));
        }
        Map<String, BigDecimal> expenseByMonth = new LinkedHashMap<>();
        for (SimulationRequest.MonthlyExpense expense : expenses) {
            if (expense.month() != null) {
                expenseByMonth.put(expense.month(), value(expense.totalExpense(), ZERO));
            }
        }

        List<BigDecimal> residuals = new ArrayList<>();
        for (SimulationRequest.MonthlyAccountCashFlow flow : cashFlows) {
            if (flow.month() == null || flow.inflow() == null || flow.outflow() == null
                    || flow.inflow().signum() < 0 || flow.outflow().signum() < 0) {
                throw new IllegalArgumentException(
                        "Monthly account cash flows require a month and non-negative inflow/outflow.");
            }
            BigDecimal sales = salesByMonth.get(flow.month());
            BigDecimal expense = expenseByMonth.get(flow.month());
            if (sales == null || expense == null) continue;
            BigDecimal accountNet = flow.inflow().subtract(flow.outflow());
            BigDecimal modeledNet = sales.subtract(expense).subtract(existingPayment);
            residuals.add(accountNet.subtract(modeledNet));
        }
        if (residuals.size() < 3) return null;
        double normalizedResidualVolatility = standardDeviation(residuals) / averageSales.doubleValue();
        return round4(clamp(normalizedResidualVolatility, 0, .15));
    }

    private CostModel resolveCostModel(SimulationRequest request, BigDecimal averageSales) {
        if (request.monthlyExpenseHistory() != null && request.monthlyExpenseHistory().size() >= 3) {
            List<SimulationRequest.MonthlyExpense> history = request.monthlyExpenseHistory();
            List<BigDecimal> fixedHistory = history.stream().map(row -> value(row.rent(), ZERO)
                    .add(value(row.laborCost(), ZERO)).add(value(row.otherExpense(), ZERO))).toList();
            List<BigDecimal> variableHistory = history.stream().map(row -> value(row.materialCost(), ZERO)
                    .add(value(row.cardFee(), ZERO))).toList();
            BigDecimal fixed = average(fixedHistory);
            BigDecimal variable = average(variableHistory);
            double linkedRatio = averageSales.signum() > 0
                    ? variable.divide(averageSales, 8, RoundingMode.HALF_UP).doubleValue() : 0;
            if (linkedRatio < 0 || linkedRatio >= 1) {
                throw new IllegalArgumentException("Linked monthly variable expenses must be below average sales.");
            }
            return new CostModel(money(fixed), linkedRatio, false,
                    coefficientOfVariation(fixedHistory), coefficientOfVariation(variableHistory),
                    List.of("Linked monthly expense history was used for cost averages and volatility."));
        }
        SimulationRequest.CostStructure structure = request.costStructure();
        if (structure == null) {
            if (request.fixedCost() == null || request.variableCostRatio() == null) {
                throw new IllegalArgumentException("fixedCost and variableCostRatio are required when costStructure is absent.");
            }
            return new CostModel(request.fixedCost(), request.variableCostRatio(), true, null, null,
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
        return new CostModel(money(fixed), linkedRatio, false, null, null, List.copyOf(messages));
    }

    private List<SimulationRequest.ExistingLoan> resolveExistingLoans(SimulationRequest request) {
        if (request.existingLoans() == null || request.existingLoans().isEmpty()) return List.of();
        List<SimulationRequest.ExistingLoan> result = new ArrayList<>();
        for (SimulationRequest.ExistingLoan loan : request.existingLoans()) {
            BigDecimal balance = value(loan.balance(), ZERO);
            if (balance.signum() <= 0) continue;
            double annualRate = value(loan.annualRate(), 0);
            int remainingMonths = value(loan.remainingMonths(), 0);
            if (annualRate <= 0 || remainingMonths <= 0) {
                throw new IllegalArgumentException("Linked loan requires rate and remaining term: " + loan.id());
            }
            result.add(new SimulationRequest.ExistingLoan(
                    loan.id(), loan.name(), balance, annualRate,
                    upper(loan.repaymentType(), "EQUAL_PAYMENT"), value(loan.monthlyPayment(), ZERO),
                    remainingMonths, loan.nextPaymentDate(), loan.maturityDate()));
        }
        return List.copyOf(result);
    }

    private double weightedLoanRate(List<SimulationRequest.ExistingLoan> loans) {
        BigDecimal total = loans.stream().map(SimulationRequest.ExistingLoan::balance).reduce(ZERO, BigDecimal::add);
        if (total.signum() <= 0) return 0;
        double weighted = loans.stream().mapToDouble(loan -> loan.balance().doubleValue() * loan.annualRate()).sum();
        return weighted / total.doubleValue();
    }

    private Map<Integer, BigDecimal> resolveScheduledTaxes(List<SimulationRequest.ScheduledTaxPayment> payments) {
        if (payments == null || payments.isEmpty()) return Map.of();
        Map<Integer, BigDecimal> result = new LinkedHashMap<>();
        for (SimulationRequest.ScheduledTaxPayment payment : payments) {
            if (payment.month() == null || payment.month() < 1 || payment.amount() == null || payment.amount().signum() < 0) {
                throw new IllegalArgumentException("Scheduled tax payments require a positive month and non-negative amount.");
            }
            result.merge(payment.month(), payment.amount(), BigDecimal::add);
        }
        return Map.copyOf(result);
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
                    decimal(defaults, "monthly_contribution", SAVINGS.equals(type) ? BigDecimal.valueOf(300_000)
                            : (MUTUAL_AID.equals(type) || INSURANCE.equals(type)) ? amount : ZERO));
            int term = value(raw.totalTermMonths(), integer(defaults, "total_term_months", LOAN.equals(type) ? 60 : 0));
            int grace = value(raw.graceMonths(), integer(defaults, "grace_months", 0));
            int disbursement = bounded(raw.disbursementMonth(), integer(defaults, "disbursement_month", 1), 1, 60);
            String duplicateGroup = firstNonBlank(officialDuplicateGroup(source, raw.id()), raw.duplicateGroup(), raw.id());
            if (duplicateGroup != null && !duplicateGroups.add(duplicateGroup)) {
                throw new IllegalArgumentException("Duplicate benefit group selected: " + duplicateGroup);
            }

            Double catalogMax = catalog.map(CatalogItem::maxAmountWon).orElse(null);
            BigDecimal minAmount = decimal(defaults, "min_amount", null);
            BigDecimal defaultMax = decimal(defaults, "max_amount", null);
            BigDecimal maxAmount = catalogMax == null ? defaultMax : BigDecimal.valueOf(catalogMax);
            if (minAmount != null && amount.compareTo(minAmount) < 0) {
                throw new IllegalArgumentException("Requested amount is below product minimum: " + raw.id());
            }
            if (maxAmount != null && amount.compareTo(maxAmount) > 0) {
                if (raw.amount() == null) {
                    amount = maxAmount;
                } else {
                    throw new IllegalArgumentException("Requested amount exceeds product maximum: " + raw.id());
                }
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
            if (refinance && raw.amount() == null) {
                amount = input.existingDebt();
            }
            if (refinance && amount.compareTo(input.existingDebt()) > 0) {
                throw new IllegalArgumentException("Refinancing amount cannot exceed existing debt balance.");
            }

            double selfFunding = value(raw.selfFundingRatio(), number(defaults, "self_funding_ratio", 0));
            String paymentMethod = upper(firstNonBlank(raw.paymentMethod(), text(defaults, "payment_method")), "DIRECT");
            List<SimulationRequest.CashEvent> spending = raw.projectSpendingSchedule() == null
                    ? defaultSpending(type, amount, selfFunding, paymentMethod, refinance, disbursement)
                    : List.copyOf(raw.projectSpendingSchedule());
            validateSpending(spending);
            double annualRate = value(raw.annualRate(), number(defaults, "annual_rate", LOAN.equals(type) ? .045 : 0));
            if (refinance && raw.annualRate() == null && input.existingLoanRate() > 0) {
                annualRate = input.existingLoanRate();
            }

            result.add(new NormalizedItem(
                    source, raw.id(), firstNonBlank(raw.name(), catalog.map(CatalogItem::name).orElse(null), raw.id()), type,
                    catalog.map(CatalogItem::category).orElse(null), catalog.map(CatalogItem::sourceUrl).orElse(null),
                    catalog.map(CatalogItem::applicationUrl).orElse(null), upper(raw.eligibilityStatus(), "UNKNOWN"),
                    amount, annualRate, term, grace,
                    upper(firstNonBlank(raw.repaymentType(), text(defaults, "repayment_type")), LOAN.equals(type) ? "EQUAL_PAYMENT" : "NONE"), disbursement,
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
        // 대환은 "이 대환 금액만큼 기존 상환액이 줄어든다"는 뜻이지 "기존 대출이 전부 없어진다"는 뜻이 아니다.
        // existingRepaymentSchedule()은 여러 기존 대출을 합산한 값이라, 대환 금액이 기존 부채 총액의 일부일 때도
        // 상환액을 통째로 0으로 만들면 과대평가된다. 어느 대출을 얼마나 갚는지까지는 입력을 안 받으니(스키마 확장 필요),
        // 우선은 "대환 금액/기존 부채 총액" 비율만큼만 비례해서 줄인다.
        double refinanceFraction = input.existingDebt().signum() > 0
                ? clamp(vectors.refinanceAmount().divide(input.existingDebt(), 8, RoundingMode.HALF_UP).doubleValue(), 0, 1)
                : 0;
        Map<String, BigDecimal> assetBalances = new LinkedHashMap<>();
        List<SimulationResponse.MonthlyCashFlow> flows = new ArrayList<>();
        BigDecimal cash = input.currentCash();
        BigDecimal minimumCash = cash;
        Integer firstBuffer = null;
        Integer firstNegative = null;
        BigDecimal maxDebtPayment = ZERO;
        BigDecimal totalInterest = ZERO;
        BigDecimal totalFees = ZERO;
        BigDecimal[] existingRepayments = existingRepaymentSchedule(input, horizon);

        for (int i = 0; i < horizon; i++) {
            int month = i + 1;
            BigDecimal opening = cash;
            BigDecimal sales = money(forecast.months().get(i).p50().multiply(BigDecimal.valueOf(1 + salesUplift)));
            BigDecimal variableCost = money(sales.multiply(BigDecimal.valueOf(input.variableCostRatio())));
            BigDecimal fixedCost = money(input.fixedCost().multiply(BigDecimal.valueOf(1 - costReduction)));
            BigDecimal taxReserve = input.scheduledTaxPayments().isEmpty()
                    ? money(sales.multiply(BigDecimal.valueOf(input.taxReserveRatio())))
                    : money(input.scheduledTaxPayments().getOrDefault(month, ZERO));
            BigDecimal scheduledExistingPayment = existingRepayments[i];
            BigDecimal existingPayment = vectors.refinanceEffectiveMonth() > 0 && month >= vectors.refinanceEffectiveMonth()
                    ? money(scheduledExistingPayment.multiply(BigDecimal.valueOf(1 - refinanceFraction)))
                    : scheduledExistingPayment;

            AssetMonth assetMonth = assetMonth(items, assetBalances, month);
            BigDecimal operating = sales.subtract(variableCost).subtract(fixedCost).subtract(taxReserve).subtract(existingPayment);
            cash = opening.add(vectors.financingInflow()[i]).add(vectors.subsidyInflow()[i])
                    .subtract(vectors.projectSpending()[i]).subtract(vectors.newRepayment()[i]).subtract(vectors.financingFee()[i])
                    .subtract(assetMonth.contribution()).add(assetMonth.maturityInflow()).add(operating);
            cash = money(cash);
            minimumCash = minimumCash.min(cash);
            BigDecimal safetyThreshold = safetyThresholdForMonth(input, fixedCost, existingPayment, vectors.newRepayment()[i]);
            if (firstBuffer == null && cash.compareTo(safetyThreshold) < 0) firstBuffer = month;
            if (firstNegative == null && cash.signum() < 0) firstNegative = month;
            maxDebtPayment = maxDebtPayment.max(existingPayment.add(vectors.newRepayment()[i]));
            totalInterest = totalInterest.add(vectors.interest()[i]);
            totalFees = totalFees.add(vectors.financingFee()[i]);

            flows.add(new SimulationResponse.MonthlyCashFlow(
                    month, d(opening), d(vectors.financingInflow()[i]), d(vectors.subsidyInflow()[i]), d(vectors.projectSpending()[i]),
                    d(sales), d(variableCost), d(fixedCost), d(taxReserve), d(existingPayment), d(vectors.newRepayment()[i]),
                    d(vectors.financingFee()[i]), d(operating), d(cash), cash.compareTo(safetyThreshold) < 0, cash.signum() < 0,
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
        BigDecimal refinanceAmount = ZERO;

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
            if (item.refinance()) {
                refinanceMonth = refinanceMonth == 0 ? item.disbursementMonth() : Math.min(refinanceMonth, item.disbursementMonth());
                refinanceAmount = refinanceAmount.add(item.amount());
            }
            if (LOAN.equals(item.type())) addRepaymentSchedule(item, repayment, interest, horizon);
        }
        return new MonthlyVectors(financing, subsidy, spending, repayment, interest, fees, refinanceMonth, refinanceAmount);
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
                    case "INTEREST_ONLY" -> amortized == amortizingMonths - 1 ? balance : ZERO;
                    default -> equalPrincipal.min(balance);
                };
            }
            BigDecimal payment = monthInterest.add(principal);
            payments[index] = payments[index].add(payment);
            interest[index] = interest[index].add(monthInterest);
            balance = balance.subtract(principal).max(ZERO);
        }
    }

    /**
     * Uses the actual monthly payment when it is available. When only balance, rate and
     * remaining term are supplied (the normal MyData case), it derives an equal-payment
     * schedule so that an existing loan is not treated as an endless fixed expense.
     */
    private BigDecimal[] existingRepaymentSchedule(ResolvedInput input, int horizon) {
        BigDecimal[] payments = zeros(horizon);
        if (!input.existingLoans().isEmpty()) {
            for (SimulationRequest.ExistingLoan loan : input.existingLoans()) {
                addExistingLoanSchedule(loan, payments, horizon);
            }
            return payments;
        }
        if (input.existingDebt().signum() <= 0) {
            Arrays.fill(payments, input.existingMonthlyPayment());
            return payments;
        }

        int remainingMonths = input.existingLoanRemainingMonths();
        if (remainingMonths <= 0) {
            Arrays.fill(payments, input.existingMonthlyPayment());
            return payments;
        }

        double monthlyRate = input.existingLoanRate() / 12.0;
        BigDecimal regularPayment = input.existingMonthlyPayment().signum() > 0
                ? input.existingMonthlyPayment()
                : equalPayment(input.existingDebt(), monthlyRate, remainingMonths);
        BigDecimal balance = input.existingDebt();
        int months = Math.min(horizon, remainingMonths);
        for (int i = 0; i < months && balance.signum() > 0; i++) {
            BigDecimal interest = money(balance.multiply(BigDecimal.valueOf(monthlyRate)));
            BigDecimal principal = regularPayment.subtract(interest).max(ZERO).min(balance);
            // Clear the remaining balance in the known final month, including a balloon amount.
            if (i == remainingMonths - 1) principal = balance;
            payments[i] = money(interest.add(principal));
            balance = balance.subtract(principal).max(ZERO);
        }
        return payments;
    }

    private void addExistingLoanSchedule(SimulationRequest.ExistingLoan loan, BigDecimal[] payments, int horizon) {
        BigDecimal balance = loan.balance();
        int remainingMonths = loan.remainingMonths();
        double monthlyRate = loan.annualRate() / 12.0;
        String repaymentType = upper(loan.repaymentType(), "EQUAL_PAYMENT");
        BigDecimal equalPrincipal = balance.divide(BigDecimal.valueOf(remainingMonths), 8, RoundingMode.HALF_UP);
        BigDecimal equalPayment = value(loan.monthlyPayment(), ZERO).signum() > 0
                ? loan.monthlyPayment() : equalPayment(balance, monthlyRate, remainingMonths);

        for (int i = 0; i < Math.min(horizon, remainingMonths) && balance.signum() > 0; i++) {
            BigDecimal interest = money(balance.multiply(BigDecimal.valueOf(monthlyRate)));
            BigDecimal principal = switch (repaymentType) {
                case "EQUAL_PRINCIPAL" -> equalPrincipal.min(balance);
                case "BULLET", "INTEREST_ONLY" -> i == remainingMonths - 1 ? balance : ZERO;
                default -> equalPayment.subtract(interest).max(ZERO).min(balance);
            };
            if (i == remainingMonths - 1) principal = balance;
            payments[i] = payments[i].add(money(interest.add(principal)));
            balance = balance.subtract(principal).max(ZERO);
        }
    }

    private BigDecimal safetyThresholdForMonth(ResolvedInput input, BigDecimal fixedCost,
                                                BigDecimal existingPayment, BigDecimal newPayment) {
        return switch (input.safetyThresholdType()) {
            case "FIXED_COST_PLUS_DEBT_PAYMENT" -> money(fixedCost.add(existingPayment).add(newPayment));
            case "ONE_MONTH_FIXED_COST" -> money(fixedCost);
            default -> input.safetyThreshold();
        };
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
        double fixedCostCv = clamp(input.observedFixedCostCv() == null
                ? assumptions.fixedCostCv() : input.observedFixedCostCv(), 0, .3);
        double variableCostCv = clamp(input.observedVariableCostCv() == null
                ? assumptions.variableCostCv() : input.observedVariableCostCv(), 0, .4);
        double accountResidualCv = clamp(value(input.observedCashFlowResidualCv(), 0), 0, .15);

        for (int run = 0; run < runs; run++) {
            double cash = input.currentCash().doubleValue();
            boolean everBuffer = false;
            boolean everNegative = false;
            double previousShock = 0;
            for (int i = 0; i < horizon; i++) {
                SimulationResponse.MonthlyCashFlow flow = scenario.flows().get(i);
                previousShock = rho * previousShock + innovationScale * random.nextGaussian();
                double sales = Math.max(0, flow.expectedSales() * (1 + previousShock * risk.mixedCv()));
                double variable = sales * input.variableCostRatio()
                        * clamp(1 + random.nextGaussian() * variableCostCv, .7, 1.4);
                double fixed = flow.fixedCost() * clamp(1 + random.nextGaussian() * fixedCostCv, .8, 1.25);
                double tax = input.scheduledTaxPayments().isEmpty()
                        ? sales * input.taxReserveRatio() : flow.taxReserve();
                double accountResidual = accountResidualCv == 0 ? 0
                        : clamp(random.nextGaussian() * flow.expectedSales() * accountResidualCv,
                        -flow.expectedSales() * .25, flow.expectedSales() * .25);
                cash += flow.financingInflow() + flow.subsidyInflow() - flow.projectSpending()
                        - flow.existingRepayment() - flow.newRepayment() - flow.financingFee()
                        - flow.financialAssetContribution() + flow.financialAssetMaturityInflow()
                        + sales - variable - fixed - tax + accountResidual;
                double safetyThreshold = safetyThresholdForMonth(input, BigDecimal.valueOf(flow.fixedCost()),
                        BigDecimal.valueOf(flow.existingRepayment()), BigDecimal.valueOf(flow.newRepayment())).doubleValue();
                boolean bufferNow = cash < safetyThreshold;
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
                .mapToDouble(f -> f.operatingCashFlow() - f.newRepayment() - f.financingFee()
                        - f.financialAssetContribution() + f.financialAssetMaturityInflow())
                .average().orElse(0)));
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
        // eligibility/duplicates 둘 다 계산은 하지만 violations에는 넣지 않는다 — 둘 다
        // normalizeAndValidateItems()에서 이미 IllegalArgumentException으로 요청 자체를 막아서
        // (자격 FAIL은 line ~370, 중복 그룹 충돌은 line ~385) 이 지점까지 오는 items는 둘 다 항상
        // 통과된 상태다. 여기서 또 violations에 넣어봐야 절대 발동하지 않는 죽은 분기라 추가하지 않는다.
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
        Optional<JsonNode> evidence = KB_PRODUCT.equals(item.sourceType())
                ? assumptions.kbProductDefault(item.id())
                : SEOUL_POLICY.equals(item.sourceType()) ? assumptions.policyDefault(inferPolicyKeyFromNormalized(item))
                : Optional.empty();
        evidence.ifPresent(node -> {
            String termsSource = text(node, "terms_source");
            String termsAsOf = text(node, "terms_as_of");
            String rateBasis = text(node, "rate_basis");
            String evidenceLevel = text(node, "evidence_level");
            if (termsSource != null) itemAssumptions.put("termsSource", termsSource);
            if (termsAsOf != null) itemAssumptions.put("termsAsOf", termsAsOf);
            if (rateBasis != null) itemAssumptions.put("rateBasis", rateBasis);
            if (evidenceLevel != null) itemAssumptions.put("evidenceLevel", evidenceLevel);
        });
        return new SimulationResponse.ItemResult(item.sourceType(), item.id(), item.name(), item.type(), item.category(),
                item.sourceUrl(), item.applicationUrl(), item.eligibilityStatus(), Map.copyOf(verified), Map.copyOf(itemAssumptions));
    }

    private List<String> warnings(ResolvedInput input, SalesForecast forecast, List<NormalizedItem> items,
                                  SimulationResponse.ConstraintResult constraints, SimulationResponse.Confidence confidence,
                                  int salesMonths) {
        List<String> result = new ArrayList<>(inputAssumptions(input).messages());
        result.add("Sales forecast provider is " + forecast.provider() + "; this is not a trained credit decision model.");
        if (items.stream().anyMatch(i -> "UNKNOWN".equals(i.eligibilityStatus()))) {
            result.add("Final product eligibility requires review against official terms.");
        }
        if (items.stream().anyMatch(i -> INSURANCE.equals(i.type()))) {
            result.add("Insurance premiums affect cash flow, but claim benefits are not estimated without actuarial evidence.");
        }
        if (items.stream().anyMatch(i -> KB_PRODUCT.equals(i.sourceType()) && assumptions.kbProductDefault(i.id()).isEmpty())) {
            result.add("One or more KB product terms use the MVP catalog default until official rate and term data are supplied.");
        }
        if (items.stream().anyMatch(i -> SEOUL_POLICY.equals(i.sourceType()) && LOAN.equals(i.type()))) {
            result.add("Policy financing uses the requested amount and public maximum, but rate and repayment terms require confirmation in the linked official notice.");
        }
        if (items.stream().anyMatch(i -> SEOUL_POLICY.equals(i.sourceType()) && !LOAN.equals(i.type()))) {
            result.add("Policy benefits without structured payment timing, self-funding, and settlement terms were not monetized.");
        }
        result.addAll(constraints.violations());
        // 두 가지를 구분해서 알려준다 — 매출 이력 자체가 짧은 것과, 이력은 충분한데
        // 대출·계좌·세금 상세가 전부 없어서 신뢰도가 깎인 것은 원인이 다르다(둘 다 confidence.level()만
        // 보면 구분이 안 돼서, 12개월 이력이 있는 사용자에게 "매출 이력이 짧다"는 잘못된 메시지가 나갈 수 있다).
        if (salesMonths < 12) result.add("Short sales history reduces forecast confidence.");
        if (confidence.reason().contains("were all missing")) {
            result.add("Missing loan, account cash flow, and tax schedule detail reduces confidence even with a long sales history.");
        }
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
        boolean hasIndustryEvidence = request.diagnosis() != null && request.diagnosis().industryCv() != null;
        double industry = hasIndustryEvidence ? request.diagnosis().industryCv() : personal;
        double weight = hasIndustryEvidence ? Math.min(.7, .7 * request.monthlySales().size() / 12.0) : 1;
        return new RiskModel(round4(personal), round4(industry), round4(weight), round4(weight * personal + (1 - weight) * industry));
    }

    private String officialDuplicateGroup(String source, String id) {
        if (!KB_PRODUCT.equals(source) || id == null) return null;
        return switch (id) {
            case "D002", "D003" -> "KB_119PLUS_RESTRUCTURING";
            default -> null;
        };
    }

    /**
     * 매출 이력 개월수만 보던 기존 신뢰도 산정에, "그 밖의 입력이 얼마나 비어 있는지"를 더한다.
     * 대출별 상환 스케줄·계좌 흐름·세금 일정이 전부(단 하나도) 없으면 신뢰도를 한 단계 낮춘다 —
     * 매출 이력이 길어도 나머지가 전부 대략적인 값이면 실제 신뢰도는 그보다 낮기 때문이다.
     * 다만 "기존 대출이 없어서 existingLoans가 비어 있는" 정상적인 경우까지 페널티를 주면 안 되므로,
     * 대출 스케줄 항목은 existingDebt가 실제로 0보다 클 때만 "비어 있다"고 취급한다.
     */
    private SimulationResponse.Confidence confidence(SimulationRequest request, ResolvedInput input) {
        int salesMonths = request.monthlySales().size();
        String tier = salesMonths >= 12 ? "HIGH" : salesMonths >= 6 ? "MEDIUM" : "LOW";
        String reason = salesMonths >= 12 ? "At least 12 months of sales history is available."
                : salesMonths >= 6 ? "Six to eleven months of sales history is available."
                : "Fewer than six months of sales history is available.";

        boolean missingLoanDetail = input.existingDebt().signum() > 0 && input.existingLoans().isEmpty();
        boolean missingAccountFlows = request.monthlyAccountCashFlows() == null || request.monthlyAccountCashFlows().size() < 3;
        boolean missingTaxSchedule = (request.scheduledTaxPayments() == null || request.scheduledTaxPayments().isEmpty())
                && request.taxReserveRatio() == null;

        if (!"LOW".equals(tier) && missingLoanDetail && missingAccountFlows && missingTaxSchedule) {
            tier = "HIGH".equals(tier) ? "MEDIUM" : "LOW";
            reason += " Loan-level repayment, account cash flow, and tax schedule detail were all missing, so confidence was lowered by one tier.";
        }
        return new SimulationResponse.Confidence(tier, reason);
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
            if (containsAny(haystack, "loan", "finance", "guarantee", "대출", "융자", "보증", "금융", "자금")) return "LOAN";
            if (containsAny(haystack, "grant", "subsid", "지원금", "보조금", "사업화")) return "GRANT";
            if (containsAny(haystack, "marketing", "판로", "마케팅", "홍보", "온라인", "수출")) return "MARKETING";
        }
        return "CONSULTING";
    }

    private String inferPolicyKeyFromNormalized(NormalizedItem item) {
        if (LOAN.equals(item.type())) return "LOAN";
        if (GRANT.equals(item.type())) return "GRANT";
        if (COST_REDUCTION.equals(item.type())) return "CONSULTING";
        if (SALES_UPLIFT.equals(item.type())) return "MARKETING";
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
        if (containsAny(category, "loan", "finance", "debt", "대출", "금융", "보증", "융자")) return LOAN;
        if (containsAny(category, "saving", "savings", "적금", "예금")) return SAVINGS;
        return CASH_MANAGEMENT;
    }

    private boolean isRefinance(SimulationRequest.SelectedItem item, CatalogItem catalog) {
        String text = ((item.id() == null ? "" : item.id()) + " " + (item.name() == null ? "" : item.name())
                + " " + (catalog == null ? "" : catalog.category()) + " " + (catalog == null ? "" : catalog.summary())).toLowerCase(Locale.ROOT);
        return "D002".equalsIgnoreCase(item.id()) || "D003".equalsIgnoreCase(item.id())
                || text.contains("refi") || text.contains("restructur") || text.contains("대환");
    }

    private List<SimulationRequest.CashEvent> defaultSpending(String type, BigDecimal amount, double selfFunding,
                                                               String paymentMethod, boolean refinance, int disbursementMonth) {
        // 대환 원금 상환은 대출금이 실제로 들어오는 달(disbursementMonth)에 나가야 한다 — 1개월차로
        // 고정하면 실행월이 늦은 상품은 자금 유입 없이 지출만 먼저 잡혀 그 달 현금이 부당하게 낮게 나온다.
        if (refinance) return List.of(new SimulationRequest.CashEvent(disbursementMonth, amount));
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

    private static double standardDeviation(List<BigDecimal> values) {
        double average = values.stream().mapToDouble(BigDecimal::doubleValue).average().orElse(0);
        double variance = values.stream().mapToDouble(v -> Math.pow(v.doubleValue() - average, 2)).average().orElse(0);
        return Math.sqrt(variance);
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
    private static boolean containsAny(String value, String... keywords) {
        for (String keyword : keywords) if (value.contains(keyword)) return true;
        return false;
    }
    private static double clamp(double value, double min, double max) { return Math.max(min, Math.min(max, value)); }
    private static double d(BigDecimal value) { return money(value).doubleValue(); }
    private static BigDecimal money(double value) { return money(BigDecimal.valueOf(value)); }
    private static BigDecimal money(BigDecimal value) { return value.setScale(0, RoundingMode.HALF_UP); }
    private static double ratio(int count, int total) { return Math.round((count / (double) total) * 10_000d) / 10_000d; }
    private static int displayPercent(double value) { return (int) Math.round(value * 100); }
    private static double round4(double value) { return Math.round(value * 10_000d) / 10_000d; }
    private static double percentile(double[] sorted, double p) { int i = (int) Math.floor((sorted.length - 1) * p); return Math.rint(sorted[Math.max(0, Math.min(sorted.length - 1, i))]); }
    private static void requireNonNegative(BigDecimal value, String field) { if (value != null && value.signum() < 0) throw new IllegalArgumentException(field + " cannot be negative."); }

    private record CostModel(BigDecimal fixedCost, double variableCostRatio, boolean legacy,
                             Double observedFixedCostCv, Double observedVariableCostCv, List<String> messages) {}
    private record RiskModel(double personalCv, double industryCv, double personalWeight, double mixedCv) {}
    private record ResolvedInput(List<BigDecimal> monthlySales, BigDecimal currentCash, BigDecimal existingDebt,
                                 BigDecimal existingMonthlyPayment, double existingLoanRate, int existingLoanRemainingMonths,
                                 List<SimulationRequest.ExistingLoan> existingLoans,
                                 BigDecimal fixedCost, double variableCostRatio, double taxReserveRatio,
                                 BigDecimal safetyThreshold, String safetyThresholdType,
                                 Map<Integer, BigDecimal> scheduledTaxPayments,
                                 Double observedFixedCostCv, Double observedVariableCostCv,
                                 Double observedCashFlowResidualCv,
                                 boolean currentCashAssumed,
                                 boolean debtAssumed, boolean paymentAssumed, boolean legacyCostModel, List<String> costMessages) {}
    private record MonthlyVectors(BigDecimal[] financingInflow, BigDecimal[] subsidyInflow, BigDecimal[] projectSpending,
                                  BigDecimal[] newRepayment, BigDecimal[] interest, BigDecimal[] financingFee,
                                  int refinanceEffectiveMonth, BigDecimal refinanceAmount) {}
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
