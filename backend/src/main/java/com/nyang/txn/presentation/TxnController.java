package com.nyang.txn.presentation;

import com.nyang.txn.application.TxnService;
import com.nyang.txn.domain.TxnReport;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

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
}
