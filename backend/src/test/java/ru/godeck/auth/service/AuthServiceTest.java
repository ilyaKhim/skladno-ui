package ru.godeck.auth.service;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import org.hibernate.exception.ConstraintViolationException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.mail.MailSendException;
import org.springframework.security.crypto.password.PasswordEncoder;

import ru.godeck.auth.entity.*;
import ru.godeck.auth.exception.*;
import ru.godeck.auth.config.AuthSettings;
import ru.godeck.support.TestSettings;
import ru.godeck.auth.repository.*;

import java.sql.SQLException;
import java.time.*;
import java.util.*;

class AuthServiceTest {
    private static final Instant NOW = Instant.parse("2026-10-22T12:00:00Z");
    private static final String EMAIL = "person@example.test";
    private final RegistrationService registrations = mock(RegistrationService.class);
    private final UserAccountRepository users = mock(UserAccountRepository.class);
    private final EmailVerificationRepository verifications =
            mock(EmailVerificationRepository.class);
    private final PasswordEncoder passwords = mock(PasswordEncoder.class);
    private final AuthMailService mail = mock(AuthMailService.class);
    private AuthService service;
    private final AuthSettings settings = TestSettings.defaults(AuthSettings.class);

    @BeforeEach
    void setUp() {
        when(passwords.encode(anyString())).thenReturn("dummy-hash");
        service =
                new AuthService(
                        registrations,
                        users,
                        verifications,
                        passwords,
                        mail,
                        Clock.fixed(NOW, ZoneOffset.UTC),
                        settings);
    }

    @Test
    void retriesOnlyTheConcurrentRegistrationEmailConstraint() {
        var duplicate = duplicate(EmailVerification.EMAIL_PRIMARY_KEY);
        UUID challenge = UUID.randomUUID();
        when(registrations.register(EMAIL, "valid-password"))
                .thenThrow(duplicate)
                .thenReturn(challenge);
        assertThat(service.register(" PERSON@EXAMPLE.TEST ", "valid-password"))
                .isEqualTo(challenge);
        verify(registrations, times(2)).register(EMAIL, "valid-password");
    }

    @Test
    void unrelatedDatabaseFailureIsPropagatedWithoutRetry() {
        var unrelated = duplicate("another_constraint");
        when(registrations.register(EMAIL, "valid-password")).thenThrow(unrelated);
        assertThatThrownBy(() -> service.register(EMAIL, "valid-password")).isSameAs(unrelated);
        verify(registrations).register(EMAIL, "valid-password");
    }

    @Test
    void failedMailIsNotRetriedAsARegistrationCollision() {
        var failure = new MailSendException("unavailable");
        when(registrations.register(EMAIL, "valid-password")).thenThrow(failure);
        assertThatThrownBy(() -> service.register(EMAIL, "valid-password")).isSameAs(failure);
        verify(registrations).register(EMAIL, "valid-password");
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "1234567", "я", "😀"})
    void shortPasswordsAreRejectedBeforeRegistration(String password) {
        assertThatThrownBy(() -> service.register(EMAIL, password))
                .isInstanceOf(AuthException.class)
                .extracting(e -> ((AuthException) e).code())
                .isEqualTo("invalid-input");
        verifyNoInteractions(registrations);
    }

    @Test
    void bcryptLimitCountsUtf8BytesRatherThanJavaCharacters() {
        service.register(EMAIL, "я".repeat(36));
        verify(registrations).register(EMAIL, "я".repeat(36));
        assertThatThrownBy(() -> service.register(EMAIL, "я".repeat(37)))
                .isInstanceOf(AuthException.class);
        assertThatThrownBy(() -> service.signIn(EMAIL, "я".repeat(37)))
                .isInstanceOf(AuthException.class)
                .extracting(e -> ((AuthException) e).code())
                .isEqualTo("invalid-credentials");
        verifyNoInteractions(users);
    }

    @Test
    void unknownEmailStillPerformsPasswordComparison() {
        when(users.findByEmailForUpdate(EMAIL)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.signIn(EMAIL, "wrong-password"))
                .isInstanceOf(AuthException.class);
        verify(passwords).matches("wrong-password", "dummy-hash");
    }

    @Test
    void successfulSignInAtLockExpiryClearsFailedAttempts() {
        UserAccount user = new UserAccount(UUID.randomUUID(), EMAIL, "stored", NOW, NOW);
        user.recordFailedLogin(5, NOW);
        when(users.findByEmailForUpdate(EMAIL)).thenReturn(Optional.of(user));
        when(passwords.matches("correct-password", "stored")).thenReturn(true);
        assertThat(service.signIn(EMAIL, "correct-password").id()).isEqualTo(user.getId());
        assertThat(user.getFailedLogins()).isZero();
        assertThat(user.getLockedUntil()).isNull();
    }

    @Test
    void verificationIsExpiredAtTheExactDeadline() {
        var pending = new EmailVerification(EMAIL);
        UUID challenge = UUID.randomUUID();
        pending.startRegistration(
                challenge, "password-hash", "code-hash", NOW.minus(settings.codeTtl()), NOW);
        when(verifications.findByEmail(EMAIL)).thenReturn(Optional.of(pending));
        assertThatThrownBy(() -> service.verify(EMAIL, "123456", challenge))
                .isInstanceOf(AuthException.class)
                .extracting(e -> ((AuthException) e).code())
                .isEqualTo("expired-code");
        verify(passwords, never()).matches(anyString(), anyString());
        verifyNoInteractions(users);
    }

    @Test
    void configuredAttemptThresholdAndLockDurationAreApplied() {
        useCustomSettings();
        var user = new UserAccount(UUID.randomUUID(), EMAIL, "stored", NOW, NOW);
        when(users.findByEmailForUpdate(EMAIL)).thenReturn(Optional.of(user));
        assertThatThrownBy(() -> service.signIn(EMAIL, "wrong-password"))
                .isInstanceOf(AuthException.class);
        assertThat(user.getLockedUntil()).isNull();
        assertThatThrownBy(() -> service.signIn(EMAIL, "wrong-password"))
                .isInstanceOf(AuthException.class);
        assertThat(user.getFailedLogins()).isEqualTo(2);
        assertThat(user.getLockedUntil()).isEqualTo(NOW.plusSeconds(30));
        assertThatThrownBy(() -> service.signIn(EMAIL, "wrong-password"))
                .isInstanceOfSatisfying(AuthException.class,
                        error -> assertThat(error.code()).isEqualTo("rate-limited"));
    }

    @Test
    void configuredResendCooldownAndVerificationDeadlineUseTheSameSettings() {
        useCustomSettings();
        UUID challenge = UUID.randomUUID();
        var pending = new EmailVerification(EMAIL);
        pending.startRegistration(challenge, "password-hash", "code-hash", NOW, NOW.plusSeconds(180));
        when(verifications.findByEmailAndChallengeId(EMAIL, challenge)).thenReturn(Optional.of(pending));
        when(verifications.findByEmail(EMAIL)).thenReturn(Optional.of(pending));
        assertThat(service.identify(EMAIL, challenge).challenge().resendAfterSeconds()).isEqualTo(90);
        assertThatThrownBy(() -> service.resend(EMAIL, challenge)).isInstanceOf(AuthException.class);
        pending.startRegistration(challenge, "password-hash", "code-hash", NOW.minusSeconds(91), NOW);
        service.resend(EMAIL, challenge);
        assertThat(pending.getExpiresAt()).isEqualTo(NOW.plusSeconds(180));
        verify(mail).sendCode(eq(EMAIL), anyString());
    }

    @Test
    void configuredPasswordResetDeadlineIsStoredOnTheAccount() {
        useCustomSettings();
        var user = new UserAccount(UUID.randomUUID(), EMAIL, "stored", NOW, NOW);
        when(users.findByEmailForUpdate(EMAIL)).thenReturn(Optional.of(user));
        service.requestReset(EMAIL);
        assertThat(user.getResetExpiresAt()).isEqualTo(NOW.plus(Duration.ofMinutes(7)));
        verify(mail).sendReset(eq(EMAIL), anyString());
    }

    private void useCustomSettings() {
        var custom = new AuthSettings(Duration.ofMinutes(3), Duration.ofMinutes(7),
                Duration.ofSeconds(30), Duration.ofSeconds(90), 2, settings.ip());
        service = new AuthService(registrations, users, verifications, passwords, mail,
                Clock.fixed(NOW, ZoneOffset.UTC), custom);
    }

    private DataIntegrityViolationException duplicate(String constraint) {
        return new DataIntegrityViolationException(
                "duplicate",
                new ConstraintViolationException(
                        "duplicate", new SQLException("duplicate", "23505"), constraint));
    }
}
