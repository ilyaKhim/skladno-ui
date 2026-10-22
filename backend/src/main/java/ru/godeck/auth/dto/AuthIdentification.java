package ru.godeck.auth.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import ru.godeck.auth.model.AuthStep;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record AuthIdentification(AuthStep step, VerificationChallenge challenge) {}
