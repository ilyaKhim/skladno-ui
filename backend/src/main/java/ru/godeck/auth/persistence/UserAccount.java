package ru.godeck.auth.persistence;

import jakarta.persistence.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "app_users")
public class UserAccount {
    @Id private UUID id;

    @Column(nullable = false, unique = true, length = 254)
    private String email;

    @Column(name = "password_hash", nullable = false, length = 100)
    private String passwordHash;

    @Column(name = "consent_at", nullable = false)
    private Instant consentAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "credentials_version", nullable = false)
    private int credentialsVersion;

    @Column(name = "failed_logins", nullable = false)
    private int failedLogins;

    @Column(name = "locked_until")
    private Instant lockedUntil;

    @Column(name = "reset_token_hash", length = 64)
    private String resetTokenHash;

    @Column(name = "reset_expires_at")
    private Instant resetExpiresAt;

    @Column(name = "reset_sent_at")
    private Instant resetSentAt;

    protected UserAccount() {}

    public UserAccount(
            UUID id, String email, String passwordHash, Instant consentAt, Instant createdAt) {
        this.id = id;
        this.email = email;
        this.passwordHash = passwordHash;
        this.consentAt = consentAt;
        this.createdAt = createdAt;
    }

    public void recordFailedLogin(int attempts, Instant lockedUntil) {
        this.failedLogins = attempts;
        this.lockedUntil = lockedUntil;
    }

    public void clearFailedLogins() {
        failedLogins = 0;
        lockedUntil = null;
    }

    public void requestReset(String tokenHash, Instant expiresAt, Instant sentAt) {
        resetTokenHash = tokenHash;
        resetExpiresAt = expiresAt;
        resetSentAt = sentAt;
    }

    public void resetPassword(String hash) {
        passwordHash = hash;
        credentialsVersion++;
        resetTokenHash = null;
        resetExpiresAt = null;
        clearFailedLogins();
    }

    public UUID getId() {
        return id;
    }

    public String getEmail() {
        return email;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public int getCredentialsVersion() {
        return credentialsVersion;
    }

    public int getFailedLogins() {
        return failedLogins;
    }

    public Instant getLockedUntil() {
        return lockedUntil;
    }

    public Instant getResetExpiresAt() {
        return resetExpiresAt;
    }

    public Instant getResetSentAt() {
        return resetSentAt;
    }
}
