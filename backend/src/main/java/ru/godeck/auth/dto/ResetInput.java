package ru.godeck.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import ru.godeck.auth.policy.AuthPolicy;

public record ResetInput(
        @NotBlank @Pattern(regexp = AuthPolicy.RESET_TOKEN_PATTERN) String token,
        @NotBlank @Size(min = AuthPolicy.PASSWORD_MIN_LENGTH, max = AuthPolicy.PASSWORD_MAX_BYTES)
                String password) {}
