package ru.godeck.presentation.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import ru.godeck.presentation.exception.GenerationError;
import ru.godeck.presentation.exception.GenerationException;

import java.util.Map;

@RestControllerAdvice(assignableTypes = GenerationController.class)
public class GenerationExceptionHandler {
    @ExceptionHandler(GenerationException.class)
    public ResponseEntity<Map<String, Object>> generation(GenerationException error) {
        return response(error.status(), error.code(), error.getMessage());
    }

    @ExceptionHandler({
        MethodArgumentNotValidException.class,
        HttpMessageNotReadableException.class
    })
    public ResponseEntity<Map<String, Object>> invalid(Exception error) {
        GenerationError invalid = GenerationError.INVALID_INPUT;
        return response(invalid.status().value(), invalid.code(), invalid.message());
    }

    private ResponseEntity<Map<String, Object>> response(int status, String code, String message) {
        return ResponseEntity.status(status)
                .body(Map.of("error", Map.of("code", code, "message", message)));
    }
}
