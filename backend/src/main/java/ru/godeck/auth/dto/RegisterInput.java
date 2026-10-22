package ru.godeck.auth.dto;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import ru.godeck.auth.policy.AuthPolicy;

public record RegisterInput(
        @NotBlank @Email @Size(max = AuthPolicy.EMAIL_MAX_LENGTH) String email,
        @NotBlank @Size(min = AuthPolicy.PASSWORD_MIN_LENGTH, max = AuthPolicy.PASSWORD_MAX_BYTES)
                String password,
        @AssertTrue boolean consentAccepted) {}
