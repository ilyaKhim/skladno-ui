package ru.godeck;

import java.util.LinkedHashMap;
import java.util.Map;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.mail.MailException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
class AuthExceptionHandler {
    @ExceptionHandler(AuthException.class)
    ResponseEntity<Map<String, Object>> auth(AuthException error) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ok", false);
        body.put("error", error.code);
        var response = ResponseEntity.status(error.status);
        if (error.retryAfterSeconds != null) {
            body.put("retryAfterSeconds", error.retryAfterSeconds);
            response.header("Retry-After", error.retryAfterSeconds.toString());
        }
        return response.body(body);
    }

    @ExceptionHandler({MethodArgumentNotValidException.class, HttpMessageNotReadableException.class,
            DataIntegrityViolationException.class})
    ResponseEntity<Map<String, Object>> invalid(Exception error) {
        return ResponseEntity.badRequest().body(Map.of("ok", false, "error", "invalid-input"));
    }

    @ExceptionHandler(MailException.class)
    ResponseEntity<Map<String, Object>> mail(MailException error, HttpServletRequest request) {
        // Recovery responses must not reveal which addresses have an account, even when SMTP fails.
        if (request.getRequestURI().endsWith("/request-password-reset")) {
            return ResponseEntity.ok(AuthController.ok(Map.of()));
        }
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(Map.of("ok", false, "error", "send-failed"));
    }
}
