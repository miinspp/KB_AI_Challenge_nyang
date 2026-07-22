package com.nyang.hometax.application.dto;

import com.nyang.hometax.domain.HometaxFinancials;

/** 홈택스 연동 결과. notice 는 데이터 성격(시뮬레이션 여부·실서비스 방식) 안내 문구. */
public record HometaxLinkResponse(
        boolean consented,
        HometaxFinancials financials,
        String notice
) {}
