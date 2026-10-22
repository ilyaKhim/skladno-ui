package ru.godeck.auth.persistence;

import jakarta.persistence.LockModeType;

import org.springframework.data.jpa.repository.*;

import java.util.Optional;
import java.util.UUID;

public interface UserAccountRepository extends JpaRepository<UserAccount, UUID> {
    boolean existsByEmail(String email);

    boolean existsByIdAndCredentialsVersion(UUID id, int credentialsVersion);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select u from UserAccount u where u.email = :email")
    Optional<UserAccount> findByEmailForUpdate(String email);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select u from UserAccount u where u.resetTokenHash = :hash")
    Optional<UserAccount> findByResetTokenHashForUpdate(String hash);
}
