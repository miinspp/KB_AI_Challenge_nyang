package com.nyang.txn.application;

import com.nyang.txn.domain.TxnReport;
import com.nyang.txn.repository.TxnReportRepository;
import org.springframework.stereotype.Service;

/**
 * 거래 분류 리포트 조회.
 *
 * 현재는 파이프라인이 사전계산한 mock 리포트를 그대로 전달한다. 실데이터 연동 시엔
 * 사용자별 거래를 받아 분류·집계하는 경로가 여기에 들어온다(레이어①~⑦ 호출).
 */
@Service
public class TxnService {

    private final TxnReportRepository repository;

    public TxnService(TxnReportRepository repository) {
        this.repository = repository;
    }

    /** 전체 리포트(월별 요약 + 확인필요 + 개선제안). */
    public TxnReport report() {
        return repository.report();
    }
}
