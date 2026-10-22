package ru.godeck.auth.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PostLoad;
import jakarta.persistence.PostPersist;
import jakarta.persistence.Table;
import jakarta.persistence.Transient;

import ru.godeck.auth.policy.AuthPolicy;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "email_verifications")
public class EmailVerification implements org.springframework.data.domain.Persistable<String> {
    public static final String EMAIL_PRIMARY_KEY = "email_verifications_pkey";
    @Transient private boolean newRecord = true;

    @Id
    @Column(length = AuthPolicy.EMAIL_MAX_LENGTH)
    private String email;

    @Column(name = "challenge_id", nullable = false, unique = true)
    private UUID challengeId;

    @Column(name = "password_hash", nullable = false, length = AuthPolicy.PASSWORD_HASH_MAX_LENGTH)
    private String passwordHash;

    @Column(name = "code_hash", nullable = false, length = AuthPolicy.PASSWORD_HASH_MAX_LENGTH)
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

    public EmailVerification(String email) {
        this.email = email;
    }

    @Override
    public String getId() {
        return email;
    }

    @Override
    public boolean isNew() {
        return newRecord;
    }

    @PostLoad
    @PostPersist
    private void markPersisted() {
        newRecord = false;
    }

    public void startRegistration(
            UUID challengeId,
            String passwordHash,
            String codeHash,
            Instant now,
            Instant expiresAt) {
        this.challengeId = challengeId;
        this.passwordHash = passwordHash;
        this.codeHash = codeHash;
        this.consentAt = now;
        this.sentAt = now;
        this.expiresAt = expiresAt;
        this.attempts = 0;
    }

    public UUID getChallengeId() {
        return challengeId;
    }

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
