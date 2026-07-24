package com.nyang.txn.application.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * 거래 교정 요청(레이어⑥) — 확인 필요 거래를 사용자가 올바른 카테고리로 바로잡음.
 * merchant: 리포트 reviewQueue 의 상호 원문. category: taxonomy 카테고리 코드(RENT 등).
 */
public record TxnCorrectionRequest(
        @NotBlank String merchant,
        @NotBlank String category
) {}
