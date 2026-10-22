package ru.godeck.presentation;

import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestControllerAdvice(assignableTypes = GenerationController.class)
class GenerationExceptionHandler {
    @ExceptionHandler(GenerationException.class)
    ResponseEntity<Map<String, Object>> generation(GenerationException error) {
        return response(error.status(), error.code(), error.getMessage());
    }

    @ExceptionHandler({
        MethodArgumentNotValidException.class,
        HttpMessageNotReadableException.class
    })
    ResponseEntity<Map<String, Object>> invalid(Exception error) {
        return response(422, "invalid_input", "Проверьте поля запроса.");
    }

    private ResponseEntity<Map<String, Object>> response(int status, String code, String message) {
        return ResponseEntity.status(status)
                .body(Map.of("error", Map.of("code", code, "message", message)));
    }
}
