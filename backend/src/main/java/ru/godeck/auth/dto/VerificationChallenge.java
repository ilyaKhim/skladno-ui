package ru.godeck.auth.dto;

import ru.godeck.auth.policy.AuthPolicy;

public record VerificationChallenge(int codeLength, int resendAfterSeconds) {
    public static VerificationChallenge after(int seconds) {
        return new VerificationChallenge(AuthPolicy.VERIFICATION_CODE_LENGTH, seconds);
    }
}
