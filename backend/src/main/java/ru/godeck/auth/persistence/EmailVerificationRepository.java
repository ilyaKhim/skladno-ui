package ru.godeck.auth.persistence;

import jakarta.persistence.LockModeType;

import org.springframework.data.jpa.repository.*;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public interface EmailVerificationRepository extends JpaRepository<EmailVerification, String> {
    Optional<EmailVerification> findByEmailAndChallengeId(String email, UUID challengeId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query(
            "select v from EmailVerification v where v.email = :email and v.challengeId ="
                + " :challengeId")
    Optional<EmailVerification> findForUpdate(String email, UUID challengeId);

    // PostgreSQL's conditional upsert enforces cooldown even when two registration requests race.
    @Modifying
    @Query(
            value =
                    """
                    INSERT INTO email_verifications
                        (email,challenge_id,password_hash,code_hash,consent_at,expires_at,sent_at,attempts)
                    VALUES (:email,:challengeId,:passwordHash,:codeHash,:now,:expiresAt,:now,0)
                    ON CONFLICT (email) DO UPDATE SET challenge_id=EXCLUDED.challenge_id,
                        password_hash=EXCLUDED.password_hash,code_hash=EXCLUDED.code_hash,
                        consent_at=EXCLUDED.consent_at,expires_at=EXCLUDED.expires_at,
                        sent_at=EXCLUDED.sent_at,attempts=0
                    WHERE email_verifications.sent_at <= :cooldownBefore
                    """,
            nativeQuery = true)
    int upsertRegistration(
            String email,
            UUID challengeId,
            String passwordHash,
            String codeHash,
            Instant now,
            Instant expiresAt,
            Instant cooldownBefore);
}
