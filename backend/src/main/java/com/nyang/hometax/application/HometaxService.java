package com.nyang.hometax.application;

import com.nyang.hometax.application.dto.HometaxLinkResponse;
import com.nyang.hometax.domain.HometaxFinancials;
import org.springframework.stereotype.Service;

import java.time.YearMonth;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;

/**
 * 홈택스 연동 유스케이스 — 현재는 시뮬레이션(mock) 구현.
 *
 * 실제 서비스에서는 이 클래스가 본인 인증(공동/간편인증) 위임 후 스크래핑 API
 * (쿠콘·헥토 등)를 호출하는 어댑터로 교체되며, 시그니처(사업자번호+동의 → 재무 요약)는 유지된다.
 * 동의(consent=true) 없이는 어떤 조회도 수행하지 않는다.
 *
 * mock 데이터는 사업자번호를 시드로 한 결정적 생성 — 같은 번호는 항상 같은 결과를
 * 돌려줘 데모 재현성을 보장한다. 값 범위는 소상공인실태조사 비용구조의 현실적 구간을 따른다.
 */
@Service
public class HometaxService {

    private static final String NOTICE =
            "본 데이터는 챌린지 데모용 시뮬레이션입니다. 실제 서비스에서는 본인 인증 위임 후 "
            + "홈택스 신고·발급 자료(부가세 매출, 매입 세금계산서, 원천세, 임대료 세금계산서)를 조회하며, "
            + "조회 값은 진단 목적에 한해 사용됩니다.";

    public HometaxLinkResponse link(String businessNumber, boolean consent) {
        if (!consent) {
            throw new IllegalArgumentException("홈택스 정보 제공에 동의해야 연동할 수 있습니다.");
        }
        String digits = businessNumber == null ? "" : businessNumber.replaceAll("[^0-9]", "");
        if (digits.length() != 10) {
            throw new IllegalArgumentException("사업자등록번호는 숫자 10자리여야 합니다. (예: 123-45-67890)");
        }
        return new HometaxLinkResponse(true, simulate(digits), NOTICE);
    }

    /** 사업자번호 시드 기반 결정적 mock 생성. */
    private HometaxFinancials simulate(String digits) {
        Random rnd = new Random(Long.parseLong(digits));

        // 월별 매출·비용 12개월: 같은 달의 손익을 함께 보관해 추세와 변동성을 계산한다.
        long base = round(15_000_000L + (long) (rnd.nextDouble() * 45_000_000L), 100_000);
        double trend = (rnd.nextDouble() - 0.5) * 0.04;           // 월 -2% ~ +2%
        YearMonth now = YearMonth.now();
        List<HometaxFinancials.MonthlyAmount> history = new ArrayList<>();
        List<HometaxFinancials.MonthlyFinancial> monthlyHistory = new ArrayList<>();
        long salesSum = 0;
        long purchaseSum = 0;
        long laborSum = 0;
        long rentSum = 0;
        long cardFeeSum = 0;
        long otherSum = 0;
        for (int i = 12; i >= 1; i--) {                           // 과거 → 최근
            double jitter = (rnd.nextDouble() - 0.5) * 0.2;       // ±10%
            long sales = round((long) (base * (1 + trend * (12 - i - 5.5) + jitter)), 100_000);
            sales = Math.max(sales, 1_000_000);
            long purchase = round((long) (sales * (0.40 + rnd.nextDouble() * 0.12)), 10_000);
            long labor = round((long) (sales * (0.13 + rnd.nextDouble() * 0.08)), 10_000);
            long rent = round((long) (base * (0.07 + rnd.nextDouble() * 0.02)), 10_000);
            long cardFee = round((long) (sales * (0.016 + rnd.nextDouble() * 0.006)), 1_000);
            long other = round((long) (sales * (0.03 + rnd.nextDouble() * 0.04)), 10_000);
            long total = purchase + labor + rent + cardFee + other;
            String month = now.minusMonths(i).toString();
            history.add(new HometaxFinancials.MonthlyAmount(month, sales));
            monthlyHistory.add(new HometaxFinancials.MonthlyFinancial(
                    month, sales, purchase, labor, rent, cardFee, other, total));
            salesSum += sales;
            purchaseSum += purchase;
            laborSum += labor;
            rentSum += rent;
            cardFeeSum += cardFee;
            otherSum += other;
        }
        int months = monthlyHistory.size();
        long salesAvg = round(salesSum / months, 10_000);
        long purchase = round(purchaseSum / months, 10_000);
        long labor = round(laborSum / months, 10_000);
        long rent = round(rentSum / months, 10_000);
        long cardFee = round(cardFeeSum / months, 1_000);
        long other = round(otherSum / months, 10_000);

        List<HometaxFinancials.TaxPayment> recentTaxes = List.of(
                new HometaxFinancials.TaxPayment(null, "부가가치세", now.minusMonths(6).atDay(25).toString(), round((long) (salesAvg * .11), 10_000)),
                new HometaxFinancials.TaxPayment(null, "종합소득세", now.minusMonths(2).atEndOfMonth().toString(), round((long) (salesAvg * .13), 10_000)));
        List<HometaxFinancials.TaxPayment> scheduledTaxes = List.of(
                new HometaxFinancials.TaxPayment(3, "부가가치세 예정고지", now.plusMonths(3).atDay(25).toString(), round((long) (salesAvg * .115), 10_000)),
                new HometaxFinancials.TaxPayment(6, "부가가치세 확정신고", now.plusMonths(6).atDay(25).toString(), round((long) (salesAvg * .12), 10_000)));

        String masked = digits.substring(0, 3) + "-" + digits.substring(3, 5) + "-*****";
        return new HometaxFinancials(masked, "최근 12개월", salesAvg, history, monthlyHistory,
                purchase, labor, rent, cardFee, other, purchase + labor + rent + cardFee + other,
                recentTaxes, scheduledTaxes, true);
    }

    private static long round(long v, long unit) {
        return Math.round((double) v / unit) * unit;
    }
}
