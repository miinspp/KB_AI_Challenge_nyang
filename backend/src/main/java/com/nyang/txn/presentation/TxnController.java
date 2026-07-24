package com.nyang.txn.presentation;

import com.nyang.txn.application.TxnService;
import com.nyang.txn.application.dto.TxnCorrectionRequest;
import com.nyang.txn.domain.TxnReport;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/txn")
public class TxnController {

    private final TxnService txnService;

    public TxnController(TxnService txnService) {
        this.txnService = txnService;
    }

    /** 거래 분류 리포트 — 월별 손익·현금흐름, 확인필요 거래, 개선 제안 */
    @GetMapping("/report")
    public TxnReport report() {
        return txnService.report();
    }

    /** 확인필요 거래 교정(레이어⑥) — 상호를 올바른 카테고리로 저장. 남은 확인필요 건수 반환 */
    @PostMapping("/correction")
    public Map<String, Object> correct(@Valid @RequestBody TxnCorrectionRequest req) {
        int remaining = txnService.correct(req.merchant(), req.category());
        return Map.of("ok", true, "remaining", remaining);
    }
}
