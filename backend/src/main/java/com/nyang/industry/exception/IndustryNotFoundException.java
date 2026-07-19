package com.nyang.industry.exception;

/** 존재하지 않는 업종 코드로 조회할 때 발생. */
public class IndustryNotFoundException extends RuntimeException {
    public IndustryNotFoundException(String code) {
        super("업종 코드를 찾을 수 없습니다: " + code);
    }
}
