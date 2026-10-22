package ru.godeck.auth.persistence;

import jakarta.persistence.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "email_verifications")
public class EmailVerification {
    @Id
    @Column(length = 254)
    private String email;

    @Column(name = "challenge_id", nullable = false, unique = true)
    private UUID challengeId;

    @Column(name = "password_hash", nullable = false, length = 100)
    private String passwordHash;

    @Column(name = "code_hash", nullable = false, length = 100)
    private String codeHash;

    @Column(name = "consent_at", nullable = false)
    private Instant consentAt;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "sent_at", nullable = false)
    private Instant sentAt;

    @Column(nullable = false)
    private int attempts;

    protected EmailVerification() {}

    public void recordFailedAttempt() {
        attempts++;
    }

    public void resend(String hash, Instant expiresAt, Instant sentAt) {
        codeHash = hash;
        this.expiresAt = expiresAt;
        this.sentAt = sentAt;
        attempts = 0;
    }

    public String getEmail() {
        return email;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public String getCodeHash() {
        return codeHash;
    }

    public Instant getConsentAt() {
        return consentAt;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }

    public Instant getSentAt() {
        return sentAt;
    }

    public int getAttempts() {
        return attempts;
    }
}
