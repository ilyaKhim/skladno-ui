package ru.godeck.presentation.controller;

import org.springframework.dao.PessimisticLockingFailureException;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

import ru.godeck.presentation.exception.GenerationError;
import ru.godeck.presentation.exception.GenerationException;

import java.util.Map;

@RestControllerAdvice(assignableTypes = {GenerationController.class, PresentationEditorController.class})
public class GenerationExceptionHandler {
    @ExceptionHandler(GenerationException.class)
    public ResponseEntity<Map<String, Object>> generation(GenerationException error) {
        return response(error.status(), error.code(), error.getMessage());
    }

    @ExceptionHandler({
        MethodArgumentNotValidException.class,
        HttpMessageNotReadableException.class,
        MethodArgumentTypeMismatchException.class
    })
    public ResponseEntity<Map<String, Object>> invalid(Exception error) {
        GenerationError invalid = GenerationError.INVALID_INPUT;
        return response(invalid.status().value(), invalid.code(), invalid.message());
    }

    @ExceptionHandler(PessimisticLockingFailureException.class)
    public ResponseEntity<Map<String, Object>> busy(PessimisticLockingFailureException error) {
        GenerationError busy = GenerationError.PRESENTATION_BUSY;
        return response(busy.status().value(), busy.code(), busy.message());
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<Map<String, Object>> imageTooLarge(
            MaxUploadSizeExceededException error) {
        GenerationError limit = GenerationError.IMAGE_LIMIT;
        return response(limit.status().value(), limit.code(), limit.message());
    }

    private ResponseEntity<Map<String, Object>> response(int status, String code, String message) {
        return ResponseEntity.status(status)
                .body(Map.of("error", Map.of("code", code, "message", message)));
    }
}
