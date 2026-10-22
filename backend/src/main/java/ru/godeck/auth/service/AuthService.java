package ru.godeck.auth.service;

import org.hibernate.exception.ConstraintViolationException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import ru.godeck.auth.dto.AuthIdentification;
import ru.godeck.auth.dto.VerificationChallenge;
import ru.godeck.auth.entity.EmailVerification;
import ru.godeck.auth.entity.UserAccount;
import ru.godeck.auth.exception.AuthError;
import ru.godeck.auth.exception.AuthException;
import ru.godeck.auth.model.AuthStep;
import ru.godeck.auth.policy.AuthPolicy;
import ru.godeck.auth.repository.EmailVerificationRepository;
import ru.godeck.auth.repository.UserAccountRepository;
import ru.godeck.auth.security.AuthPrincipal;
import ru.godeck.common.security.Hashing;

import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Locale;
import java.util.UUID;

@Service
@Transactional(noRollbackFor = AuthException.class)
public class AuthService {
    private final RegistrationService registrations;
    private final UserAccountRepository users;
    private final EmailVerificationRepository verifications;
    private final PasswordEncoder passwords;
    private final AuthMailService mail;
    private final Clock clock;
    private final SecureRandom random = new SecureRandom();
    private final String dummyHash;

    public AuthService(
            RegistrationService registrations,
            UserAccountRepository users,
            EmailVerificationRepository verifications,
            PasswordEncoder passwords,
            AuthMailService mail,
            Clock clock) {
        this.registrations = registrations;
        this.users = users;
        this.verifications = verifications;
        this.passwords = passwords;
        this.mail = mail;
        this.clock = clock;
        this.dummyHash = passwords.encode(UUID.randomUUID().toString());
    }

    private static String normalize(String email) {
        return email.strip().toLowerCase(Locale.ROOT);
    }

    @Transactional(readOnly = true)
    public AuthIdentification identify(String rawEmail, UUID challengeId) {
        String email = normalize(rawEmail);
        if (users.existsByEmail(email)) return new AuthIdentification(AuthStep.PASSWORD, null);
        return verifications
                .findByEmailAndChallengeId(email, challengeId)
                .map(
                        p ->
                                new AuthIdentification(
                                        AuthStep.VERIFY,
                                        VerificationChallenge.after(remaining(p.getSentAt()))))
                .orElseGet(() -> new AuthIdentification(AuthStep.CREATE_PASSWORD, null));
    }

    // Each attempt owns a separate transaction: a uniqueness failure must roll back before retry.
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public UUID register(String rawEmail, String password) {
        String email = normalize(rawEmail);
        checkPassword(password);
        try {
            return registrations.register(email, password);
        } catch (DataIntegrityViolationException collision) {
            if (!isConcurrentRegistration(collision)) throw collision;
            // The failed transaction has rolled back. Read the winning row in a fresh transaction.
            return registrations.register(email, password);
        }
    }

    private static boolean isConcurrentRegistration(Throwable error) {
        for (Throwable cause = error; cause != null; cause = cause.getCause()) {
            if (cause instanceof ConstraintViolationException violation) {
                return EmailVerification.EMAIL_PRIMARY_KEY.equals(violation.getConstraintName());
            }
        }
        return false;
    }

    public AuthPrincipal verify(String rawEmail, String code, UUID challengeId) {
        EmailVerification pending = pending(normalize(rawEmail), challengeId);
        if (pending.getAttempts() >= AuthPolicy.MAX_FAILED_ATTEMPTS)
            throw new AuthException(AuthError.TOO_MANY_ATTEMPTS);
        if (!pending.getExpiresAt().isAfter(clock.instant()))
            throw new AuthException(AuthError.EXPIRED_CODE);
        if (!passwords.matches(code, pending.getCodeHash())) {
            pending.recordFailedAttempt();
            boolean locked = pending.getAttempts() >= AuthPolicy.MAX_FAILED_ATTEMPTS;
            // AuthException deliberately commits counters; SMTP/DB failures still roll back.
            throw new AuthException(locked ? AuthError.TOO_MANY_ATTEMPTS : AuthError.INVALID_CODE);
        }
        UserAccount user =
                users.saveAndFlush(
                        new UserAccount(
                                UUID.randomUUID(),
                                pending.getEmail(),
                                pending.getPasswordHash(),
                                pending.getConsentAt(),
                                clock.instant()));
        verifications.delete(pending);
        return principal(user);
    }

    public void resend(String rawEmail, UUID challengeId) {
        EmailVerification pending = pending(normalize(rawEmail), challengeId);
        int remaining = remaining(pending.getSentAt());
        if (remaining > 0) throw new AuthException(AuthError.RATE_LIMITED, remaining);
        String code =
                String.format(
                        Locale.ROOT,
                        AuthPolicy.VERIFICATION_CODE_FORMAT,
                        random.nextInt(AuthPolicy.VERIFICATION_CODE_BOUND));
        Instant now = clock.instant();
        pending.resend(passwords.encode(code), now.plus(AuthPolicy.CODE_TTL), now);
        mail.sendCode(pending.getEmail(), code);
    }

    public AuthPrincipal signIn(String rawEmail, String password) {
        if (password.getBytes(StandardCharsets.UTF_8).length > AuthPolicy.PASSWORD_MAX_BYTES)
            throw new AuthException(AuthError.INVALID_CREDENTIALS);
        UserAccount user = users.findByEmailForUpdate(normalize(rawEmail)).orElse(null);
        if (user == null) {
            passwords.matches(password, dummyHash);
            throw new AuthException(AuthError.INVALID_CREDENTIALS);
        }
        Instant now = clock.instant();
        if (user.getLockedUntil() != null && user.getLockedUntil().isAfter(now)) {
            throw new AuthException(
                    AuthError.RATE_LIMITED, secondsRemaining(user.getLockedUntil()));
        }
        if (!passwords.matches(password, user.getPasswordHash())) {
            int attempts = user.getLockedUntil() != null ? 1 : user.getFailedLogins() + 1;
            user.recordFailedLogin(
                    attempts,
                    attempts >= AuthPolicy.MAX_FAILED_ATTEMPTS
                            ? now.plus(AuthPolicy.LOGIN_LOCK)
                            : null);
            throw new AuthException(AuthError.INVALID_CREDENTIALS);
        }
        user.clearFailedLogins();
        return principal(user);
    }

    public void requestReset(String rawEmail) {
        UserAccount user = users.findByEmailForUpdate(normalize(rawEmail)).orElse(null);
        if (user == null || user.getResetSentAt() != null && remaining(user.getResetSentAt()) > 0)
            return;
        byte[] bytes = new byte[AuthPolicy.RESET_TOKEN_BYTES];
        random.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        Instant now = clock.instant();
        user.requestReset(Hashing.sha256(token), now.plus(AuthPolicy.RESET_TTL), now);
        // The fragment is read by the UI and never sent to the HTTP server or in Referer.
        mail.sendReset(user.getEmail(), token);
    }

    public void resetPassword(String token, String password) {
        checkPassword(password);
        UserAccount user = users.findByResetTokenHashForUpdate(Hashing.sha256(token)).orElse(null);
        if (user == null
                || user.getResetExpiresAt() == null
                || !user.getResetExpiresAt().isAfter(clock.instant())) {
            throw new AuthException(AuthError.EXPIRED_CODE);
        }
        user.resetPassword(passwords.encode(password));
    }

    @Transactional(readOnly = true)
    public boolean sessionValid(AuthPrincipal principal) {
        return users.existsByIdAndCredentialsVersion(
                principal.id(), principal.credentialsVersion());
    }

    private EmailVerification pending(String email, UUID challengeId) {
        if (challengeId == null) throw new AuthException(AuthError.INVALID_CODE);
        return verifications
                .findByEmail(email)
                .filter(p -> challengeId.equals(p.getChallengeId()))
                .orElseThrow(() -> new AuthException(AuthError.INVALID_CODE));
    }

    private AuthPrincipal principal(UserAccount user) {
        return new AuthPrincipal(user.getId(), user.getEmail(), user.getCredentialsVersion());
    }

    private int remaining(Instant sentAt) {
        return secondsRemaining(sentAt.plusSeconds(AuthPolicy.RESEND_COOLDOWN_SECONDS));
    }

    private int secondsRemaining(Instant deadline) {
        long millis = Math.max(0, Duration.between(clock.instant(), deadline).toMillis());
        return Math.toIntExact(Math.ceilDiv(millis, Duration.ofSeconds(1).toMillis()));
    }

    private void checkPassword(String password) {
        if (password.length() < AuthPolicy.PASSWORD_MIN_LENGTH
                || password.getBytes(StandardCharsets.UTF_8).length > AuthPolicy.PASSWORD_MAX_BYTES)
            throw new AuthException(AuthError.INVALID_INPUT);
    }
}
