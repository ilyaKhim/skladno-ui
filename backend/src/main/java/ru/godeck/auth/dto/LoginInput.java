package ru.godeck.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import ru.godeck.auth.policy.AuthPolicy;

public record LoginInput(
        @NotBlank @Email @Size(max = AuthPolicy.EMAIL_MAX_LENGTH) String email,
        @NotBlank @Size(max = AuthPolicy.PASSWORD_MAX_BYTES) String password) {}
