package ru.godeck.auth.repository;

import jakarta.persistence.LockModeType;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;

import ru.godeck.auth.entity.EmailVerification;

import java.util.Optional;
import java.util.UUID;

public interface EmailVerificationRepository extends JpaRepository<EmailVerification, String> {
    Optional<EmailVerification> findByEmailAndChallengeId(String email, UUID challengeId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<EmailVerification> findByEmail(String email);
}
