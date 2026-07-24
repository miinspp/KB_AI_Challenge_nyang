package com.nyang.txn.repository;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.nyang.txn.domain.TxnReport;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Repository;

import java.io.InputStream;

/**
 * 파이프라인 산출물(txn/monthly_report.json)을 로드해 보관한다.
 * 구조가 곧 API 응답 계약이라 도메인 레코드로 그대로 역직렬화한다.
 */
@Repository
public class TxnReportRepository {
    private static final Logger log = LoggerFactory.getLogger(TxnReportRepository.class);
    private final ObjectMapper mapper = new ObjectMapper()
            .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);

    private volatile TxnReport report;

    @PostConstruct
    public void load() {
        try (InputStream in = new ClassPathResource("data/txn/monthly_report.json").getInputStream()) {
            this.report = mapper.readValue(in, TxnReport.class);
            log.info("거래 리포트 로드 완료 (거래 {}건, {}개월, 확인필요 {}건)",
                    report.meta().txnCount(), report.months().size(), report.reviewQueue().size());
        } catch (Exception e) {
            throw new IllegalStateException("거래 리포트 로드 실패", e);
        }
    }

    public TxnReport report() {
        return report;
    }
}
