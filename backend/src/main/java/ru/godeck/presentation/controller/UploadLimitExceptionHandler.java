package ru.godeck.presentation.controller;

import jakarta.servlet.http.HttpServletRequest;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

import ru.godeck.presentation.exception.GenerationError;

import java.util.Map;

/** Multipart size resolution can fail before a controller is selected, so this advice is global. */
@RestControllerAdvice
public class UploadLimitExceptionHandler {
    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<Map<String, Object>> tooLarge(
            MaxUploadSizeExceededException failure, HttpServletRequest request) {
        GenerationError error =
                request.getRequestURI().startsWith("/api/generation/v1/materials/")
                        ? GenerationError.SOURCE_LIMIT
                        : GenerationError.IMAGE_LIMIT;
        return ResponseEntity.status(error.status())
                .cacheControl(CacheControl.noStore())
                .body(Map.of("error", Map.of("code", error.code(), "message", error.message())));
    }
}
