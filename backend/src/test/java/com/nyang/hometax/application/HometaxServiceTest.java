package com.nyang.hometax.application;

import com.nyang.hometax.application.dto.HometaxLinkResponse;
import com.nyang.hometax.domain.HometaxFinancials;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class HometaxServiceTest {

    private final HometaxService svc = new HometaxService();

    @Test
    void consent_required() {
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> svc.link("123-45-67890", false));
        assertTrue(e.getMessage().contains("동의"));
    }

    @Test
    void business_number_must_be_10_digits() {
        assertThrows(IllegalArgumentException.class, () -> svc.link("123-45", true));
        assertThrows(IllegalArgumentException.class, () -> svc.link("", true));
        assertDoesNotThrow(() -> svc.link("1234567890", true));      // 하이픈 없어도 허용
        assertDoesNotThrow(() -> svc.link("123-45-67890", true));
    }

    @Test
    void deterministic_for_same_business_number() {
        HometaxFinancials a = svc.link("123-45-67890", true).financials();
        HometaxFinancials b = svc.link("1234567890", true).financials();
        assertEquals(a.monthlySalesAvg(), b.monthlySalesAvg());
        assertEquals(a.totalMonthlyExpense(), b.totalMonthlyExpense());
        assertEquals(a.salesHistory(), b.salesHistory());
    }

    @Test
    void financials_are_coherent() {
        HometaxLinkResponse res = svc.link("512-81-00998", true);
        HometaxFinancials f = res.financials();
        assertTrue(res.consented());
        assertTrue(f.simulated());
        assertEquals("512-81-*****", f.maskedBusinessNumber());
        assertEquals(6, f.salesHistory().size());
        assertTrue(f.monthlySalesAvg() > 0);
        assertEquals(f.purchaseCost() + f.laborCost() + f.rent() + f.otherExpense(),
                f.totalMonthlyExpense());
        // 월평균 매출 = 월별 이력 평균 (반올림 오차 이내)
        double histAvg = f.salesHistory().stream().mapToLong(HometaxFinancials.MonthlyAmount::amount).average().orElse(0);
        assertEquals(histAvg, f.monthlySalesAvg(), 10_000.0);
        assertTrue(res.notice().contains("시뮬레이션"));
    }
}
