package com.nyang.global.exception;

/** 공통 에러 응답. 프론트엔드는 message 필드를 사용자에게 노출한다. */
public record ErrorResponse(int status, String error, String message) {}
