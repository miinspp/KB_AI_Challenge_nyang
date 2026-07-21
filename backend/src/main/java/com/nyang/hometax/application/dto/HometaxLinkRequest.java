package com.nyang.hometax.application.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * 홈택스 연동 요청. consent 가 true 여야만 조회를 수행한다(동의 우선 원칙).
 * businessNumber 는 하이픈 유무 무관 10자리 사업자등록번호.
 */
public record HometaxLinkRequest(
        @NotBlank String businessNumber,
        boolean consent
) {}
