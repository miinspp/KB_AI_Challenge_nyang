package com.nyang.txn.application;

import com.nyang.txn.domain.TxnReport;
import com.nyang.txn.repository.TxnCorrectionStore;
import com.nyang.txn.repository.TxnReportRepository;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

/**
 * 거래 분류 리포트 조회 + 사용자 교정(레이어⑥).
 *
 * 현재는 파이프라인이 사전계산한 mock 리포트를 전달하되, 사용자가 교정한 상호는
 * 확인필요 큐에서 즉시 제거해 "확인 → 해결"을 화면에 반영한다. 카테고리 합계 재집계는
 * 파이프라인 재생성(report.py, 교정 로그 반영) 시 반영된다.
 * 실데이터 연동 시엔 사용자별 거래를 받아 분류·집계하는 경로가 여기에 들어온다.
 */
@Service
public class TxnService {

    private final TxnReportRepository repository;
    private final TxnCorrectionStore corrections;

    public TxnService(TxnReportRepository repository, TxnCorrectionStore corrections) {
        this.repository = repository;
        this.corrections = corrections;
    }

    /** 전체 리포트. 이미 교정한 상호는 확인필요 큐에서 제외한다. */
    public TxnReport report() {
        TxnReport base = repository.report();
        Map<String, String> fixed = corrections.all();
        if (fixed.isEmpty()) return base;

        List<TxnReport.ReviewItem> pending = base.reviewQueue().stream()
                .filter(r -> !fixed.containsKey(r.merchant()))
                .toList();
        return new TxnReport(base.meta(), base.months(), pending, base.suggestions());
    }

    /** 사용자 교정 저장 → 다음 분류부터 재사용. 남은 확인필요 건수를 돌려준다. */
    public int correct(String merchant, String category) {
        corrections.save(merchant, category);
        return report().reviewQueue().size();
    }
}
