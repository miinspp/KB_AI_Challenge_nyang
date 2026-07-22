package com.nyang.hometax.domain;

import java.util.List;

/**
 * 홈택스에서 조회한(현재는 시뮬레이션) 사업장 재무 요약.
 * 수동 입력 경로와 같은 지표 스키마로 합류하는 지점이며,
 * 이후 산출식 v2(원가율·인건비비율·임대료부담률·매출추세)가 이 필드들을 사용한다.
 *
 * 실제 연동 시 매핑:
 *  - salesHistory      ← 신용카드·현금영수증 월별 매출 + 전자세금계산서 발행분
 *  - purchaseCost      ← 매입 전자세금계산서·카드 매입 (원가율 근사)
 *  - laborCost         ← 원천세 신고(지급명세서) 인건비
 *  - rent              ← 임대인 발행 매입 세금계산서 중 임대료
 * 홈택스로 확보 불가: 매장 면적, 부채·원리금(마이데이터 영역), 실시간 현금흐름.
 */
public record HometaxFinancials(
        String maskedBusinessNumber,   // 예: 123-45-*****
        String basisPeriod,            // 예: "최근 6개월"
        long monthlySalesAvg,          // 월평균 매출 (원) = salesHistory 평균
        List<MonthlyAmount> salesHistory,  // 최근 6개월 월별 매출 (과거→최근 순)
        long purchaseCost,             // 월평균 매입(재료비 등, 원)
        long laborCost,                // 월평균 인건비 (원)
        long rent,                     // 월평균 임대료 (원)
        long otherExpense,             // 월평균 기타 지출 (원)
        long totalMonthlyExpense,      // 위 4개 항목 합계 (원)
        boolean simulated              // true = 챌린지 데모용 시뮬레이션 데이터
) {
    public record MonthlyAmount(String month, long amount) {}  // month: "YYYY-MM"
}
