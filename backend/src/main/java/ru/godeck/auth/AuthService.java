package ru.godeck.auth;

import com.fasterxml.jackson.annotation.JsonInclude;

import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import ru.godeck.auth.persistence.EmailVerification;
import ru.godeck.auth.persistence.EmailVerificationRepository;
import ru.godeck.auth.persistence.UserAccount;
import ru.godeck.auth.persistence.UserAccountRepository;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

@Service
@Transactional(noRollbackFor = AuthException.class)
public class AuthService {
    private static final Duration CODE_TTL = Duration.ofMinutes(10);
    private static final Duration RESET_TTL = Duration.ofMinutes(30);
    private static final Duration LOGIN_LOCK = Duration.ofMinutes(15);
    private static final int COOLDOWN = 60;
    private static final int MAX_ATTEMPTS = 5;
    private final UserAccountRepository users;
    private final EmailVerificationRepository verifications;
    private final PasswordEncoder passwords;
    private final AuthMailService mail;
    private final Clock clock;
    private final SecureRandom random = new SecureRandom();
    private final String dummyHash;

    public AuthService(
            UserAccountRepository users,
            EmailVerificationRepository verifications,
            PasswordEncoder passwords,
            AuthMailService mail,
            Clock clock) {
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
    public Identification identify(String rawEmail, UUID challengeId) {
        String email = normalize(rawEmail);
        if (users.existsByEmail(email)) return new Identification("password", null);
        return verifications
                .findByEmailAndChallengeId(email, challengeId)
                .map(
                        p ->
                                new Identification(
                                        "verify",
                                        Map.of(
                                                "codeLength",
                                                6,
                                                "resendAfterSeconds",
                                                remaining(p.getSentAt()))))
                .orElseGet(() -> new Identification("create-password", null));
    }

    public UUID register(String rawEmail, String password) {
        String email = normalize(rawEmail);
        checkPassword(password);
        if (users.existsByEmail(email))
            throw new AuthException("invalid-input", HttpStatus.CONFLICT);
        Instant now = clock.instant();
        UUID challengeId = UUID.randomUUID();
        String code = newCode();
        int changed =
                verifications.upsertRegistration(
                        email,
                        challengeId,
                        passwords.encode(password),
                        passwords.encode(code),
                        now,
                        now.plus(CODE_TTL),
                        now.minusSeconds(COOLDOWN));
        if (changed == 0)
            throw new AuthException("rate-limited", HttpStatus.TOO_MANY_REQUESTS, COOLDOWN);
        mail.sendCode(email, code);
        return challengeId;
    }

    public AuthPrincipal verify(String rawEmail, String code, UUID challengeId) {
        EmailVerification pending = pending(normalize(rawEmail), challengeId);
        if (pending.getAttempts() >= MAX_ATTEMPTS)
            throw new AuthException("too-many-attempts", HttpStatus.TOO_MANY_REQUESTS);
        if (!pending.getExpiresAt().isAfter(clock.instant()))
            throw new AuthException("expired-code", HttpStatus.BAD_REQUEST);
        if (!passwords.matches(code, pending.getCodeHash())) {
            pending.recordFailedAttempt();
            boolean locked = pending.getAttempts() >= MAX_ATTEMPTS;
            // AuthException deliberately commits counters; SMTP/DB failures still roll back.
            throw new AuthException(
                    locked ? "too-many-attempts" : "invalid-code",
                    locked ? HttpStatus.TOO_MANY_REQUESTS : HttpStatus.BAD_REQUEST);
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
        if (remaining > 0)
            throw new AuthException("rate-limited", HttpStatus.TOO_MANY_REQUESTS, remaining);
        String code = newCode();
        Instant now = clock.instant();
        pending.resend(passwords.encode(code), now.plus(CODE_TTL), now);
        mail.sendCode(pending.getEmail(), code);
    }

    public AuthPrincipal signIn(String rawEmail, String password) {
        if (password.getBytes(StandardCharsets.UTF_8).length > 72)
            throw new AuthException("invalid-credentials", HttpStatus.UNAUTHORIZED);
        UserAccount user = users.findByEmailForUpdate(normalize(rawEmail)).orElse(null);
        if (user == null) {
            passwords.matches(password, dummyHash);
            throw new AuthException("invalid-credentials", HttpStatus.UNAUTHORIZED);
        }
        Instant now = clock.instant();
        if (user.getLockedUntil() != null && user.getLockedUntil().isAfter(now)) {
            throw new AuthException(
                    "rate-limited",
                    HttpStatus.TOO_MANY_REQUESTS,
                    (int) Duration.between(now, user.getLockedUntil()).toSeconds() + 1);
        }
        if (!passwords.matches(password, user.getPasswordHash())) {
            int attempts = user.getLockedUntil() != null ? 1 : user.getFailedLogins() + 1;
            user.recordFailedLogin(
                    attempts, attempts >= MAX_ATTEMPTS ? now.plus(LOGIN_LOCK) : null);
            throw new AuthException("invalid-credentials", HttpStatus.UNAUTHORIZED);
        }
        user.clearFailedLogins();
        return principal(user);
    }

    public void requestReset(String rawEmail) {
        UserAccount user = users.findByEmailForUpdate(normalize(rawEmail)).orElse(null);
        if (user == null || user.getResetSentAt() != null && remaining(user.getResetSentAt()) > 0)
            return;
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        Instant now = clock.instant();
        user.requestReset(sha256(token), now.plus(RESET_TTL), now);
        // The fragment is read by the UI and never sent to the HTTP server or in Referer.
        mail.sendReset(user.getEmail(), token);
    }

    public void resetPassword(String token, String password) {
        checkPassword(password);
        UserAccount user = users.findByResetTokenHashForUpdate(sha256(token)).orElse(null);
        if (user == null
                || user.getResetExpiresAt() == null
                || !user.getResetExpiresAt().isAfter(clock.instant())) {
            throw new AuthException("expired-code", HttpStatus.BAD_REQUEST);
        }
        user.resetPassword(passwords.encode(password));
    }

    @Transactional(readOnly = true)
    public boolean sessionValid(AuthPrincipal principal) {
        return users.existsByIdAndCredentialsVersion(
                principal.id(), principal.credentialsVersion());
    }

    private EmailVerification pending(String email, UUID challengeId) {
        if (challengeId == null) throw new AuthException("invalid-code", HttpStatus.BAD_REQUEST);
        return verifications
                .findForUpdate(email, challengeId)
                .orElseThrow(() -> new AuthException("invalid-code", HttpStatus.BAD_REQUEST));
    }

    private AuthPrincipal principal(UserAccount user) {
        return new AuthPrincipal(user.getId(), user.getEmail(), user.getCredentialsVersion());
    }

    private int remaining(Instant sentAt) {
        long millis = Duration.between(clock.instant(), sentAt.plusSeconds(COOLDOWN)).toMillis();
        return (int) Math.max(0, (millis + 999) / 1000);
    }

    private void checkPassword(String password) {
        if (password.length() < 8 || password.getBytes(StandardCharsets.UTF_8).length > 72)
            throw new AuthException("invalid-input", HttpStatus.BAD_REQUEST);
    }

    private String newCode() {
        return String.format(Locale.ROOT, "%06d", random.nextInt(1_000_000));
    }

    private static String sha256(String value) {
        try {
            return HexFormat.of()
                    .formatHex(
                            MessageDigest.getInstance("SHA-256")
                                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Identification(String step, Map<String, Integer> challenge) {}
}
